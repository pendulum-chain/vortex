import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import type { ImpersonationSession } from "@/services/auth";

const originalFetch = globalThis.fetch;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const values = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  }
});

let accountStateClears = 0;
let identityChangeAllowed = true;
let activatedOwner: string | null = null;

const { AuthService } = await import("@/services/auth");
const { applyStoredImpersonationForTests, enterImpersonation, exitImpersonation } = await import("./impersonation.store");
function configureIdentityEffects(): void {
  AuthService.configureIdentityTransitionEffects({
    activateTransferOwner: (ownerProfileId: string) => {
      activatedOwner = ownerProfileId;
      return true;
    },
    canChangeEffectiveIdentity: () => identityChangeAllowed,
    clearAccountState: () => {
      accountStateClears += 1;
    }
  });
}

function session(overrides: Partial<ImpersonationSession> = {}): ImpersonationSession {
  return {
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    sessionId: "session-1",
    targetEmail: "target@example.com",
    targetProfileId: "target-1",
    token: "vtx_imp_token-1",
    ...overrides
  };
}

function dispatchStorage(key: string | null): void {
  if (key === null || key === AuthService.IMPERSONATION_STORAGE_KEY) applyStoredImpersonationForTests();
}

beforeEach(() => {
  configureIdentityEffects();
  values.clear();
  identityChangeAllowed = true;
  AuthService.initializeAcceptedIdentitySnapshots();
  dispatchStorage(AuthService.IMPERSONATION_STORAGE_KEY);
  accountStateClears = 0;
  activatedOwner = null;
  globalThis.fetch = (() => Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch;
});

after(() => {
  AuthService.configureIdentityTransitionEffects();
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe("impersonation session transitions", () => {
  it("persists an entered identity and clears account-scoped state", () => {
    const entered = session();

    enterImpersonation(entered);

    assert.deepEqual(AuthService.getImpersonationSession(), entered);
    assert.equal(accountStateClears, 1);
    assert.equal(activatedOwner, "target-1");
  });

  it("does not mutate identity when the transfer guard blocks the transition", () => {
    identityChangeAllowed = false;

    assert.equal(enterImpersonation(session()), false);

    assert.equal(AuthService.getImpersonationSession(), null);
    assert.equal(accountStateClears, 0);
  });

  it("exits locally without waiting for the server revocation", async () => {
    let releaseRequest: (() => void) | undefined;
    let requestCount = 0;
    let lastRequest = "";
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      requestCount += 1;
      lastRequest = `${init?.method ?? "GET"} ${input instanceof URL ? input.pathname : String(input)}`;
      return new Promise<Response>(resolve => {
        releaseRequest = () => resolve(new Response(null, { status: 204 }));
      });
    }) as typeof fetch;

    enterImpersonation(session());
    exitImpersonation();

    assert.equal(requestCount, 1);
    assert.match(lastRequest, /^DELETE .*\/admin-console\/impersonation\/session-1$/);
    assert.equal(AuthService.getImpersonationSession(), null);
    assert.equal(accountStateClears, 2);

    releaseRequest?.();
    await Promise.resolve();
  });

  it("still exits locally when the revocation request fails", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;

    enterImpersonation(session());
    exitImpersonation();
    await Promise.resolve();

    assert.equal(AuthService.getImpersonationSession(), null);
    assert.equal(accountStateClears, 2);
  });

  it("does not call the server when there is no active session", () => {
    let called = false;
    globalThis.fetch = (() => {
      called = true;
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;

    exitImpersonation();

    assert.equal(called, false);
    assert.equal(accountStateClears, 0);
  });

  it("clears account state when the API client drops a rejected session", () => {
    enterImpersonation(session());
    accountStateClears = 0;

    AuthService.clearImpersonationSession();

    assert.equal(AuthService.getImpersonationSession(), null);
    assert.equal(accountStateClears, 1);
  });

  it("adopts another tab's session and clears the prior account cache", () => {
    const fromOtherTab = session({ sessionId: "session-2", token: "vtx_imp_token-2" });
    values.set(AuthService.IMPERSONATION_STORAGE_KEY, JSON.stringify(fromOtherTab));

    dispatchStorage(AuthService.IMPERSONATION_STORAGE_KEY);

    assert.deepEqual(AuthService.getImpersonationSession(), fromOtherTab);
    assert.equal(accountStateClears, 1);
  });

  it("restores the accepted session when a cross-tab change is blocked", () => {
    const accepted = session();
    enterImpersonation(accepted);
    accountStateClears = 0;
    identityChangeAllowed = false;
    values.set(AuthService.IMPERSONATION_STORAGE_KEY, JSON.stringify(session({ sessionId: "session-2", token: "new-token" })));

    dispatchStorage(AuthService.IMPERSONATION_STORAGE_KEY);

    assert.deepEqual(AuthService.getImpersonationSession(), accepted);
    assert.deepEqual(AuthService.parseImpersonationSessionSnapshot(values.get(AuthService.IMPERSONATION_STORAGE_KEY) ?? null), accepted);
    assert.equal(accountStateClears, 0);
  });

  it("clears the session and account cache when another tab exits", () => {
    enterImpersonation(session());
    accountStateClears = 0;
    values.delete(AuthService.IMPERSONATION_STORAGE_KEY);

    dispatchStorage(AuthService.IMPERSONATION_STORAGE_KEY);

    assert.equal(AuthService.getImpersonationSession(), null);
    assert.equal(accountStateClears, 1);
  });

  it("does not clear account state for an unchanged storage event", () => {
    const current = session();
    enterImpersonation(current);
    accountStateClears = 0;

    dispatchStorage(AuthService.IMPERSONATION_STORAGE_KEY);

    assert.deepEqual(AuthService.getImpersonationSession(), current);
    assert.equal(accountStateClears, 0);
  });
});
