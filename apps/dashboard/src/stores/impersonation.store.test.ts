import { mock } from "bun:test";
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import type { ImpersonationSession } from "@/services/auth";

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

// auth.store transitively boots wagmi -> appkit -> lit-html -> sonner, none of which survive a
// stubbed DOM. Only `clearAccountState` matters here, and counting its calls is precisely the
// invariant under test: no cached data from one identity may survive into the other.
let accountStateClears = 0;
mock.module("@/stores/auth.store", () => ({
  clearAccountState: () => {
    accountStateClears += 1;
  }
}));

// Imported only after the shims above: the store reads storage at module-evaluation time.
const { AuthService } = await import("@/services/auth");
const { useImpersonationStore } = await import("./impersonation.store");

function session(overrides: Partial<ImpersonationSession> = {}): ImpersonationSession {
  return {
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    sessionId: "session-1",
    targetEmail: "target@example.com",
    token: "vtx_imp_token-1",
    ...overrides
  };
}

beforeEach(() => {
  values.clear();
  accountStateClears = 0;
  useImpersonationStore.setState({ session: null });
  globalThis.fetch = (() => Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch;
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

describe("useImpersonationStore", () => {
  it("enter() persists the session so api-client picks it up on the next request", () => {
    const entered = session();

    useImpersonationStore.getState().enter(entered);

    assert.deepEqual(useImpersonationStore.getState().session, entered);
    assert.deepEqual(AuthService.getImpersonationSession(), entered);
    assert.equal(accountStateClears, 1);
  });

  it("exit() revokes the session server-side and clears it locally", async () => {
    let requestCount = 0;
    let lastRequest = "";
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      requestCount += 1;
      lastRequest = `${init?.method ?? "GET"} ${input instanceof URL ? input.pathname : String(input)}`;
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;

    useImpersonationStore.getState().enter(session());
    await useImpersonationStore.getState().exit();

    assert.equal(requestCount, 1);
    assert.match(lastRequest, /^DELETE .*\/admin-console\/impersonation\/session-1$/);
    assert.equal(useImpersonationStore.getState().session, null);
    assert.equal(AuthService.getImpersonationSession(), null);
    assert.equal(accountStateClears, 2);
  });

  it("exit() still drops the operator back into their own session when the revoke call fails", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;

    useImpersonationStore.getState().enter(session());
    await useImpersonationStore.getState().exit();

    // Best-effort by design: never strand the operator in someone else's session. The
    // server-side row may outlive this call, bounded by the 30-minute TTL.
    assert.equal(useImpersonationStore.getState().session, null);
    assert.equal(AuthService.getImpersonationSession(), null);
  });

  it("exit() is a no-op against the server when there is no active session", async () => {
    let called = false;
    globalThis.fetch = (() => {
      called = true;
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;

    await useImpersonationStore.getState().exit();

    assert.equal(called, false);
    assert.equal(useImpersonationStore.getState().session, null);
  });

  it("syncFromStorage() clears the store when api-client dropped the session on a 401", () => {
    useImpersonationStore.getState().enter(session());
    AuthService.clearImpersonationSession();

    useImpersonationStore.getState().syncFromStorage();

    assert.equal(useImpersonationStore.getState().session, null);
    assert.equal(accountStateClears, 2);
  });

  it("syncFromStorage() adopts a session started in another tab", () => {
    const fromOtherTab = session({ sessionId: "session-2", token: "vtx_imp_token-2" });
    AuthService.storeImpersonationSession(fromOtherTab);

    useImpersonationStore.getState().syncFromStorage();

    assert.deepEqual(useImpersonationStore.getState().session, fromOtherTab);
  });

  it("syncFromStorage() keeps the current session when storage still holds the same token", () => {
    const current = session();
    useImpersonationStore.getState().enter(current);
    const before = useImpersonationStore.getState().session;

    useImpersonationStore.getState().syncFromStorage();

    assert.equal(useImpersonationStore.getState().session, before);
  });
});
