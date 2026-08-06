import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { AuthService } from "@/services/auth";
import { apiClient, isApiError } from "./api-client";

const originalFetch = globalThis.fetch;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const values = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  }
});

// apiFetch resolves relative URLs against window.location.origin; bun's test runner has no DOM.
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { location: { origin: "http://localhost" } }
});

beforeEach(() => {
  values.clear();
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("apiFetch while impersonating", () => {
  beforeEach(() => {
    AuthService.storeTokens({
      accessToken: "operator-access-token",
      refreshToken: "operator-refresh-token",
      userEmail: "operator@vortex.fi",
      userId: "operator-1"
    });
    AuthService.storeImpersonationSession({
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      sessionId: "session-1",
      targetEmail: "customer@example.com",
      token: "vtx_imp_abc123"
    });
  });

  it("authorizes requests with the impersonation token, not the operator's token", async () => {
    let authorization: string | undefined;
    globalThis.fetch = (async (_input, init) => {
      authorization = (init?.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" }, status: 200 });
    }) as typeof fetch;

    await apiClient.get("/ping");

    assert.equal(authorization, "Bearer vtx_imp_abc123");
  });

  it("does not attempt a token refresh on 401 and clears the impersonation session instead", async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async (input) => {
      fetchCalls += 1;
      // A refresh attempt would hit /v1/auth/refresh — assert it never happens.
      assert.doesNotMatch(String(input), /\/auth\/refresh/);
      return new Response(null, { status: 401 });
    }) as typeof fetch;

    await assert.rejects(() => apiClient.get("/ping"), error => isApiError(error) && error.status === 401);

    assert.equal(fetchCalls, 1);
    assert.equal(AuthService.getImpersonationSession(), null);
    // The operator's own tokens must stay untouched.
    assert.equal(AuthService.getTokens()?.accessToken, "operator-access-token");
  });
});

describe("apiFetch without impersonation", () => {
  beforeEach(() => {
    AuthService.storeTokens({
      accessToken: "expired-access-token",
      refreshToken: "refresh-token",
      userEmail: "e2e@vortex.local",
      userId: "user-1"
    });
  });

  it("still retries once via token refresh on a 401", async () => {
    let refreshCalled = false;
    let secondRequestToken: string | undefined;
    let call = 0;

    globalThis.fetch = (async (input, init) => {
      call += 1;
      if (String(input).includes("/auth/refresh")) {
        refreshCalled = true;
        return new Response(
          JSON.stringify({ access_token: "rotated-access-token", refresh_token: "rotated-refresh-token" }),
          { headers: { "Content-Type": "application/json" }, status: 200 }
        );
      }
      if (call === 1) {
        return new Response(null, { status: 401 });
      }
      secondRequestToken = (init?.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" }, status: 200 });
    }) as typeof fetch;

    await apiClient.get("/ping");

    assert.equal(refreshCalled, true);
    assert.equal(secondRequestToken, "Bearer rotated-access-token");
  });
});
