import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  CreateQuoteRequest,
  DomesticCountry,
  RampDirection,
  RegisterRampRequest,
  StartRampRequest,
  UpdateRampRequest
} from "@vortexfi/shared";
import { APIResponseError, NetworkError, VortexSdkError } from "../src/errors";
import { ApiService } from "../src/services/ApiService";

const BASE = "https://api.example";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

const quoteRequest = { inputAmount: "100", rampType: RampDirection.BUY } as unknown as CreateQuoteRequest;
const registerRequest = { additionalData: {}, quoteId: "q1", signingAccounts: [] } as RegisterRampRequest;
const updateRequest = { additionalData: {}, presignedTxs: [], rampId: "r1" } as UpdateRampRequest;
const startRequest = { rampId: "r1" } as StartRampRequest;

interface Case {
  name: string;
  call: (api: ApiService) => Promise<unknown>;
  url: string;
  method: "GET" | "POST";
  body?: unknown;
  // Label handleAPIResponse reports in APIResponseError / NetworkError messages.
  endpoint: string;
}

const cases: Case[] = [
  {
    body: quoteRequest,
    call: api => api.createQuote(quoteRequest),
    endpoint: "/v1/quotes",
    method: "POST",
    name: "createQuote",
    url: `${BASE}/v1/quotes`
  },
  {
    call: api => api.getQuote("quote-1"),
    endpoint: "/v1/quotes/quote-1",
    method: "GET",
    name: "getQuote",
    url: `${BASE}/v1/quotes/quote-1`
  },
  {
    body: registerRequest,
    call: api => api.registerRamp(registerRequest),
    endpoint: "/v1/ramp/register",
    method: "POST",
    name: "registerRamp",
    url: `${BASE}/v1/ramp/register`
  },
  {
    body: updateRequest,
    call: api => api.updateRamp(updateRequest),
    endpoint: "/v1/ramp/update",
    method: "POST",
    name: "updateRamp",
    url: `${BASE}/v1/ramp/update`
  },
  {
    body: startRequest,
    call: api => api.startRamp(startRequest),
    endpoint: "/v1/ramp/start",
    method: "POST",
    name: "startRamp",
    url: `${BASE}/v1/ramp/start`
  },
  {
    call: api => api.getRampStatus("ramp-1"),
    endpoint: "/v1/ramp/status?id=ramp-1",
    method: "GET",
    name: "getRampStatus",
    url: `${BASE}/v1/ramp/ramp-1`
  },
  {
    call: api => api.getRampInfo(),
    endpoint: "/v1/ramp-info",
    method: "GET",
    name: "getRampInfo",
    url: `${BASE}/v1/ramp-info`
  },
  {
    call: api => api.getBrlRemainingLimit("123.456.789-00", RampDirection.SELL),
    endpoint: "/v1/brla/getUserRemainingLimit",
    method: "GET",
    name: "getBrlRemainingLimit with taxId",
    url: `${BASE}/v1/brla/getUserRemainingLimit?taxId=123.456.789-00&direction=SELL`
  },
  {
    call: api => api.getBrlRemainingLimit(undefined, RampDirection.BUY),
    endpoint: "/v1/brla/getUserRemainingLimit",
    method: "GET",
    name: "getBrlRemainingLimit without taxId",
    url: `${BASE}/v1/brla/getUserRemainingLimit?direction=BUY`
  },
  {
    call: api => api.validateBrlPixKey("a b/c+d@e.com"),
    endpoint: "/v1/brla/validatePixKey",
    method: "GET",
    name: "validateBrlPixKey",
    url: `${BASE}/v1/brla/validatePixKey?pixKey=a+b%2Fc%2Bd%40e.com`
  },
  {
    call: api => api.listDomesticFiatAccounts("MX" as DomesticCountry),
    endpoint: "/v1/domestic/fiatAccounts?country=MX",
    method: "GET",
    name: "listDomesticFiatAccounts",
    url: `${BASE}/v1/domestic/fiatAccounts?country=MX`
  }
];

const credentialSets = [
  {
    expectedHeaders: { "Content-Type": "application/json" },
    name: "no credentials",
    service: () => new ApiService(BASE)
  },
  {
    expectedHeaders: { "Content-Type": "application/json", "X-API-Key": "sk_test", "X-Public-Key": "pk_test" },
    name: "public and secret key",
    service: () => new ApiService(BASE, "pk_test", "sk_test")
  },
  {
    expectedHeaders: { Authorization: "Bearer tok", "Content-Type": "application/json", "X-Public-Key": "pk_test" },
    name: "public key and access token",
    service: () => new ApiService(BASE, "pk_test", undefined, async () => "tok")
  }
];

describe("ApiService request shape", () => {
  for (const testCase of cases) {
    for (const credentials of credentialSets) {
      test(`${testCase.name} sends the exact request with ${credentials.name}`, async () => {
        const fetchMock = mock(() => Promise.resolve(Response.json({ ok: true })));
        globalThis.fetch = fetchMock as typeof fetch;

        await expect(testCase.call(credentials.service())).resolves.toEqual({ ok: true });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
        expect(typeof url).toBe("string");
        expect(url).toBe(testCase.url);
        expect(init.method).toBe(testCase.method);
        expect(init.headers).toStrictEqual(credentials.expectedHeaders);
        if (testCase.method === "POST") {
          expect(Object.keys(init).sort()).toEqual(["body", "headers", "method"]);
          expect(init.body).toBe(JSON.stringify(testCase.body));
        } else {
          expect(Object.keys(init).sort()).toEqual(["headers", "method"]);
        }
      });
    }

    test(`${testCase.name} reports the endpoint when the error body is not JSON`, async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response("upstream down", { status: 502, statusText: "Bad Gateway" }))
      ) as typeof fetch;

      const error = await testCase.call(new ApiService(BASE)).catch(e => e);

      expect(error).toBeInstanceOf(APIResponseError);
      expect(error.status).toBe(502);
      expect(error.message).toBe(`API request failed for ${testCase.endpoint}: 502 Bad Gateway`);
    });

    test(`${testCase.name} reports the endpoint when a successful body is not JSON`, async () => {
      globalThis.fetch = mock(() => Promise.resolve(new Response("not json", { status: 200 }))) as typeof fetch;

      const error = await testCase.call(new ApiService(BASE)).catch(e => e);

      expect(error).toBeInstanceOf(NetworkError);
      expect(error.message).toBe(`Failed to parse response from ${testCase.endpoint}`);
    });

    test(`${testCase.name} parses a structured API error`, async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          Response.json({ error: { code: "QUOTE_NOT_FOUND", message: "No such quote", status: 404 } }, { status: 404 })
        )
      ) as typeof fetch;

      const error = await testCase.call(new ApiService(BASE)).catch(e => e);

      expect(error).toBeInstanceOf(VortexSdkError);
      expect(error.status).toBe(404);
    });
  }

  test("lets transport failures from fetch propagate untouched", async () => {
    const failure = new TypeError("fetch failed");
    globalThis.fetch = mock(() => Promise.reject(failure)) as typeof fetch;

    await expect(new ApiService(BASE).getRampInfo()).rejects.toBe(failure);
  });

  test("serializes the body before resolving the access token", async () => {
    const accessTokenProvider = mock(async () => "tok");
    const fetchMock = mock(() => Promise.resolve(Response.json({})));
    globalThis.fetch = fetchMock as typeof fetch;
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(
      new ApiService(BASE, undefined, undefined, accessTokenProvider).createQuote(circular as unknown as CreateQuoteRequest)
    ).rejects.toThrow();

    expect(accessTokenProvider).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
