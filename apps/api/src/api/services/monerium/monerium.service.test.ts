import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
// Load this shared consumer before the module mocks below; Bun does not unregister mock.module
// replacements, and the API suite may import transfer eligibility after this file.
import "../recipients/transfer-eligibility.service";

const customerUpdate = mock(async (_values: unknown, _options: unknown) => undefined);
const providerFindOrCreate = mock(async (_options: unknown) => [{ id: "provider-customer-id", update: customerUpdate }]);
const providerFindOne = mock(async (_options: unknown) => null as null | Record<string, unknown>);
const kycFindOne = mock(async (_options: unknown) => null);
const kycCreate = mock(async (_values: unknown, _options: unknown) => undefined);

mock.module("../../../config/database", () => ({
  default: { close: async () => undefined, transaction: async (callback: (transaction: object) => Promise<void>) => callback({}) }
}));
mock.module("../../../models/providerCustomer.model", () => ({
  AveniaKycStatus: {
    Accepted: "Accepted",
    Consulted: "Consulted",
    Rejected: "Rejected",
    Requested: "Requested"
  },
  default: { findOne: providerFindOne, findOrCreate: providerFindOrCreate }
}));
mock.module("../../../models/kycCase.model", () => ({
  default: { create: kycCreate, findOne: kycFindOne }
}));
mock.module("../customer-entity.service", () => ({
  getOrCreateCustomerEntityForProfile: async (userId: string) => ({
    id: `entity-${userId}`,
    type: userId.startsWith("business-") ? "business" : "individual"
  })
}));

let service: typeof import("./monerium.service");
let controller: typeof import("../../controllers/monerium.controller");
let cache: typeof import("../index").cache;
let config: typeof import("../../../config/vars").config;
const originalFetch = globalThis.fetch;

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" }, status: 200 });
}

beforeAll(async () => {
  service = await import("./monerium.service");
  controller = await import("../../controllers/monerium.controller");
  ({ cache } = await import("../index"));
  ({ config } = await import("../../../config/vars"));
});

