import { afterEach, describe, expect, mock, test } from "bun:test";
import { ZodError } from "zod";
import { getRelayIntentStatus, getRelayQuote, RelayApiError, type RelayQuoteRequest } from "./relayApi";
import { relayIntentStatusSchema } from "./schemas";
import savedQuotes from "./__fixtures__/saved-quotes.json";

const realFetch = globalThis.fetch;
const SAVED_QUOTE = savedQuotes[3];
const REQUEST: RelayQuoteRequest = {
  amount: "200000000",
  destinationChainId: 4663,
  destinationCurrency: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  originChainId: 8453,
  originCurrency: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  tradeType: "EXACT_OUTPUT",
  user: "0x000000000000000000000000000000000000dEaD"
};

function stubFetch(respond: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const fetchMock = mock(async (url: string, init: RequestInit) => respond(url, init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.RELAY_API_BASE_URL;
  delete process.env.RELAY_API_KEY;
});

describe("getRelayQuote", () => {
  test("posts the request to /quote/v2 on the default host, without a key when none is configured", async () => {
    const fetchMock = stubFetch(() => Response.json(SAVED_QUOTE));
    const quote = await getRelayQuote(REQUEST);

    expect(quote.requestId).toBe(SAVED_QUOTE.requestId);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.relay.link/quote/v2");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(REQUEST);
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  test("sends the configured key and base URL", async () => {
    process.env.RELAY_API_BASE_URL = "http://relay.example/";
    process.env.RELAY_API_KEY = "relay-key";
    const fetchMock = stubFetch(() => Response.json(SAVED_QUOTE));
    await getRelayQuote(REQUEST);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://relay.example/quote/v2");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "x-api-key": "relay-key" });
  });

  test("a non-ok response is a RelayApiError carrying the status and body", async () => {
    stubFetch(() => Response.json({ errorCode: "NO_QUOTES", message: "no quotes" }, { status: 400 }));
    const error = await getRelayQuote(REQUEST).catch(caught => caught);

    expect(error).toBeInstanceOf(RelayApiError);
    expect(error.provider).toBe("relay");
    expect(error.status).toBe(400);
    expect(error.endpoint).toBe("/quote/v2");
    expect(error.responseBody).toContain("NO_QUOTES");
  });

  test("a transport failure is a RelayApiError with status 0", async () => {
    stubFetch(() => Promise.reject(new TypeError("connection reset")));
    const error = await getRelayQuote(REQUEST).catch(caught => caught);

    expect(error).toBeInstanceOf(RelayApiError);
    expect(error.status).toBe(0);
    expect(error.responseBody).toBe("connection reset");
  });

  test("a 200 that is not JSON is a RelayApiError", async () => {
    stubFetch(() => new Response("<html>gateway</html>"));
    const error = await getRelayQuote(REQUEST).catch(caught => caught);

    expect(error).toBeInstanceOf(RelayApiError);
    expect(error.status).toBe(200);
  });

  test("a response missing a consumed field fails the contract", async () => {
    const { protocol: _protocol, ...withoutProtocol } = SAVED_QUOTE;
    stubFetch(() => Response.json(withoutProtocol));

    await expect(getRelayQuote(REQUEST)).rejects.toBeInstanceOf(ZodError);
  });

  test("the caller aborting surfaces as the abort, not as a Relay failure", async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        })
    );
    const controller = new AbortController();
    const pending = getRelayQuote(REQUEST, controller.signal).catch(caught => caught);
    controller.abort(new Error("phase aborted"));
    const error = await pending;

    expect(error).not.toBeInstanceOf(RelayApiError);
    expect(error.message).toBe("phase aborted");
  });
});

describe("getRelayIntentStatus", () => {
  test("reads /intents/status/v3 with the encoded request id", async () => {
    const fetchMock = stubFetch(() => Response.json({ status: "waiting" }));
    const status = await getRelayIntentStatus("0xabc&x=1");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.relay.link/intents/status/v3?requestId=0xabc%26x%3D1");
    expect(status).toEqual({
      failReason: undefined,
      inTxHashes: [],
      refundFailReason: undefined,
      status: "waiting",
      txHashes: []
    });
  });

  test("'unknown', Relay's answer for an unseen id, is accepted though absent from its schema enum", async () => {
    stubFetch(() => Response.json({ status: "unknown" }));
    expect((await getRelayIntentStatus("0xabc")).status).toBe("unknown");
  });

  test("an unexpected status fails the contract", async () => {
    stubFetch(() => Response.json({ status: "fallback" }));
    await expect(getRelayIntentStatus("0xabc")).rejects.toBeInstanceOf(ZodError);
  });

  test("forwards the caller's signal", async () => {
    const fetchMock = stubFetch(() => Response.json({ status: "waiting" }));
    const controller = new AbortController();
    await getRelayIntentStatus("0xabc", controller.signal);

    const { signal } = fetchMock.mock.calls[0][1];
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });
});

describe("relayIntentStatusSchema", () => {
  test("'N/A' is no failure reason, so a failure without a refund reason stays non-terminal", () => {
    const status = relayIntentStatusSchema.parse({ failReason: "N/A", refundFailReason: "N/A", status: "failure" });
    expect(status.failReason).toBeUndefined();
    expect(status.refundFailReason).toBeUndefined();
  });

  test("real reasons and hashes are kept", () => {
    const status = relayIntentStatusSchema.parse({
      failReason: "SOLVER_CAPACITY_EXCEEDED",
      inTxHashes: ["0x01"],
      refundFailReason: "MANUAL_REFUND_REQUIRED",
      status: "failure",
      txHashes: ["0x02"]
    });
    expect(status).toEqual({
      failReason: "SOLVER_CAPACITY_EXCEEDED",
      inTxHashes: ["0x01"],
      refundFailReason: "MANUAL_REFUND_REQUIRED",
      status: "failure",
      txHashes: ["0x02"]
    });
  });
});
