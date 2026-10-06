import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import crypto from "node:crypto";
import { RampDirection } from "@vortexfi/shared";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderApiError,
  ProviderInternalError,
  UnsupportedPairError
} from "../errors/providerErrors";
import * as alchemyPay from "./alchemypay/alchemypay.service";
import * as moonpay from "./moonpay/moonpay.service";
import * as transak from "./transak/transak.service";

/**
 * Characterization of the competitor price adapters behind /v1/prices and /v1/prices/all: the exact request
 * each one sends, the exact value it returns, and the error class + message for every failure branch (the
 * messages are surfaced verbatim in the API responses).
 */

type FetchCall = { url: string; init: RequestInit | undefined };

const originalFetch = globalThis.fetch;
let calls: FetchCall[] = [];

function mockFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  calls = [];
  globalThis.fetch = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const call = { init, url: String(input) };
      calls.push(call);
      return Promise.resolve().then(() => handler(call));
    },
    originalFetch
  ) as typeof fetch;
}

function respondWith(body: unknown, init: ResponseInit = {}) {
  mockFetch(() => new Response(typeof body === "string" ? body : JSON.stringify(body), init));
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected the promise to reject");
}

async function expectProviderError(promise: Promise<unknown>, errorClass: typeof ProviderApiError, message: string) {
  const error = await rejection(promise);
  expect(error.constructor).toBe(errorClass);
  expect(error.name).toBe(errorClass.name);
  expect(error.message).toBe(message);
}

let logErrors: ReturnType<typeof spyOn>;
let logWarnings: ReturnType<typeof spyOn>;

beforeEach(() => {
  logErrors = spyOn(logger, "error").mockImplementation((() => logger) as never);
  logWarnings = spyOn(logger, "warn").mockImplementation((() => logger) as never);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  calls = [];
  logErrors.mockRestore();
  logWarnings.mockRestore();
});

