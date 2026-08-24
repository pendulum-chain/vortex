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
  AuthService.initializeAcceptedIdentitySnapshots();
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
    }) as typeof fetch;

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
    globalThis.fetch = (async () => new Response(null, { status: 401 })) as typeof fetch;

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

    globalThis.fetch = (async (_input, init) => {
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
    }) as typeof fetch;

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
    }) as typeof fetch;

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
    }) as typeof fetch;

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
      userId: "user-2",
    });
  });
});

describe("AuthService impersonation session", () => {
  it("stores the complete session in one atomic dashboard key", () => {
    AuthService.storeImpersonationSession({
      expiresAt: "2026-01-01T00:00:00.000Z",
      sessionId: "session-1",
      targetEmail: "customer@example.com",
      targetProfileId: "customer-1",
      token: "vtx_imp_abc123",
    });

    const impersonationKeys = [...values.keys()].filter((key) =>
      key.includes("impersonation"),
    );
    assert.deepEqual(impersonationKeys, [
      AuthService.IMPERSONATION_STORAGE_KEY,
    ]);
  });

  it("rejects malformed or incomplete atomic session records", () => {
    values.set(AuthService.IMPERSONATION_STORAGE_KEY, "not-json");
    assert.equal(AuthService.getImpersonationSession(), null);

    values.set(
      AuthService.IMPERSONATION_STORAGE_KEY,
      JSON.stringify({ sessionId: "session-1", token: "vtx_imp_abc123" }),
    );
    assert.equal(AuthService.getImpersonationSession(), null);
  });

  it("rejects a legacy session without a bearer profile and removes its keys on the next write", () => {
    values.set("vortex_dashboard_impersonation_token", "vtx_imp_legacy");
    values.set("vortex_dashboard_impersonation_session_id", "legacy-session");
    values.set(
      "vortex_dashboard_impersonation_expires_at",
      "2026-01-01T00:00:00.000Z",
    );
    values.set(
      "vortex_dashboard_impersonation_target_email",
      "legacy@example.com",
    );

    assert.equal(AuthService.getImpersonationSession(), null);

    AuthService.storeImpersonationSession({
      expiresAt: "2026-02-01T00:00:00.000Z",
      sessionId: "session-2",
      targetEmail: "current@example.com",
      targetProfileId: "customer-2",
      token: "vtx_imp_current",
    });
    assert.equal(values.has("vortex_dashboard_impersonation_token"), false);
    assert.equal(
      values.has("vortex_dashboard_impersonation_session_id"),
      false,
    );
    assert.equal(
      values.has("vortex_dashboard_impersonation_expires_at"),
      false,
    );
    assert.equal(
      values.has("vortex_dashboard_impersonation_target_email"),
      false,
    );
  });

  it("prefers the impersonation token over the operator's own access token", () => {
    assert.equal(AuthService.getEffectiveAccessToken(), "expired-access-token");

    AuthService.storeImpersonationSession({
      expiresAt: "2026-01-01T00:00:00.000Z",
      sessionId: "session-1",
      targetEmail: "customer@example.com",
      targetProfileId: "customer-1",
      token: "vtx_imp_abc123",
    });

    assert.equal(AuthService.getEffectiveAccessToken(), "vtx_imp_abc123");
    assert.deepEqual(AuthService.getImpersonationSession(), {
      expiresAt: "2026-01-01T00:00:00.000Z",
      sessionId: "session-1",
      targetEmail: "customer@example.com",
      targetProfileId: "customer-1",
      token: "vtx_imp_abc123",
    });
  });

  it("falls back to the operator's own token once the impersonation session is cleared", () => {
    AuthService.storeImpersonationSession({
      expiresAt: "2026-01-01T00:00:00.000Z",
      sessionId: "session-1",
      targetEmail: "customer@example.com",
      targetProfileId: "customer-1",
      token: "vtx_imp_abc123",
    });

    AuthService.clearImpersonationSession();

    assert.equal(AuthService.getImpersonationSession(), null);
    assert.equal(AuthService.getEffectiveAccessToken(), "expired-access-token");
    // The operator's own session must be untouched by entering/exiting impersonation.
    assert.deepEqual(AuthService.getTokens(), {
      accessToken: "expired-access-token",
      refreshToken: "refresh-token",
      userEmail: "e2e@vortex.local",
      userId: "user-1",
    });
  });

  it("clears both operator and impersonation credentials on sign-out", () => {
    AuthService.storeImpersonationSession({
      expiresAt: "2026-01-01T00:00:00.000Z",
      sessionId: "session-1",
      targetEmail: "customer@example.com",
      targetProfileId: "customer-1",
      token: "vtx_imp_abc123",
    });

    AuthService.signOut();

    assert.equal(AuthService.getTokens(), null);
    assert.equal(AuthService.getImpersonationSession(), null);
  });
});

describe("AuthService managed profile selection", () => {
  it("binds a persisted selection to the effective bearer profile", () => {
    AuthService.storeManagedProfileSelection({
      customerType: "business",
      externalSubjectId: "merchant-42",
      managerProfileId: "user-1",
      targetEmail: "child@example.com",
      targetProfileId: "child-1",
    });

    assert.equal(AuthService.getEffectiveBearerProfileId(), "user-1");
    assert.equal(AuthService.getEffectiveProfileId(), "child-1");

    AuthService.storeTokens({
      accessToken: "other-access-token",
      refreshToken: "other-refresh-token",
      userId: "user-2",
    });

    assert.equal(AuthService.getManagedProfileSelection(), null);
    assert.equal(AuthService.getEffectiveProfileId(), "user-2");
  });

  it("compare-and-clears only the selection captured by a caller", () => {
    AuthService.storeManagedProfileSelection({
      customerType: "individual",
      externalSubjectId: "first",
      managerProfileId: "user-1",
      targetEmail: "first@example.com",
      targetProfileId: "child-1",
    });
    const staleSnapshot = AuthService.getManagedProfileSelectionSnapshot();
    AuthService.storeManagedProfileSelection({
      customerType: "individual",
      externalSubjectId: "second",
      managerProfileId: "user-1",
      targetEmail: "second@example.com",
      targetProfileId: "child-2",
    });

    assert.equal(AuthService.clearManagedProfileSelection(staleSnapshot ?? undefined), false);
    assert.equal(AuthService.getManagedProfileSelection()?.targetProfileId, "child-2");
  });

  it("restores the effective managed owner from the accepted persisted selection", () => {
    AuthService.storeManagedProfileSelection({
      customerType: "business",
      externalSubjectId: "merchant-42",
      managerProfileId: "user-1",
      targetEmail: "child@example.com",
      targetProfileId: "child-1"
    });

    assert.equal(AuthService.getEffectiveProfileId(), "child-1");
  });
});
