import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  buildMoneriumSepaRedemptionMessage,
  buildMoneriumWalletLinkMessage,
  MoneriumApiError,
  MoneriumApiService,
  MoneriumContractError,
  MONERIUM_REQUEST_TIMEOUT_MS
} from "./moneriumApiService";
import { MONERIUM_ADDRESS_OWNERSHIP_MESSAGE } from "./types";

const realFetch = globalThis.fetch;
const PROFILE_ID = "123e4567-e89b-42d3-a456-426614174000";
const ADDRESS = "0x59cFC408d310697f9D3598e1BE75B0157a072407";
const IBAN = "EE521273842688571285";

afterEach(() => {
  globalThis.fetch = realFetch;
});

function service(): MoneriumApiService {
  const instance = Object.create(MoneriumApiService.prototype) as MoneriumApiService;
  Object.assign(instance, {
    baseUrl: "https://api.monerium.dev",
    clientId: "client-id",
    clientSecret: "client-secret"
  });
  return instance;
}

function tokenResponse(token = "access-token"): Response {
  return Response.json({ access_token: token, expires_in: 3600, token_type: "Bearer" });
}

function profileListResponse(): Response {
  return Response.json({
    profiles: [{ id: PROFILE_ID, kind: "personal", name: "Jane Doe", state: "approved" }]
  });
}

function redeemRequest() {
  const timestamp = new Date(Date.now() + 60_000);
  return {
    address: ADDRESS,
    amount: "100.00",
    chain: "ethereum" as const,
    counterpart: {
      details: { country: "EE", firstName: "Jane", lastName: "Doe" },
      identifier: { iban: IBAN, standard: "iban" as const }
    },
    currency: "eur" as const,
    kind: "redeem" as const,
    message: buildMoneriumSepaRedemptionMessage("100.00", IBAN, timestamp),
    signature: `0x${"ab".repeat(65)}`
  };
}