describe("AlchemyPay price adapter", () => {
  const BASE_URL = "https://alchemypay.test";
  const QUOTE_URL = `${BASE_URL}/open/api/v4/merchant/order/quote`;
  const TIMESTAMP = 1_700_000_000_000;
  const original = { ...config.priceProviders.alchemyPay };
  let now: ReturnType<typeof spyOn>;

  beforeEach(() => {
    Object.assign(config.priceProviders.alchemyPay, { appId: "app-1", baseUrl: BASE_URL, secretKey: " secret-key " });
    now = spyOn(Date, "now").mockReturnValue(TIMESTAMP);
  });

  afterEach(() => {
    Object.assign(config.priceProviders.alchemyPay, original);
    now.mockRestore();
  });

  // The documented AlchemyPay signature: base64(HMAC-SHA256(timestamp + METHOD + path + sorted JSON body)).
  const sign = (body: string) =>
    crypto
      .createHmac("sha256", "secret-key")
      .update(`${TIMESTAMP}POST/open/api/v4/merchant/order/quote${body}`)
      .digest("base64");

  const okBody = (data: Record<string, string>) => ({ data, success: true });
  const data = { cryptoPrice: "1", cryptoQuantity: "98.25", fiatQuantity: "60", networkFee: "0.5", rampFee: "1.5" };

  describe("request", () => {
    it("signs and sends a BUY quote request", async () => {
      respondWith(okBody(data));
      await alchemyPay.getPriceFor("eur", "usdc", "100", RampDirection.BUY, "polygon");

      const body = '{"amount":"100","crypto":"USDC","fiat":"EUR","network":"MATIC","payWayCode":"10001","side":"BUY"}';
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(QUOTE_URL);
      expect(calls[0].init?.method).toBe("POST");
      expect(calls[0].init?.body).toBe(body);
      expect(calls[0].init?.headers).toEqual({
        appId: "app-1",
        "Content-Type": "application/json",
        sign: sign(body),
        timestamp: String(TIMESTAMP)
      });
      expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
    });

    it("signs and sends a SELL quote request (no payment method, usdc.e keeps the upper-cased code)", async () => {
      respondWith(okBody(data));
      await alchemyPay.getPriceFor("usdc.e", "brl", "50", RampDirection.SELL, "avalanche");

      const body = '{"amount":"50","crypto":"USDC.E","fiat":"BRL","network":"AVAX","side":"SELL"}';
      expect(calls[0].init?.body).toBe(body);
      expect((calls[0].init?.headers as Record<string, string>).sign).toBe(sign(body));
    });

    it("maps networks, defaults to POLYGON, passes unknown networks through and stringifies numeric amounts", async () => {
      respondWith(okBody(data));
      const bodyFor = async (network: string | undefined, amount: string | number = "1") => {
        await alchemyPay.getPriceFor("eur", "eth", amount, RampDirection.BUY, network);
        return JSON.parse(calls[calls.length - 1].init?.body as string);
      };

      expect((await bodyFor(undefined)).network).toBe("MATIC");
      expect((await bodyFor("Ethereum")).network).toBe("ETH");
      expect((await bodyFor("bsc")).network).toBe("BSC");
      expect((await bodyFor("arbitrum")).network).toBe("ARBITRUM");
      expect((await bodyFor("base")).network).toBe("base");
      expect((await bodyFor("polygon", 100.5)).amount).toBe("100.5");
    });

    it("drops empty values from the signed body", async () => {
      respondWith(okBody(data));
      await alchemyPay.getPriceFor("eur", "", "100", RampDirection.BUY);

      const body = '{"amount":"100","fiat":"EUR","network":"MATIC","payWayCode":"10001","side":"BUY"}';
      expect(calls[0].init?.body).toBe(body);
      expect((calls[0].init?.headers as Record<string, string>).sign).toBe(sign(body));
    });

    it("fails before any network call when the app id or secret key is missing", async () => {
      respondWith(okBody(data));
      for (const missing of ["appId", "secretKey"] as const) {
        config.priceProviders.alchemyPay[missing] = "";
        const error = await rejection(alchemyPay.getPriceFor("eur", "usdc", "100", RampDirection.BUY));
        expect(error.constructor).toBe(Error);
        expect(error.message).toBe("AlchemyPay configuration missing");
        config.priceProviders.alchemyPay[missing] = original[missing];
      }
      expect(calls).toHaveLength(0);
    });
  });

  describe("successful responses", () => {
    it("returns the crypto quantity for BUY", async () => {
      respondWith(okBody(data));
      const result = await alchemyPay.getPriceFor("eur", "usdc", "100", RampDirection.BUY);

      expect(JSON.stringify(result)).toBe(
        '{"direction":"BUY","provider":"alchemypay","quoteAmount":98.25,"requestedAmount":100,"totalFee":2}'
      );
    });

    it("returns the fiat quantity minus fees for SELL", async () => {
      respondWith(okBody(data));
      const result = await alchemyPay.getPriceFor("usdc", "eur", "50", RampDirection.SELL);

      expect(JSON.stringify(result)).toBe(
        '{"direction":"SELL","provider":"alchemypay","quoteAmount":58,"requestedAmount":50,"totalFee":2}'
      );
    });

    it("never returns a negative SELL quote and treats non-numeric fees as zero", async () => {
      respondWith(okBody({ ...data, fiatQuantity: "1", networkFee: "2", rampFee: "1.5" }));
      expect(await alchemyPay.getPriceFor("usdc", "eur", "50", RampDirection.SELL)).toEqual({
        direction: RampDirection.SELL,
        provider: "alchemypay",
        quoteAmount: 0,
        requestedAmount: 50,
        totalFee: 3.5
      });

      respondWith(okBody({ ...data, fiatQuantity: "10", networkFee: "n/a", rampFee: "" }));
      expect(await alchemyPay.getPriceFor("usdc", "eur", "50", RampDirection.SELL)).toEqual({
        direction: RampDirection.SELL,
        provider: "alchemypay",
        quoteAmount: 10,
        requestedAmount: 50,
        totalFee: 0
      });
    });
  });

  describe("non-OK HTTP responses", () => {
    const run = (status: number, body: unknown, statusText = "") => {
      respondWith(body, { status, statusText });
      return alchemyPay.getPriceFor("eur", "usdc", "100", RampDirection.BUY);
    };

    it("maps 5xx to ProviderInternalError", async () => {
      await expectProviderError(run(500, { returnMsg: "boom" }), ProviderInternalError, "AlchemyPay server error: boom");
      await expectProviderError(
        run(503, {}, "Service Unavailable"),
        ProviderInternalError,
        "AlchemyPay server error: HTTP error 503: Service Unavailable"
      );
    });

    it("classifies 4xx by message: amount limits first, then unsupported pairs, otherwise invalid parameter", async () => {
      await expectProviderError(run(400, { returnMsg: "Minimum amount is 10" }), InvalidAmountError, "AlchemyPay: Minimum amount is 10");
      await expectProviderError(run(422, { returnMsg: "above MAXIMUM" }), InvalidAmountError, "AlchemyPay: above MAXIMUM");
      await expectProviderError(run(400, { returnMsg: "Unsupported pair" }), UnsupportedPairError, "AlchemyPay: Unsupported pair");
      await expectProviderError(run(400, { returnMsg: "INVALID CURRENCY" }), UnsupportedPairError, "AlchemyPay: INVALID CURRENCY");
      await expectProviderError(
        run(400, { returnMsg: "unsupported, minimum not met" }),
        InvalidAmountError,
        "AlchemyPay: unsupported, minimum not met"
      );
      await expectProviderError(run(400, { returnMsg: "bad request" }), InvalidParameterError, "AlchemyPay API error: bad request");
      await expectProviderError(
        run(404, null, "Not Found"),
        InvalidParameterError,
        "AlchemyPay API error: HTTP error 404: Not Found"
      );
    });

    it("maps other non-2xx statuses to ProviderInternalError", async () => {
      await expectProviderError(
        run(301, { returnMsg: "moved" }),
        ProviderInternalError,
        "Unexpected HTTP status 301 from AlchemyPay: moved"
      );
    });
  });

  describe("2xx responses with success=false", () => {
    const run = (body: unknown) => {
      respondWith(body);
      return alchemyPay.getPriceFor("eur", "usdc", "100", RampDirection.BUY);
    };

    it("classifies the message: amount limits, unsupported pair, invalid parameter, otherwise internal error", async () => {
      await expectProviderError(run({ returnMsg: "Minimum is 5", success: false }), InvalidAmountError, "AlchemyPay: Minimum is 5");
      await expectProviderError(run({ returnMsg: "maximum exceeded", success: false }), InvalidAmountError, "AlchemyPay: maximum exceeded");
      await expectProviderError(run({ returnMsg: "Unsupported network", success: false }), UnsupportedPairError, "AlchemyPay: Unsupported network");
      await expectProviderError(run({ returnMsg: "Invalid Currency", success: false }), UnsupportedPairError, "AlchemyPay: Invalid Currency");
      await expectProviderError(run({ returnMsg: "Invalid parameter x", success: false }), InvalidParameterError, "AlchemyPay: Invalid parameter x");
      await expectProviderError(
        run({ returnMsg: "something else", success: false }),
        ProviderInternalError,
        "AlchemyPay API logic error: something else"
      );
      await expectProviderError(
        run({ success: false }),
        ProviderInternalError,
        "AlchemyPay API logic error: AlchemyPay API returned success=false with no message"
      );
    });

    it("rejects success=true without a data field", async () => {
      await expectProviderError(run({ success: true }), ProviderInternalError, "AlchemyPay API returned success=true but no data field");
    });
  });

  describe("fetch failures", () => {
    it("wraps a rejected fetch in ProviderInternalError", async () => {
      mockFetch(() => {
        throw new TypeError("fetch failed");
      });
      await expectProviderError(
        alchemyPay.getPriceFor("eur", "usdc", "100", RampDirection.BUY),
        ProviderInternalError,
        "Network error fetching price from AlchemyPay: fetch failed"
      );
    });

    it("wraps any non-TypeError failure the same way", async () => {
      mockFetch(() => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      });
      await expectProviderError(
        alchemyPay.getPriceFor("eur", "usdc", "100", RampDirection.BUY),
        ProviderInternalError,
        "Network error fetching price from AlchemyPay: The operation timed out."
      );
    });

    it("wraps an unparsable body in ProviderInternalError", async () => {
      respondWith("<html>not json</html>");
      const error = await rejection(alchemyPay.getPriceFor("eur", "usdc", "100", RampDirection.BUY));
      expect(error).toBeInstanceOf(ProviderInternalError);
      expect(error.message.startsWith("Network error fetching price from AlchemyPay: ")).toBe(true);
    });
  });
});

