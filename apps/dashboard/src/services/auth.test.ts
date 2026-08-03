import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { AuthService } from "./auth";

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
});