describe("MoneriumApiService authentication and transport", () => {
  test("builds the exact documented wallet-link message", () => {
    expect(buildMoneriumWalletLinkMessage()).toBe("I hereby declare that I am the address owner.");
  });

  test("uses client_credentials, caches the token, and requests API v2", async () => {
    const fetchMock = mock(async () => {
      const call = fetchMock.mock.calls.length;
      if (call === 1) return tokenResponse();
      return profileListResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = service();
    await api.listProfiles({ kind: "personal", state: "approved" });
    await api.listProfiles();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [authUrl, authOptions] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(authUrl).toBe("https://api.monerium.dev/auth/token");
    expect(authOptions.method).toBe("POST");
    expect(String(authOptions.body)).toBe("client_id=client-id&client_secret=client-secret&grant_type=client_credentials");
    expect(authOptions.headers).toEqual({
      Accept: "application/vnd.monerium.api-v2+json",
      "Content-Type": "application/x-www-form-urlencoded"
    });
    expect(authOptions.signal).toBeInstanceOf(AbortSignal);

    const [profilesUrl, profilesOptions] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(profilesUrl).toBe("https://api.monerium.dev/profiles?kind=personal&state=approved");
    expect(profilesOptions.headers).toEqual({
      Accept: "application/vnd.monerium.api-v2+json",
      Authorization: "Bearer access-token"
    });
  });

  test("reacquires a token once after a 401", async () => {
    const responses = [tokenResponse("token-1"), new Response(null, { status: 401 }), tokenResponse("token-2"), profileListResponse()];
    const fetchMock = mock(async () => responses.shift() as Response);
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(service().listProfiles()).resolves.toEqual({
      profiles: [{ id: PROFILE_ID, kind: "personal", name: "Jane Doe", state: "approved" }]
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer token-1" })
    );
    expect((fetchMock.mock.calls[3][1] as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer token-2" })
    );
  });

  test("reuses a newer token when a delayed concurrent request returns 401", async () => {
    let authCalls = 0;
    const pendingTokenOneResponses: Array<(response: Response) => void> = [];
    let tokenTwoRequests = 0;
    const fetchMock = mock(async (input: string | URL | Request, options?: RequestInit) => {
      if (String(input).endsWith("/auth/token")) {
        authCalls += 1;
        return tokenResponse(`token-${authCalls}`);
      }
      const authorization = (options?.headers as Record<string, string>).Authorization;
      if (authorization === "Bearer token-1") {
        return await new Promise<Response>(resolve => pendingTokenOneResponses.push(resolve));
      }
      tokenTwoRequests += 1;
      return profileListResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const api = service();

    const first = api.listProfiles();
    const second = api.listProfiles();
    while (pendingTokenOneResponses.length < 2) await new Promise(resolve => setTimeout(resolve, 0));

    pendingTokenOneResponses[0](new Response(null, { status: 401 }));
    while (tokenTwoRequests < 1) await new Promise(resolve => setTimeout(resolve, 0));
    pendingTokenOneResponses[1](new Response(null, { status: 401 }));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(authCalls).toBe(2);
    expect(tokenTwoRequests).toBe(2);
  });

  test("rejects malformed successful responses at the provider boundary", async () => {
    const responses = [tokenResponse(), Response.json({ profiles: [{ id: PROFILE_ID }] })];
    globalThis.fetch = mock(async () => responses.shift() as Response) as typeof fetch;
    await expect(service().listProfiles()).rejects.toBeInstanceOf(MoneriumContractError);
  });

  test("classifies malformed token JSON and accepted bodies as contract violations", async () => {
    globalThis.fetch = mock(async () => new Response("not-json")) as typeof fetch;
    await expect(service().listProfiles()).rejects.toBeInstanceOf(MoneriumContractError);

    const responses = [tokenResponse(), Response.json({ code: 202, status: "Pending" }, { status: 202 })];
    globalThis.fetch = mock(async () => responses.shift() as Response) as typeof fetch;
    await expect(
      service().linkAddress({
        address: ADDRESS,
        chain: "ethereum",
        message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
        profile: PROFILE_ID,
        signature: "0x"
      })
    ).rejects.toBeInstanceOf(MoneriumContractError);
  });

  test("redacts provider bodies and credentials from HTTP errors", async () => {
    const sentinel = "SENTINEL-PROVIDER-PII";
    const responses = [tokenResponse(), new Response(sentinel, { status: 403 })];
    globalThis.fetch = mock(async () => responses.shift() as Response) as typeof fetch;

    const error = await service()
      .getProfile(PROFILE_ID)
      .catch(value => value as MoneriumApiError);
    expect(error).toBeInstanceOf(MoneriumApiError);
    expect(error.status).toBe(403);
    expect(error.responseBody).toBe("Sensitive provider response omitted");
    expect(error.endpoint).toBe("/profiles/:profile");
    expect(error.message).not.toContain(sentinel);
    expect(error.message).not.toContain("client-secret");
    expect(JSON.stringify(error)).not.toContain(PROFILE_ID);
  });

  test("maps transport failures to status 0", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("connection reset");
    }) as typeof fetch;

    const error = await service()
      .listProfiles()
      .catch(value => value as MoneriumApiError);
    expect(error).toBeInstanceOf(MoneriumApiError);
    expect(error.status).toBe(0);
    expect(MONERIUM_REQUEST_TIMEOUT_MS).toBe(10_000);
  });
});

describe("MoneriumApiService resource mappings", () => {
  test("encodes address/profile paths and query parameters", async () => {
    const responses = [
      tokenResponse(),
      Response.json({ address: ADDRESS, chains: ["ethereum"], profile: PROFILE_ID }),
      Response.json({ addresses: [] })
    ];
    const fetchMock = mock(async () => responses.shift() as Response);
    globalThis.fetch = fetchMock as typeof fetch;
    const api = service();

    await api.getAddress(`${ADDRESS}/suffix`);
    await api.listAddresses({ chain: "ethereum", profile: "profile/id" });

    expect(String(fetchMock.mock.calls[1][0])).toEndWith(`/addresses/${ADDRESS}%2Fsuffix`);
    expect(String(fetchMock.mock.calls[2][0])).toBe(
      "https://api.monerium.dev/addresses?chain=ethereum&profile=profile%2Fid"
    );
  });

  test("submits combined EIP-1271 bytes through the normal address endpoint", async () => {
    const responses = [tokenResponse(), Response.json({}, { status: 201 })];
    const fetchMock = mock(async () => responses.shift() as Response);
    globalThis.fetch = fetchMock as typeof fetch;
    const signature = `0x${"12".repeat(130)}`;
    const request = {
      address: ADDRESS,
      chain: "ethereum" as const,
      message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
      profile: PROFILE_ID,
      signature
    };

    await expect(service().linkAddress(request)).resolves.toEqual({ httpStatus: 201 });
    const [url, options] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.monerium.dev/addresses");
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify(request));
  });

  test("preserves the pending on-chain EIP-1271 status", async () => {
    const responses = [tokenResponse(), Response.json({ code: 202, status: "Accepted" }, { status: 202 })];
    globalThis.fetch = mock(async () => responses.shift() as Response) as typeof fetch;

    await expect(
      service().linkAddress({
        address: ADDRESS,
        chain: "ethereum",
        message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
        profile: PROFILE_ID,
        signature: "0x"
      })
    ).resolves.toEqual({ code: 202, httpStatus: 202, status: "Accepted" });
  });

  test("treats an existing IBAN 304 as a documented result", async () => {
    const responses = [tokenResponse(), new Response(null, { status: 304 })];
    globalThis.fetch = mock(async () => responses.shift() as Response) as typeof fetch;
    await expect(service().requestIban({ address: ADDRESS, chain: "ethereum" })).resolves.toEqual({ httpStatus: 304 });
  });

  test("pins the exact redemption payload and accepted response", async () => {
    const responses = [tokenResponse(), Response.json({ code: 202, status: "Accepted" }, { status: 202 })];
    const fetchMock = mock(async () => responses.shift() as Response);
    globalThis.fetch = fetchMock as typeof fetch;
    const request = redeemRequest();

    await expect(service().createRedemptionOrder(request)).resolves.toEqual({
      code: 202,
      httpStatus: 202,
      status: "Accepted"
    });
    expect((fetchMock.mock.calls[1][1] as RequestInit).body).toBe(JSON.stringify(request));
  });

  test("rejects an order whose body no longer matches its signed message", async () => {
    globalThis.fetch = mock(async () => tokenResponse()) as typeof fetch;
    await expect(
      service().createRedemptionOrder({ ...redeemRequest(), amount: "101.00" })
    ).rejects.toThrow("message must exactly match");
  });

  test("uploads a file under the documented multipart field without overriding its content type", async () => {
    const uploaded = {
      hash: "hash",
      id: "223e4567-e89b-42d3-a456-426614174001",
      meta: {
        createdAt: "2026-08-25T12:00:00Z",
        updatedAt: "2026-08-25T12:00:00Z",
        uploadedBy: PROFILE_ID
      },
      name: "evidence.pdf",
      size: 4,
      type: "application/pdf"
    };
    const responses = [tokenResponse(), Response.json(uploaded)];
    const fetchMock = mock(async () => responses.shift() as Response);
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(service().uploadFile(new Blob(["test"], { type: "application/pdf" }), "evidence.pdf")).resolves.toEqual(
      uploaded
    );
    const options = fetchMock.mock.calls[1][1] as RequestInit;
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get("file")).toBeInstanceOf(File);
    expect((options.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  test("maps webhook creation and deactivation without sending unsupported fields", async () => {
    const subscription = {
      id: "223e4567-e89b-42d3-a456-426614174001",
      state: "active",
      types: ["profile.updated"],
      url: "https://example.com/monerium"
    };
    const responses = [
      tokenResponse(),
      Response.json(subscription, { status: 201 }),
      Response.json({ ...subscription, state: "inactive" })
    ];
    const fetchMock = mock(async () => responses.shift() as Response);
    globalThis.fetch = fetchMock as typeof fetch;
    const api = service();
    const request = {
      secret: `whsec_${btoa("a".repeat(32))}`,
      types: ["profile.updated" as const],
      url: "https://example.com/monerium"
    };

    await api.createWebhook(request);
    await api.updateWebhook("subscription/id", { state: "inactive" });

    expect((fetchMock.mock.calls[1][1] as RequestInit).body).toBe(JSON.stringify(request));
    expect(String(fetchMock.mock.calls[2][0])).toEndWith("/webhooks/subscription%2Fid");
    expect((fetchMock.mock.calls[2][1] as RequestInit).body).toBe(JSON.stringify({ state: "inactive" }));
  });
});