beforeEach(() => {
  cache.flushAll();
  service.resetMoneriumMemoryForTests();
  config.monerium.apiUrl = "https://api.monerium.test";
  config.monerium.clientId = "client-id";
  config.monerium.redirectUri = "https://dashboard.test/dashboard/monerium/callback";
  customerUpdate.mockClear();
  providerFindOrCreate.mockClear();
  providerFindOne.mockClear();
  kycFindOne.mockClear();
  kycCreate.mockClear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

afterAll(() => {
  mock.restore();
});

describe("Monerium OAuth", () => {
  it("rejects a supplied email that differs from the canonical authenticated email", async () => {
    const next = mock((_error: unknown) => undefined);
    await controller.start(
      {
        body: { customerType: "individual", email: "attacker@example.com" },
        userEmail: "owner@example.com",
        userId: "owner"
      } as never,
      {} as never,
      next as never
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 400 });
  });

  it("records pending onboarding when authorization starts", async () => {
    await service.startMoneriumOAuth("owner", "owner@example.com", "individual");

    expect(providerFindOrCreate).toHaveBeenCalledTimes(1);
    const options = providerFindOrCreate.mock.calls[0]?.[0] as { defaults: Record<string, unknown> };
    expect(options.defaults).toMatchObject({
      customerType: "individual",
      provider: "monerium",
      providerCustomerId: null,
      rail: "eur",
      status: "PENDING",
      statusExternal: "authorization_started"
    });
    expect(customerUpdate).toHaveBeenCalledWith(
      { status: "PENDING", statusExternal: "authorization_started" },
      expect.any(Object)
    );
  });

  it("generates PKCE server-side, binds ownership, consumes state once, and mirrors the selected profile", async () => {
    const requests: Array<{ init?: RequestInit; url: string }> = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ init, url });
      if (url.endsWith("/auth/token")) {
        return jsonResponse({ access_token: "access-token", expires_in: 3600, refresh_token: "refresh-token" });
      }
      if (url.endsWith("/auth/context")) {
        return jsonResponse({
          defaultProfile: "profile-a",
          profiles: [
            { id: "profile-z", kind: "personal" },
            { id: "profile-a", kind: "personal" },
            { id: "corporate-a", kind: "corporate" }
          ]
        });
      }
      return jsonResponse({ id: "profile-a", kind: "personal", state: "approved" });
    }) as unknown as typeof fetch;

    const { authorizationUrl } = await service.startMoneriumOAuth("owner", "owner@example.com", "individual");
    const authorization = new URL(authorizationUrl);
    expect(authorization.origin).toBe("https://api.monerium.test");
    expect(authorization.pathname).toBe("/auth");
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorization.searchParams.get("redirect_uri")).toBe(config.monerium.redirectUri);
    expect(authorization.searchParams.get("email")).toBe("owner@example.com");
    const state = authorization.searchParams.get("state") as string;

    await expect(service.completeMoneriumOAuth("other", "stolen-code", state)).rejects.toMatchObject({ status: 403 });
    expect(requests).toHaveLength(0);

    const result = await service.completeMoneriumOAuth("owner", "authorization-code", state);
    expect(result).toEqual({
      customerType: "individual",
      profileId: "profile-a",
      status: "APPROVED",
      statusExternal: "approved"
    });

    const tokenBody = requests[0]?.init?.body as URLSearchParams;
    expect(service.createPkceChallenge(tokenBody.get("code_verifier") as string)).toBe(
      authorization.searchParams.get("code_challenge") as string
    );
    expect(tokenBody.get("code")).toBe("authorization-code");
    expect(tokenBody.get("redirect_uri")).toBe(config.monerium.redirectUri);
    expect(providerFindOrCreate).toHaveBeenCalledTimes(2);
    const providerOptions = providerFindOrCreate.mock.calls[1]?.[0] as { defaults: Record<string, unknown> };
    expect(providerOptions.defaults).toMatchObject({
      customerType: "individual",
      provider: "monerium",
      providerCustomerId: "profile-a",
      rail: "eur",
      status: "APPROVED",
      statusExternal: "approved"
    });
    expect(kycCreate.mock.calls[0]?.[0]).toMatchObject({
      provider: "monerium",
      providerCaseId: "profile-a",
      status: "APPROVED",
      statusExternal: "approved",
      type: "kyc"
    });
    expect(JSON.stringify(providerFindOrCreate.mock.calls)).not.toContain("access-token");
    expect(JSON.stringify(kycCreate.mock.calls)).not.toContain("refresh-token");

    await expect(service.completeMoneriumOAuth("owner", "authorization-code", state)).rejects.toMatchObject({ status: 400 });
    expect(requests).toHaveLength(3);
  });

  it("rejects an expired or missing transaction before token exchange", async () => {
    const fetchMock = mock(async () => jsonResponse({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { authorizationUrl } = await service.startMoneriumOAuth("business-owner", "owner@example.com", "business");
    const state = new URL(authorizationUrl).searchParams.get("state") as string;
    cache.flushAll();

    await expect(service.completeMoneriumOAuth("business-owner", "authorization-code", state)).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes an expired access token and retains the rotated refresh token server-side", async () => {
    const tokenBodies: URLSearchParams[] = [];
    const authorizationHeaders: string[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/token")) {
        tokenBodies.push(init?.body as URLSearchParams);
        return tokenBodies.length === 1
          ? jsonResponse({ access_token: "old-access", expires_in: 1, refresh_token: "old-refresh" })
          : jsonResponse({ access_token: "new-access", expires_in: 3600, refresh_token: "rotated-refresh" });
      }
      authorizationHeaders.push((init?.headers as Record<string, string>).Authorization);
      if (url.endsWith("/auth/context")) {
        return jsonResponse({ profiles: [{ id: "profile-a", kind: "personal" }] });
      }
      return jsonResponse({ id: "profile-a", kind: "personal", state: "pending" });
    }) as unknown as typeof fetch;

    const { authorizationUrl } = await service.startMoneriumOAuth("owner", "owner@example.com", "individual");
    const state = new URL(authorizationUrl).searchParams.get("state") as string;
    await service.completeMoneriumOAuth("owner", "authorization-code", state);
    const result = await service.getMoneriumStatus("owner", "individual");

    expect(tokenBodies[1]?.get("grant_type")).toBe("refresh_token");
    expect(tokenBodies[1]?.get("refresh_token")).toBe("old-refresh");
    expect(authorizationHeaders.slice(-2)).toEqual(["Bearer new-access", "Bearer new-access"]);
    expect(result).toEqual({
      customerType: "individual",
      profileId: "profile-a",
      status: "PENDING",
      statusExternal: "pending"
    });
    expect(JSON.stringify(result)).not.toContain("rotated-refresh");
  });

  it("returns a persisted terminal status after in-memory credentials are lost", async () => {
    providerFindOne.mockResolvedValueOnce({
      providerCustomerId: "profile-approved",
      status: "APPROVED",
      statusExternal: "approved"
    });

    await expect(service.getMoneriumStatus("owner", "individual")).resolves.toEqual({
      customerType: "individual",
      profileId: "profile-approved",
      status: "APPROVED",
      statusExternal: "approved"
    });
  });

  it("rejects a customer type that differs from the authenticated entity", async () => {
    await expect(service.startMoneriumOAuth("owner", "owner@example.com", "business")).rejects.toMatchObject({ status: 400 });
    await expect(service.getMoneriumStatus("owner", "business")).rejects.toMatchObject({ status: 400 });
  });
});

describe("Monerium profile normalization", () => {
  it("maps only terminal provider states and keeps all others pending", () => {
    expect(service.mapMoneriumProfileState("approved")).toBe("APPROVED");
    expect(service.mapMoneriumProfileState("REJECTED")).toBe("REJECTED");
    expect(service.mapMoneriumProfileState("submitted")).toBe("PENDING");
  });

  it("selects the matching default profile and rejects ambiguous profiles without one", () => {
    const profiles = [
      { id: "personal-z", kind: "personal" },
      { id: "corporate-a", kind: "corporate" },
      { id: "personal-a", kind: "personal" }
    ];
    expect(service.selectMoneriumProfile(profiles, "individual", "personal-a")).toEqual({ id: "personal-a", kind: "personal" });
    expect(service.selectMoneriumProfile(profiles, "business")).toEqual({ id: "corporate-a", kind: "corporate" });
    expect(() => service.selectMoneriumProfile(profiles, "individual")).toThrow("Multiple personal Monerium profiles found");
  });
});
