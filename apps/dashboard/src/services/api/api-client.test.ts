import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { AuthService } from "@/services/auth";
import { apiClient, isApiError, setManagedProfileAccessDeniedHandler } from "./api-client";

const originalFetch = globalThis.fetch;
const originalGetAcceptedImpersonationSessionSnapshot = AuthService.getAcceptedImpersonationSessionSnapshot;
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
  AuthService.initializeAcceptedIdentitySnapshots();
  AuthService.getAcceptedImpersonationSessionSnapshot = originalGetAcceptedImpersonationSessionSnapshot;
  setManagedProfileAccessDeniedHandler(undefined);
});

after(() => {
  globalThis.fetch = originalFetch;
  AuthService.getAcceptedImpersonationSessionSnapshot = originalGetAcceptedImpersonationSessionSnapshot;
  setManagedProfileAccessDeniedHandler(undefined);
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
      targetProfileId: "customer-1",
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

  it("does not let caller headers override trusted identity headers", async () => {
    AuthService.storeManagedProfileSelection({
      customerType: "business",
      externalSubjectId: "merchant-42",
      managerProfileId: "customer-1",
      targetEmail: "child@example.com",
      targetProfileId: "child-1"
    });
    let headers: Record<string, string> | undefined;
    globalThis.fetch = (async (_input, init) => {
      headers = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" }, status: 200 });
    }) as typeof fetch;

    await apiClient.post("/ping", undefined, {
      headers: { authorization: "Bearer attacker", "X-Managed-Profile-Id": "attacker-profile", "X-Request-Id": "request-1" },
      managedProfile: true
    });

    assert.equal(headers?.Authorization, "Bearer vtx_imp_abc123");
    assert.equal(headers?.["X-Managed-Profile-Id"], "child-1");
    assert.equal(headers?.["X-Request-Id"], "request-1");
    assert.equal(headers?.authorization, undefined);
  });

  it("uses one impersonation snapshot for authorization and 401 handling", async () => {
    const activeSnapshot = AuthService.getAcceptedImpersonationSessionSnapshot();
    let snapshotReads = 0;
    AuthService.getAcceptedImpersonationSessionSnapshot = (() => {
      snapshotReads += 1;
      return snapshotReads === 1 ? activeSnapshot : null;
    }) as typeof AuthService.getAcceptedImpersonationSessionSnapshot;
    let authorization: string | undefined;
    globalThis.fetch = (async (_input, init) => {
      authorization = (init?.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" }, status: 200 });
    }) as typeof fetch;

    await apiClient.get("/ping");

    assert.equal(snapshotReads, 1);
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

  it("does not clear a newer impersonation session after a stale 401", async () => {
    const newerSession = {
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      sessionId: "session-2",
      targetEmail: "new@example.com",
      targetProfileId: "customer-2",
      token: "vtx_imp_new"
    };
    globalThis.fetch = (async () => {
      AuthService.storeImpersonationSession(newerSession);
      return new Response(null, { status: 401 });
    }) as typeof fetch;

    await assert.rejects(() => apiClient.get("/ping"), error => isApiError(error) && error.status === 401);

    assert.deepEqual(AuthService.getImpersonationSession(), newerSession);
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

  it("adds a valid managed profile only when the request explicitly opts in", async () => {
    AuthService.storeManagedProfileSelection({
      customerType: "business",
      externalSubjectId: "merchant-42",
      managerProfileId: "user-1",
      targetEmail: "child@example.com",
      targetProfileId: "child-1"
    });
    const headers: Array<Record<string, string>> = [];
    globalThis.fetch = (async (_input, init) => {
      headers.push(init?.headers as Record<string, string>);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" }, status: 200 });
    }) as typeof fetch;

    await apiClient.get("/delegated", { managedProfile: true });
    await apiClient.get("/manager-only");

    assert.equal(headers[0]?.["X-Managed-Profile-Id"], "child-1");
    assert.equal(headers[1]?.["X-Managed-Profile-Id"], undefined);
  });

  it("preserves the captured managed profile header on a 401 refresh retry", async () => {
    AuthService.storeManagedProfileSelection({
      customerType: "business",
      externalSubjectId: "merchant-42",
      managerProfileId: "user-1",
      targetEmail: "child@example.com",
      targetProfileId: "child-1"
    });
    const requestHeaders: Array<Record<string, string>> = [];
    globalThis.fetch = (async (input, init) => {
      if (String(input).includes("/auth/refresh")) {
        AuthService.storeManagedProfileSelection({
          customerType: "business",
          externalSubjectId: "merchant-43",
          managerProfileId: "user-1",
          targetEmail: "new-child@example.com",
          targetProfileId: "child-2"
        });
        return new Response(JSON.stringify({ access_token: "rotated", refresh_token: "rotated-refresh" }), {
          headers: { "Content-Type": "application/json" },
          status: 200
        });
      }
      requestHeaders.push(init?.headers as Record<string, string>);
      return requestHeaders.length === 1
        ? new Response(null, { status: 401 })
        : new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" }, status: 200 });
    }) as typeof fetch;

    await apiClient.get("/delegated", { managedProfile: true });

    assert.equal(requestHeaders[0]?.["X-Managed-Profile-Id"], "child-1");
    assert.equal(requestHeaders[1]?.["X-Managed-Profile-Id"], "child-1");
  });

  it("uses the tab-accepted selection instead of an unaccepted storage change", async () => {
    AuthService.storeManagedProfileSelection({
      customerType: "business",
      externalSubjectId: "merchant-42",
      managerProfileId: "user-1",
      targetEmail: "accepted@example.com",
      targetProfileId: "child-1"
    });
    values.set(
      AuthService.MANAGED_PROFILE_STORAGE_KEY,
      JSON.stringify({
        customerType: "business",
        externalSubjectId: "merchant-43",
        managerProfileId: "user-1",
        targetEmail: "unaccepted@example.com",
        targetProfileId: "child-2"
      })
    );
    let managedProfileId: string | undefined;
    globalThis.fetch = (async (_input, init) => {
      managedProfileId = (init?.headers as Record<string, string>)["X-Managed-Profile-Id"];
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" }, status: 200 });
    }) as typeof fetch;

    await apiClient.get("/delegated", { managedProfile: true });

    assert.equal(managedProfileId, "child-1");
  });

  it("clears only the stale selection on managed access denial and never retries without the header", async () => {
    AuthService.storeManagedProfileSelection({
      customerType: "business",
      externalSubjectId: "merchant-42",
      managerProfileId: "user-1",
      targetEmail: "child@example.com",
      targetProfileId: "child-1"
    });
    let calls = 0;
    globalThis.fetch = (async (_input, init) => {
      calls += 1;
      assert.equal((init?.headers as Record<string, string>)["X-Managed-Profile-Id"], "child-1");
      return new Response(JSON.stringify({ error: { code: "MANAGED_PROFILE_ACCESS_DENIED", message: "denied" } }), {
        headers: { "Content-Type": "application/json" },
        status: 403
      });
    }) as typeof fetch;

    await assert.rejects(() => apiClient.get("/delegated", { managedProfile: true }), error => isApiError(error) && error.status === 403);

    assert.equal(calls, 1);
    assert.equal(AuthService.getManagedProfileSelection(), null);
  });

  it("runs access-denied handling while the stale child selection is still active", async () => {
    AuthService.storeManagedProfileSelection({
      customerType: "business",
      externalSubjectId: "merchant-42",
      managerProfileId: "user-1",
      targetEmail: "child@example.com",
      targetProfileId: "child-1"
    });
    const selectionSnapshot = AuthService.getAcceptedManagedProfileSelectionSnapshot();
    let handled = false;
    setManagedProfileAccessDeniedHandler(snapshot => {
      assert.equal(snapshot, selectionSnapshot);
      assert.equal(AuthService.getManagedProfileSelection()?.targetProfileId, "child-1");
      handled = AuthService.clearManagedProfileSelection(snapshot);
      return handled;
    });
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: "MANAGED_PROFILE_ACCESS_DENIED", message: "denied" } }), {
        headers: { "Content-Type": "application/json" },
        status: 403
      })) as typeof fetch;

    await assert.rejects(() => apiClient.get("/delegated", { managedProfile: true }), error => isApiError(error));

    assert.equal(handled, true);
    assert.equal(AuthService.getManagedProfileSelection(), null);
  });
});