describe("Moonpay price adapter", () => {
  const BASE_URL = "https://moonpay.test";
  const original = { ...config.priceProviders.moonpay };

  beforeEach(() => {
    Object.assign(config.priceProviders.moonpay, { apiKey: "pk_test_moonpay", baseUrl: BASE_URL });
  });

  afterEach(() => {
    Object.assign(config.priceProviders.moonpay, original);
  });

  const quote = { baseCurrency: { code: "eur", minAmount: 20 }, baseCurrencyAmount: 100, feeAmount: 5, quoteCurrencyAmount: 95 };

  describe("request", () => {
    it("sends a BUY quote request with the card payment method", async () => {
      respondWith(quote);
      await moonpay.getPriceFor("EUR", "USDC", "100", RampDirection.BUY);

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(
        `${BASE_URL}/v3/currencies/usdc_polygon/buy_quote?apiKey=pk_test_moonpay&baseCurrencyAmount=100&baseCurrencyCode=eur&paymentMethod=credit_debit_card`
      );
      expect(Object.keys(calls[0].init ?? {})).toEqual(["signal"]);
    });

    it("uses pix for BRL purchases", async () => {
      respondWith(quote);
      await moonpay.getPriceFor("BRL", "USDT", "100", RampDirection.BUY);

      expect(calls[0].url).toBe(
        `${BASE_URL}/v3/currencies/usdt/buy_quote?apiKey=pk_test_moonpay&baseCurrencyAmount=100&baseCurrencyCode=brl&paymentMethod=pix_instant_payment`
      );
    });

    it("sends a SELL quote request, using SEPA for EUR payouts", async () => {
      respondWith({ ...quote, baseCurrencyAmount: 50 });
      await moonpay.getPriceFor("usdc.e", "EUR", "50", RampDirection.SELL);
      await moonpay.getPriceFor("ETH", "USD", "50", RampDirection.SELL);

      expect(calls[0].url).toBe(
        `${BASE_URL}/v3/currencies/usdc_polygon/sell_quote?apiKey=pk_test_moonpay&baseCurrencyAmount=50&extraFeePercentage=0&payoutMethod=sepa_bank_transfer&quoteCurrencyCode=eur`
      );
      expect(calls[1].url).toBe(
        `${BASE_URL}/v3/currencies/eth/sell_quote?apiKey=pk_test_moonpay&baseCurrencyAmount=50&extraFeePercentage=0&payoutMethod=credit_debit_card&quoteCurrencyCode=usd`
      );
    });

    it("maps usdce to the polygon USDC code and lower-cases everything else", async () => {
      respondWith(quote);
      await moonpay.getPriceFor("EUR", "usdce", "100", RampDirection.BUY);
      await moonpay.getPriceFor("EUR", "Pol", "100", RampDirection.BUY);

      expect(calls[0].url).toContain("/v3/currencies/usdc_polygon/buy_quote");
      expect(calls[1].url).toContain("/v3/currencies/pol/buy_quote");
    });

    it("fails before any network call when the API key is missing", async () => {
      respondWith(quote);
      config.priceProviders.moonpay.apiKey = "";
      const error = await rejection(moonpay.getPriceFor("EUR", "USDC", "100", RampDirection.BUY));

      expect(error.constructor).toBe(Error);
      expect(error.message).toBe("Moonpay API key not configured");
      expect(calls).toHaveLength(0);
    });
  });

  describe("successful responses", () => {
    it("returns the quote amount and fee", async () => {
      respondWith(quote);
      const result = await moonpay.getPriceFor("EUR", "USDC", "100", RampDirection.BUY);

      expect(JSON.stringify(result)).toBe(
        '{"direction":"BUY","provider":"moonpay","quoteAmount":95,"requestedAmount":100,"totalFee":5}'
      );
    });

    it("returns the same shape for SELL", async () => {
      respondWith({ ...quote, baseCurrencyAmount: 50, feeAmount: 1, quoteCurrencyAmount: 47 });
      const result = await moonpay.getPriceFor("USDC", "EUR", "50", RampDirection.SELL);

      expect(JSON.stringify(result)).toBe(
        '{"direction":"SELL","provider":"moonpay","quoteAmount":47,"requestedAmount":50,"totalFee":1}'
      );
    });

    it("accepts a requested amount equal to the provider minimum", async () => {
      respondWith({ ...quote, baseCurrency: { code: "eur", minAmount: 100 } });
      expect((await moonpay.getPriceFor("EUR", "USDC", "100", RampDirection.BUY)).quoteAmount).toBe(95);
    });
  });

  describe("validation of 2xx responses", () => {
    const run = (body: unknown, amount = "100") => {
      respondWith(body);
      return moonpay.getPriceFor("EUR", "USDC", amount, RampDirection.BUY);
    };

    it("rejects responses missing essential fields", async () => {
      const message = "Moonpay response missing essential data fields";
      await expectProviderError(run({ ...quote, baseCurrencyAmount: undefined }), ProviderInternalError, message);
      await expectProviderError(run({ ...quote, quoteCurrencyAmount: undefined }), ProviderInternalError, message);
      await expectProviderError(run({ ...quote, feeAmount: undefined }), ProviderInternalError, message);
    });

    it("rejects amounts below the provider minimum", async () => {
      await expectProviderError(
        run({ ...quote, baseCurrency: { code: "eur", minAmount: 120 } }),
        InvalidAmountError,
        "Moonpay: 120 eur is the minimum amount for this pair"
      );
    });

    it("rejects a quote for a different base amount than requested, and warns", async () => {
      await expectProviderError(
        run({ ...quote, baseCurrencyAmount: 99 }),
        ProviderInternalError,
        "Moonpay response discrepancy: Requested base amount 100, received 99"
      );
      expect(logWarnings).toHaveBeenCalledTimes(1);
    });

    it("lets a response without baseCurrency surface the raw TypeError (not a provider error)", async () => {
      const error = await rejection(run({ ...quote, baseCurrency: undefined }));
      expect(error).toBeInstanceOf(TypeError);
      expect(error).not.toBeInstanceOf(ProviderApiError);
    });
  });

  describe("non-OK HTTP responses", () => {
    const run = (status: number, body: unknown, statusText = "") => {
      respondWith(body, { status, statusText });
      return moonpay.getPriceFor("EUR", "USDC", "100", RampDirection.BUY);
    };

    it("maps NotFoundError and 'unsupported' messages to UnsupportedPairError (checked first)", async () => {
      await expectProviderError(run(404, { message: "no such currency", type: "NotFoundError" }), UnsupportedPairError, "Moonpay: no such currency");
      await expectProviderError(run(400, { message: "Unsupported currency" }), UnsupportedPairError, "Moonpay: Unsupported currency");
      await expectProviderError(run(404, { message: "over the limit", type: "NotFoundError" }), UnsupportedPairError, "Moonpay: over the limit");
    });

    it("maps minimum/maximum/limit messages to InvalidAmountError", async () => {
      await expectProviderError(run(400, { message: "Minimum is 20" }), InvalidAmountError, "Moonpay: Minimum is 20");
      await expectProviderError(run(422, { message: "MAXIMUM is 5000" }), InvalidAmountError, "Moonpay: MAXIMUM is 5000");
      await expectProviderError(run(429, { message: "Rate limit exceeded" }), InvalidAmountError, "Moonpay: Rate limit exceeded");
    });

    it("maps BadRequestError and HTTP 400 to InvalidParameterError (before the 5xx check)", async () => {
      await expectProviderError(run(400, { message: "bad" }), InvalidParameterError, "Moonpay: bad");
      await expectProviderError(run(422, { message: "bad", type: "BadRequestError" }), InvalidParameterError, "Moonpay: bad");
      await expectProviderError(run(500, { message: "bad", type: "BadRequestError" }), InvalidParameterError, "Moonpay: bad");
    });

    it("maps 5xx to ProviderInternalError", async () => {
      await expectProviderError(run(500, { message: "kaput" }), ProviderInternalError, "Moonpay server error: kaput");
      await expectProviderError(
        run(502, {}, "Bad Gateway"),
        ProviderInternalError,
        "Moonpay server error: HTTP error 502: Bad Gateway"
      );
    });

    it("maps any other failure to InvalidParameterError with the API-error prefix", async () => {
      await expectProviderError(run(401, { message: "denied" }), InvalidParameterError, "Moonpay API error: denied");
      await expectProviderError(run(404, null, "Not Found"), InvalidParameterError, "Moonpay API error: HTTP error 404: Not Found");
    });
  });

  describe("fetch failures", () => {
    it("reports a TypeError as a network error", async () => {
      mockFetch(() => {
        throw new TypeError("fetch failed");
      });
      await expectProviderError(
        moonpay.getPriceFor("EUR", "USDC", "100", RampDirection.BUY),
        ProviderInternalError,
        "Network error fetching price from Moonpay: fetch failed"
      );
    });

    it("reports any other failure as a parse error carrying the (usually absent) response status", async () => {
      mockFetch(() => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      });
      await expectProviderError(
        moonpay.getPriceFor("EUR", "USDC", "100", RampDirection.BUY),
        ProviderInternalError,
        "Failed to parse response from Moonpay (Status: undefined): undefined"
      );

      mockFetch(() => {
        throw Object.assign(new Error("odd"), { response: { status: 418, statusText: "I'm a teapot" } });
      });
      await expectProviderError(
        moonpay.getPriceFor("EUR", "USDC", "100", RampDirection.BUY),
        ProviderInternalError,
        "Failed to parse response from Moonpay (Status: 418): I'm a teapot"
      );
    });

    it("reports an unparsable body as a parse error", async () => {
      respondWith("<html>not json</html>");
      await expectProviderError(
        moonpay.getPriceFor("EUR", "USDC", "100", RampDirection.BUY),
        ProviderInternalError,
        "Failed to parse response from Moonpay (Status: undefined): undefined"
      );
    });
  });
});

