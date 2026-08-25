import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { AuthService } from "@/services/auth";
import { AveniaService } from "./avenia.service";

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

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { location: { origin: "http://localhost" } }
});

beforeEach(() => {
  values.clear();
  AuthService.initializeAcceptedIdentitySnapshots();
  AuthService.storeTokens({
    accessToken: "manager-token",
    refreshToken: "manager-refresh-token",
    userEmail: "manager@example.com",
    userId: "manager-1"
  });
  AuthService.storeManagedProfileSelection({
    customerType: "business",
    externalSubjectId: "business-1",
    managerProfileId: "manager-1",
    targetEmail: "child@example.com",
    targetProfileId: "child-1"
  });
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

describe("AveniaService", () => {
  it("delegates every Vortex request to the selected managed profile", async () => {
    const requests: Array<{ managedProfileId?: string; path: string }> = [];
    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input));
      requests.push({
        managedProfileId: (init?.headers as Record<string, string>)["X-Managed-Profile-Id"],
        path: url.pathname
      });
      return new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" }, status: 200 });
    }) as typeof fetch;

    await AveniaService.createSubaccount({} as Parameters<typeof AveniaService.createSubaccount>[0]);
    await AveniaService.getKybAttemptStatus("attempt-1");
    await AveniaService.getKycStatus("tax-id", "quote-1", "session-1");
    await AveniaService.getSelfieLivenessUrl("tax-id");
    await AveniaService.getUser("tax-id");
    await AveniaService.initiateKybLevel1("subaccount-1");
    await AveniaService.submitNewKyc({} as Parameters<typeof AveniaService.submitNewKyc>[0]);

    assert.deepEqual(
      requests.map(request => request.path),
      [
        "/v1/brla/createSubaccount",
        "/v1/brla/kyb/attempt-status",
        "/v1/brla/getKycStatus",
        "/v1/brla/getSelfieLivenessUrl",
        "/v1/brla/getUser",
        "/v1/brla/kyb/new-level-1/web-sdk",
        "/v1/brla/newKyc"
      ]
    );
    assert.ok(requests.every(request => request.managedProfileId === "child-1"));
  });
});
