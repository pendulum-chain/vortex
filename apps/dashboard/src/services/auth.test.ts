import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { AuthService } from "./auth";
import { startTokenRefresh } from "./tokenRefresh";

const originalFetch = globalThis.fetch;
const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const values = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  },
});

beforeEach(() => {
  values.clear();
  AuthService.storeTokens({
    accessToken: "expired-access-token",
    refreshToken: "refresh-token",
    userEmail: "e2e@vortex.local",
    userId: "user-1",
  });
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe("AuthService", () => {
  it("notifies subscribers for login, token refresh storage, and logout", () => {
    let notifications = 0;
    const unsubscribe = AuthService.subscribe(() => {
      notifications += 1;
    });
    const tokens = {
      accessToken: "access-one",
      refreshToken: "refresh-one",
      userId: "user-one"
    };

    AuthService.storeTokens(tokens);
    AuthService.storeTokens({ ...tokens, accessToken: "access-two" });
    AuthService.clearTokens();
    unsubscribe();
    AuthService.storeTokens(tokens);

    assert.equal(notifications, 3);
  });

  it("returns the current JWT to CDP while it remains fresh", async () => {
    const accessToken = "header.eyJleHAiOjQxMDI0NDQ4MDB9.signature";
    AuthService.storeTokens({ accessToken, refreshToken: "refresh", userId: "user" });

    assert.equal(await AuthService.getFreshAccessToken(), accessToken);
  });

  it("coalesces concurrent token refreshes across auth callers", async () => {
    let fetchCalls = 0;
    let releaseRequest: (() => void) | undefined;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });

    globalThis.fetch = (async () => {
      fetchCalls += 1;
      await requestGate;
      return new Response(
        JSON.stringify({
          access_token: "rotated-access-token",
          refresh_token: "rotated-refresh-token",
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    }) as unknown as typeof fetch;

    const proactiveRefresh = AuthService.refreshAccessToken();
    const requestRecoveryRefresh = AuthService.refreshAccessToken();
    releaseRequest?.();

    const [proactiveTokens, recoveryTokens] = await Promise.all([
      proactiveRefresh,
      requestRecoveryRefresh,
    ]);

    assert.equal(fetchCalls, 1);
    assert.deepEqual(proactiveTokens, recoveryTokens);
    assert.deepEqual(AuthService.getTokens(), {
      accessToken: "rotated-access-token",
      refreshToken: "rotated-refresh-token",
      userEmail: "e2e@vortex.local",
      userId: "user-1",
    });
  });

  it("clears the current session when its refresh token is rejected", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 401 })) as unknown as typeof fetch;

    assert.equal(await AuthService.refreshAccessToken(), null);
    assert.equal(AuthService.getTokens(), null);
  });

  it("does not let an old refresh flight overwrite a newer session", async () => {
    let oldRefreshRequests = 0;
    let newRefreshRequests = 0;
    let releaseOldRequest: (() => void) | undefined;
    const oldRequestGate = new Promise<void>((resolve) => {
      releaseOldRequest = resolve;
    });

    globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const body = JSON.parse(String(init?.body)) as { refresh_token: string };
      if (body.refresh_token === "refresh-token") {
        oldRefreshRequests += 1;
        await oldRequestGate;
        return new Response(
          JSON.stringify({
            access_token: "stale-access-token",
            refresh_token: "stale-refresh-token",
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        );
      }

      newRefreshRequests += 1;
      return new Response(
        JSON.stringify({
          access_token: "new-rotated-access-token",
          refresh_token: "new-rotated-refresh-token",
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    }) as unknown as typeof fetch;

    const oldRefresh = AuthService.refreshAccessToken();
    AuthService.storeTokens({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      userEmail: "new@vortex.local",
      userId: "user-2",
    });
    const newRefresh = AuthService.refreshAccessToken();

    assert.deepEqual(await newRefresh, {
      accessToken: "new-rotated-access-token",
      refreshToken: "new-rotated-refresh-token",
      userEmail: "new@vortex.local",
      userId: "user-2",
    });
    releaseOldRequest?.();
    assert.deepEqual(await oldRefresh, {
      accessToken: "new-rotated-access-token",
      refreshToken: "new-rotated-refresh-token",
      userEmail: "new@vortex.local",
      userId: "user-2",
    });
    assert.equal(oldRefreshRequests, 1);
    assert.equal(newRefreshRequests, 1);
    assert.deepEqual(AuthService.getTokens(), {
      accessToken: "new-rotated-access-token",
      refreshToken: "new-rotated-refresh-token",
      userEmail: "new@vortex.local",
      userId: "user-2",
    });
  });

  it("does not let a stale 401 clear a newer session", async () => {
    let releaseRequest: (() => void) | undefined;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });

    globalThis.fetch = (async () => {
      await requestGate;
      return new Response(null, { status: 401 });
    }) as unknown as typeof fetch;

    const oldRefresh = AuthService.refreshAccessToken();
    AuthService.storeTokens({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      userEmail: "new@vortex.local",
      userId: "user-2",
    });
    releaseRequest?.();

    assert.deepEqual(await oldRefresh, {
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      userEmail: "new@vortex.local",
      userId: "user-2",
    });
    assert.deepEqual(AuthService.getTokens(), {
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      userEmail: "new@vortex.local",
      userId: "user-2",
    });
  });

  it("keeps a replacement session when a proactive refresh is superseded", async () => {
    let invalidated = false;
    let releaseRequest: (() => void) | undefined;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    const timers: Array<() => void | Promise<void>> = [];

    globalThis.fetch = (async () => {
      await requestGate;
      return new Response(null, { status: 401 });
    }) as unknown as typeof fetch;

    startTokenRefresh({
      getExpiryMs: () => 60_000,
      now: () => 0,
      onInvalid: () => {
        invalidated = true;
        AuthService.signOut();
      },
      refresh: () => AuthService.refreshAccessToken(),
      setTimer: (callback) => {
        timers.push(callback);
        return callback as unknown as ReturnType<typeof setTimeout>;
      },
    });

    const proactiveRefresh = timers.shift()?.();
    AuthService.storeTokens({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      userEmail: "new@vortex.local",
      userId: "user-2",
    });
    releaseRequest?.();
    await proactiveRefresh;

    assert.equal(invalidated, false);
    assert.equal(timers.length, 1);
    assert.deepEqual(AuthService.getTokens(), {
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      userEmail: "new@vortex.local",
      userId: "user-2"
    });
  });
});
