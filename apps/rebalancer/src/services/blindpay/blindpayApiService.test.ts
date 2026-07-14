import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { BlindpayApiService } from "./blindpayApiService.ts";
import type { PayinFxRateInput, PayinFxRateResponse } from "./types.ts";

const ENV_VARS = ["EVM_ACCOUNT_SECRET", "BLINDPAY_API_KEY", "BLINDPAY_BASE_URL", "BLINDPAY_INSTANCE_ID"];
const originalEnv = new Map(ENV_VARS.map(name => [name, process.env[name]]));
const originalFetch = globalThis.fetch;

function restoreEnv() {
  for (const name of ENV_VARS) {
    const originalValue = originalEnv.get(name);
    if (originalValue === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalValue;
    }
  }
}

const FX_INPUT: PayinFxRateInput = {
  currency_type: "sender",
  from: "BRL",
  request_amount: 100_000,
  to: "USDC"
};

const FX_RESPONSE: PayinFxRateResponse = {
  blindpay_quotation: 5.61,
  commercial_quotation: 5.58,
  instance_flat_fee: 0,
  instance_percentage_fee: 25,
  result_amount: 17_825,
};

describe("BlindpayApiService", () => {
  beforeEach(() => {
    restoreEnv();
    process.env.EVM_ACCOUNT_SECRET = "0xtest-secret";
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
    restoreEnv();
    globalThis.fetch = originalFetch;
  });

  test("isConfigured is false unless both API key and instance id are set", () => {
    delete process.env.BLINDPAY_API_KEY;
    delete process.env.BLINDPAY_INSTANCE_ID;
    expect(BlindpayApiService.isConfigured()).toBe(false);

    process.env.BLINDPAY_API_KEY = "key";
    expect(BlindpayApiService.isConfigured()).toBe(false);

    process.env.BLINDPAY_INSTANCE_ID = "in_123";
    expect(BlindpayApiService.isConfigured()).toBe(true);
  });

  test("getPayinFxRate throws when BlindPay is not configured", async () => {
    delete process.env.BLINDPAY_API_KEY;
    delete process.env.BLINDPAY_INSTANCE_ID;

    await expect(BlindpayApiService.getInstance().getPayinFxRate(FX_INPUT)).rejects.toThrow("not configured");
  });

  test("getPayinFxRate posts to the instance fx endpoint and returns the parsed quote", async () => {
    process.env.BLINDPAY_API_KEY = "secret-key";
    process.env.BLINDPAY_BASE_URL = "https://blindpay.test/v1";
    process.env.BLINDPAY_INSTANCE_ID = "in_123";

    const requests: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ init: init as RequestInit, url: String(url) });
      return new Response(JSON.stringify(FX_RESPONSE), { status: 200 });
    }) as unknown as typeof fetch;

    const quote = await BlindpayApiService.getInstance().getPayinFxRate(FX_INPUT);

    expect(quote).toEqual(FX_RESPONSE);
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (!request) throw new Error("fetch was not called");
    expect(request.url).toBe("https://blindpay.test/v1/instances/in_123/payin-quotes/fx");
    expect(request.init.method).toBe("POST");
    expect(JSON.parse(request.init.body as string)).toEqual(FX_INPUT);
    const headers = request.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
    // Requests must carry a timeout signal so a stalled BlindPay call can't hang the rebalance run.
    expect(request.init.signal).toBeInstanceOf(AbortSignal);
  });

  test("getPayinFxRate surfaces non-OK responses with status and body", async () => {
    process.env.BLINDPAY_API_KEY = "secret-key";
    process.env.BLINDPAY_INSTANCE_ID = "in_123";

    globalThis.fetch = (async () => new Response("quota exceeded", { status: 429 })) as unknown as typeof fetch;

    await expect(BlindpayApiService.getInstance().getPayinFxRate(FX_INPUT)).rejects.toThrow(
      "BlindPay request failed with status '429'. Error: quota exceeded"
    );
  });
});