describe("Transak price adapter", () => {
  const BASE_URL = "https://transak.test";
  const original = { ...config.priceProviders.transak };

  beforeEach(() => {
    Object.assign(config.priceProviders.transak, { baseUrl: BASE_URL, partnerApiKey: "transak-key" });
  });

  afterEach(() => {
    Object.assign(config.priceProviders.transak, original);
  });

  const quote = { response: { conversionPrice: 0.95, cryptoAmount: 95, fiatAmount: 100, totalFee: 4 } };

  describe("request", () => {
    it("sends a BUY quote request on the default network", async () => {
      respondWith(quote);
      await transak.getPriceFor("eur", "usdc", "100", RampDirection.BUY);

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(
        `${BASE_URL}/api/v1/pricing/public/quotes?cryptoCurrency=USDC&fiatAmount=100&fiatCurrency=EUR&isBuyOrSell=BUY&network=polygon&partnerApiKey=transak-key&paymentMethod=credit_debit_card`
      );
      expect(Object.keys(calls[0].init ?? {})).toEqual(["signal"]);
    });

    it("sends a SELL quote request on the requested network", async () => {
      respondWith(quote);
      await transak.getPriceFor("usdt", "brl", 50, RampDirection.SELL, "Ethereum" as never);

      expect(calls[0].url).toBe(
        `${BASE_URL}/api/v1/pricing/public/quotes?cryptoAmount=50&cryptoCurrency=USDT&fiatCurrency=BRL&isBuyOrSell=SELL&network=ethereum&partnerApiKey=transak-key`
      );
    });

    it("maps usdc.e and usdce to USDC and upper-cases everything else", async () => {
      respondWith(quote);
      await transak.getPriceFor("eur", "usdc.e", "100", RampDirection.BUY);
      await transak.getPriceFor("eur", "usdce", "100", RampDirection.BUY);
      await transak.getPriceFor("eur", "pol", "100", RampDirection.BUY);

      expect(calls[0].url).toContain("cryptoCurrency=USDC&");
      expect(calls[1].url).toContain("cryptoCurrency=USDC&");
      expect(calls[2].url).toContain("cryptoCurrency=POL&");
    });

    it("fails before any network call when the partner API key is missing", async () => {
      respondWith(quote);
      config.priceProviders.transak.partnerApiKey = "";
      const error = await rejection(transak.getPriceFor("eur", "usdc", "100", RampDirection.BUY));

      expect(error.constructor).toBe(Error);
      expect(error.message).toBe("Transak partner API key is not defined");
      expect(calls).toHaveLength(0);
    });
  });

  describe("successful responses", () => {
    it("returns the crypto amount for BUY", async () => {
      respondWith(quote);
      const result = await transak.getPriceFor("eur", "usdc", "100", RampDirection.BUY);

      expect(JSON.stringify(result)).toBe(
        '{"direction":"BUY","provider":"transak","quoteAmount":95,"requestedAmount":100,"totalFee":4}'
      );
    });

    it("returns the fiat amount for SELL", async () => {
      respondWith(quote);
      const result = await transak.getPriceFor("usdc", "eur", "95", RampDirection.SELL);

      expect(JSON.stringify(result)).toBe(
        '{"direction":"SELL","provider":"transak","quoteAmount":100,"requestedAmount":95,"totalFee":4}'
      );
    });

    it("accepts zero amounts and fees", async () => {
      respondWith({ response: { conversionPrice: 0, cryptoAmount: 0, fiatAmount: 0, totalFee: 0 } });
      expect(await transak.getPriceFor("eur", "usdc", "100", RampDirection.BUY)).toEqual({
        direction: RampDirection.BUY,
        provider: "transak",
        quoteAmount: 0,
        requestedAmount: 100,
        totalFee: 0
      });
    });
  });

  describe("validation of 2xx responses", () => {
    const run = (body: unknown) => {
      respondWith(body);
      return transak.getPriceFor("eur", "usdc", "100", RampDirection.BUY);
    };

    it("rejects a missing response object or any missing essential field", async () => {
      const message = "Transak response missing essential data fields";
      await expectProviderError(run({}), ProviderInternalError, message);
      for (const field of ["conversionPrice", "cryptoAmount", "fiatAmount", "totalFee"] as const) {
        await expectProviderError(run({ response: { ...quote.response, [field]: undefined } }), ProviderInternalError, message);
      }
    });
  });

  describe("error responses (non-OK status or an error object)", () => {
    const run = (status: number, body: unknown, statusText = "") => {
      respondWith(body, { status, statusText });
      return transak.getPriceFor("eur", "usdc", "100", RampDirection.BUY);
    };
    const error = (message: string) => ({ error: { message } });

    it("maps unsupported-pair messages to UnsupportedPairError (checked first)", async () => {
      for (const message of [
        "Invalid fiat currency",
        "UNSUPPORTED token",
        "Not available in your region",
        "invalid crypto currency",
        "Invalid network"
      ]) {
        await expectProviderError(run(400, error(message)), UnsupportedPairError, `Transak: ${message}`);
      }
      await expectProviderError(run(400, error("unsupported minimum")), UnsupportedPairError, "Transak: unsupported minimum");
    });

    it("maps amount-limit messages to InvalidAmountError", async () => {
      for (const message of ["Minimum is 20", "Maximum is 5000", "daily limit", "Amount exceeds balance"]) {
        await expectProviderError(run(422, error(message)), InvalidAmountError, `Transak: ${message}`);
      }
      await expectProviderError(run(400, error("minimum")), InvalidAmountError, "Transak: minimum");
    });

    it("maps HTTP 400 or an 'invalid parameter' message to InvalidParameterError (before the 5xx check)", async () => {
      await expectProviderError(run(400, error("whatever")), InvalidParameterError, "Transak: whatever");
      await expectProviderError(run(422, error("Invalid parameter foo")), InvalidParameterError, "Transak: Invalid parameter foo");
      await expectProviderError(run(500, error("Invalid parameter foo")), InvalidParameterError, "Transak: Invalid parameter foo");
    });

    it("maps 5xx to ProviderInternalError", async () => {
      await expectProviderError(run(500, error("kaput")), ProviderInternalError, "Transak server error: kaput");
      await expectProviderError(
        run(504, {}, "Gateway Timeout"),
        ProviderInternalError,
        "Transak server error: HTTP error 504: Gateway Timeout"
      );
    });

    it("maps any other failure to InvalidParameterError with the API-error prefix", async () => {
      await expectProviderError(run(401, error("denied")), InvalidParameterError, "Transak API error: denied");
      await expectProviderError(run(404, null, "Not Found"), InvalidParameterError, "Transak API error: HTTP error 404: Not Found");
    });

    it("treats an error object inside a 200 response as a failure", async () => {
      await expectProviderError(run(200, error("Invalid network")), UnsupportedPairError, "Transak: Invalid network");
      await expectProviderError(run(200, error("odd"), "OK"), InvalidParameterError, "Transak API error: odd");
      await expectProviderError(run(200, { error: {} }, "OK"), InvalidParameterError, "Transak API error: HTTP error 200: OK");
    });
  });

  describe("fetch failures", () => {
    it("wraps a rejected fetch in ProviderInternalError", async () => {
      mockFetch(() => {
        throw new TypeError("fetch failed");
      });
      await expectProviderError(
        transak.getPriceFor("eur", "usdc", "100", RampDirection.BUY),
        ProviderInternalError,
        "Network error fetching price from Transak: fetch failed"
      );
    });

    it("wraps any non-TypeError failure the same way", async () => {
      mockFetch(() => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      });
      await expectProviderError(
        transak.getPriceFor("eur", "usdc", "100", RampDirection.BUY),
        ProviderInternalError,
        "Network error fetching price from Transak: The operation timed out."
      );
    });

    it("wraps an unparsable body in ProviderInternalError", async () => {
      respondWith("<html>not json</html>");
      const failure = await rejection(transak.getPriceFor("eur", "usdc", "100", RampDirection.BUY));
      expect(failure).toBeInstanceOf(ProviderInternalError);
      expect(failure.message.startsWith("Network error fetching price from Transak: ")).toBe(true);
    });
  });
});
