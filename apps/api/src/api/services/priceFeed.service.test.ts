// eslint-disable-next-line import/no-unresolved
import {afterAll, afterEach, beforeEach, describe, expect, it, mock} from "bun:test";
import type {RampCurrency} from "@vortexfi/shared";
// Captured before the mock.module calls below so afterAll can restore the real
// modules. bun module mocks are process-wide: leaving "@vortexfi/shared" stubbed
// poisons later test files that resolve real token configs (e.g. the corridor
// integration tests, whose top-level helpers throw "token config missing").
import * as sharedNamespace from "@vortexfi/shared";
import * as loggerNamespace from "../../config/logger";

const sharedReal = { ...sharedNamespace };
const loggerReal = { ...loggerNamespace };

const ARS = "ARS" as RampCurrency;
const BRL = "BRL" as RampCurrency;
const COP = "COP" as RampCurrency;
const ETH = "ETH" as RampCurrency;
const EUR = "EUR" as RampCurrency;
const MXN = "MXN" as RampCurrency;
const USD = "USD" as RampCurrency;
const USDC = "USDC" as RampCurrency;
const USDT = "USDT" as RampCurrency;

const FASTFOREX_TEST_FIATS = [EUR, ARS, BRL, MXN, COP] as const;

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

// config/vars snapshots the environment at first import (which may happen in an
// earlier test file), so deterministic values are set on the instance instead.
const testInstanceConfig = {
  binanceApiBaseUrl: "https://api.binance.com",
  coingeckoApiBaseUrl: "https://api.coingecko.com/api/v3",
  coingeckoApiKey: "test-api-key",
  cryptoCacheTtlMs: 300000,
  fastforexApiBaseUrl: "https://api.fastforex.io",
  fastforexApiKey: "test-fastforex-key",
  fiatCacheTtlMs: 300000
};

const loggerMock = {
  debug: mock(() => {}),
  error: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {})
};

mock.module("@vortexfi/shared", () => ({
  EvmToken: { USDC: "USDC", USDCE: "USDC.e", USDT: "USDT" },
  getTokenUsdPrice: () => undefined,
  isFiatToken: (currency: string) => ["BRL", "EUR", "ARS", "MXN", "COP", "USD"].includes(currency),
  normalizeTokenSymbol: (symbol: string) => symbol,
  RampCurrency: { ARS: "ARS", BRL: "BRL", COP: "COP", EUR: "EUR", MXN: "MXN", USD: "USD" },
  UsdLikeEvmToken: { USDC: "USDC", USDCE: "USDC.e", USDT: "USDT" }
}));

mock.module("../../config/logger", () => ({
  default: loggerMock
}));

const { PriceFeedService, priceFeedService } = await import("./priceFeed.service");
const { config } = await import("../../config/vars");

describe("PriceFeedService", () => {
  let originalDateNow: () => number;
  let fetchMock: ReturnType<typeof mock>;

  const mockFastforexResponse = (rate: number, currency: RampCurrency = BRL) =>
    new Response(JSON.stringify({ base: "USD", result: { [currency]: rate }, updated: "2026-06-03T00:00:00Z", ms: 4 }), {
      headers: { "content-type": "application/json" },
      status: 200
    });

  const mockCoinGeckoResponse = (data: unknown) =>
    new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json" },
      status: 200
    });

  const mockBinanceResponse = (price: number, symbol = "USDTBRL") =>
    new Response(JSON.stringify({ price: String(price), symbol }), {
      headers: { "content-type": "application/json" },
      status: 200
    });

  const isBinanceUrl = (url: string) => url.includes("/api/v3/ticker/price");

  beforeEach(() => {
    originalDateNow = Date.now;
    // Route by URL so BRL exercises the Binance-first path while other fiats hit fastforex.
    fetchMock = mock(async (url: string) => (isBinanceUrl(url) ? mockBinanceResponse(5.85) : mockFastforexResponse(5.85)));
    global.fetch = fetchMock as unknown as typeof fetch;
    Object.values(loggerMock).forEach(logger => logger.mockClear());
    Reflect.set(PriceFeedService, "instance", undefined);
    Object.assign(PriceFeedService.getInstance(), testInstanceConfig);
  });

  afterEach(() => {
    Date.now = originalDateNow;
    global.fetch = originalFetch;
    Reflect.set(PriceFeedService, "instance", undefined);
  });

  afterAll(() => {
    for (const key of ["COINGECKO_API_URL", "CRYPTO_CACHE_TTL_MS", "FIAT_CACHE_TTL_MS"]) {
      const originalValue = originalEnv[key];
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
    global.fetch = originalFetch;
    Reflect.set(PriceFeedService, "instance", undefined);
    // Restore the real modules so this file's stubs don't leak into later files.
    mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
    mock.module("../../config/logger", () => ({ ...loggerReal }));
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      expect(PriceFeedService.getInstance()).toBe(PriceFeedService.getInstance());
    });

    it("should export a singleton instance", () => {
      expect(priceFeedService).toBeInstanceOf(PriceFeedService);
    });
  });

  describe("getCryptoPrice", () => {
    it("should fetch price from CoinGecko API when cache is empty", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => mockCoinGeckoResponse({ bitcoin: { usd: 50000 } }));
      global.fetch = fetchMock as unknown as typeof fetch;

      const price = await instance.getCryptoPrice("bitcoin", "usd");

      expect(price).toBe(50000);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/json",
            "x-cg-pro-api-key": "test-api-key"
          })
        })
      );
    });

    it("should work without API key", async () => {
      const instance = PriceFeedService.getInstance();
      Reflect.set(instance, "coingeckoApiKey", undefined);
      fetchMock = mock(async () => mockCoinGeckoResponse({ bitcoin: { usd: 50000 } }));
      global.fetch = fetchMock as unknown as typeof fetch;

      const price = await instance.getCryptoPrice("bitcoin", "usd");

      expect(price).toBe(50000);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            "x-cg-pro-api-key": expect.any(String)
          })
        })
      );
    });

    it("should return cached crypto price without a second API call", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => mockCoinGeckoResponse({ bitcoin: { usd: 50000 } }));
      global.fetch = fetchMock as unknown as typeof fetch;

      await instance.getCryptoPrice("bitcoin", "usd");
      fetchMock.mockClear();

      const price = await instance.getCryptoPrice("bitcoin", "usd");

      expect(price).toBe(50000);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should reject missing token or currency", async () => {
      const instance = PriceFeedService.getInstance();

      await expect(instance.getCryptoPrice("", "usd")).rejects.toThrow("Token ID and currency are required");
      await expect(instance.getCryptoPrice("bitcoin", "")).rejects.toThrow("Token ID and currency are required");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should throw when CoinGecko returns a non-OK response", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => new Response("Rate limit exceeded", { status: 429, statusText: "Too Many Requests" }));
      global.fetch = fetchMock as unknown as typeof fetch;

      await expect(instance.getCryptoPrice("bitcoin", "usd")).rejects.toThrow("CoinGecko API error: 429 Too Many Requests");
    });

    it("should throw when CoinGecko response does not contain the requested token or currency", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => mockCoinGeckoResponse({}));
      global.fetch = fetchMock as unknown as typeof fetch;

      await expect(instance.getCryptoPrice("bitcoin", "usd")).rejects.toThrow("Token 'bitcoin' not found in CoinGecko response");

      fetchMock = mock(async () => mockCoinGeckoResponse({ bitcoin: {} }));
      global.fetch = fetchMock as unknown as typeof fetch;
      await expect(instance.getCryptoPrice("bitcoin", "eur")).rejects.toThrow("Currency 'eur' not found for token 'bitcoin'");
    });
  });

  describe("getUsdToFiatExchangeRate", () => {
    it("should use Binance spot as the primary source for BRL", async () => {
      const instance = PriceFeedService.getInstance();
      instance.getCryptoPrice = mock(async () => 5.86);

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.85);
      expect(fetchMock).toHaveBeenCalledWith("https://api.binance.com/api/v3/ticker/price?symbol=USDTBRL", expect.anything());
      // fastforex must not be reached when Binance succeeds.
      expect(fetchMock).not.toHaveBeenCalledWith("https://api.fastforex.io/fetch-one?from=USD&to=BRL", expect.anything());
      // The Binance rate is still sanity-checked against the CoinGecko reference.
      expect(instance.getCryptoPrice).toHaveBeenCalledWith("usd-coin", "brl");
    });

    it("should fall back to fastforex when Binance is unavailable", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async (url: string) =>
        isBinanceUrl(url) ? new Response("binance down", { status: 500 }) : mockFastforexResponse(5.85)
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => 5.86);

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.85);
      expect(fetchMock).toHaveBeenCalledWith("https://api.fastforex.io/fetch-one?from=USD&to=BRL", expect.anything());
      const [, options] = fetchMock.mock.calls.find(([url]) => !isBinanceUrl(url as string)) as [string, { headers: Headers }];
      expect(options.headers.get("X-API-Key")).toBe("test-fastforex-key");
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining("Binance failed for USD-BRL"));
    });

    it("should fall back to fastforex when Binance returns a mismatched symbol", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async (url: string) =>
        isBinanceUrl(url) ? mockBinanceResponse(5.85, "USDTARS") : mockFastforexResponse(5.85)
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => 5.86);

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.85);
      expect(fetchMock).toHaveBeenCalledWith("https://api.fastforex.io/fetch-one?from=USD&to=BRL", expect.anything());
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining("Binance returned unexpected symbol for USDTBRL: USDTARS"));
    });

    it("should fall back to fastforex when the Binance rate is outside the CoinGecko sanity band", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async (url: string) => (isBinanceUrl(url) ? mockBinanceResponse(6.2) : mockFastforexResponse(5.85)));
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => 5.85);

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.85);
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining("Binance USD-BRL rate 6.2"));
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining("above 2.00% limit"));
    });

    it("should accept the Binance rate when the CoinGecko sanity check is unavailable", async () => {
      const instance = PriceFeedService.getInstance();
      instance.getCryptoPrice = mock(async () => {
        throw new Error("cg down");
      });

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.85);
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to sanity-check Binance USD-BRL"));
    });

    it("should cache an accepted rate even when the CoinGecko sanity check was unavailable", async () => {
      const instance = PriceFeedService.getInstance();
      instance.getCryptoPrice = mock(async () => 0);

      const rate = await instance.getUsdToFiatExchangeRate(BRL);
      expect(rate).toBe(5.85);

      instance.getCryptoPrice = mock(async () => 5.85);
      fetchMock.mockClear();

      const cachedRate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(cachedRate).toBe(5.85);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should skip Binance for fiats without a Binance USDT market and use fastforex", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async (url: string) => {
        if (isBinanceUrl(url)) {
          throw new Error("Binance must not be called for EUR");
        }
        return mockFastforexResponse(0.86, EUR);
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => 0.861);

      const rate = await instance.getUsdToFiatExchangeRate(EUR);

      expect(rate).toBe(0.86);
      expect(fetchMock).toHaveBeenCalledWith("https://api.fastforex.io/fetch-one?from=USD&to=EUR", expect.anything());
    });

    it("should preserve path components in configured fastforex base URL", async () => {
      const instance = PriceFeedService.getInstance();
      Reflect.set(instance, "fastforexApiBaseUrl", "https://api.fastforex.io/v1");
      // Disable Binance so the fastforex path is exercised.
      fetchMock = mock(async (url: string) =>
        isBinanceUrl(url) ? new Response("binance down", { status: 500 }) : mockFastforexResponse(5.85)
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => 5.86);

      await instance.getUsdToFiatExchangeRate(BRL);

      expect(fetchMock).toHaveBeenCalledWith("https://api.fastforex.io/v1/fetch-one?from=USD&to=BRL", expect.anything());
    });

    it("should return cached rate on second call", async () => {
      const instance = PriceFeedService.getInstance();
      const getCryptoPriceMock = mock(async () => 5.86);
      instance.getCryptoPrice = getCryptoPriceMock;

      await instance.getUsdToFiatExchangeRate(BRL);
      fetchMock.mockClear();
      getCryptoPriceMock.mockClear();

      const rate = await instance.getUsdToFiatExchangeRate(BRL);
      expect(rate).toBe(5.85);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(instance.getCryptoPrice).not.toHaveBeenCalled();
    });

    it("should refetch after cache expires", async () => {
      const instance = PriceFeedService.getInstance();
      let callCount = 0;
      fetchMock = mock(async (url: string) =>
        isBinanceUrl(url) ? mockBinanceResponse(++callCount === 1 ? 5.85 : 5.9) : mockFastforexResponse(5.85)
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => (callCount === 1 ? 5.86 : 5.91));

      const startTime = 1000000;
      Date.now = () => startTime;
      await instance.getUsdToFiatExchangeRate(BRL);

      Date.now = () => startTime + 400_000;
      const rate = await instance.getUsdToFiatExchangeRate(BRL);
      expect(rate).toBe(5.9);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("should fall back to CoinGecko when Binance and fastforex both fail", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => new Response("providers down", { status: 500 }));
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => 5.92);

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.92);
      expect(instance.getCryptoPrice).toHaveBeenCalledWith("usd-coin", "brl");
    });

    it("should skip fastforex and fall back to CoinGecko when fastforex key is missing", async () => {
      const instance = PriceFeedService.getInstance();
      Reflect.set(instance, "fastforexApiKey", undefined);
      // Binance must also be unavailable to reach the CoinGecko fallback.
      fetchMock = mock(async (url: string) =>
        isBinanceUrl(url) ? new Response("binance down", { status: 500 }) : mockFastforexResponse(5.85)
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => 5.92);

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.92);
      expect(fetchMock).not.toHaveBeenCalledWith("https://api.fastforex.io/fetch-one?from=USD&to=BRL", expect.anything());
      expect(instance.getCryptoPrice).toHaveBeenCalledWith("usd-coin", "brl");
    });

    it("should throw when Binance, fastforex and CoinGecko all fail", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => new Response("providers down", { status: 500 }));
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => {
        throw new Error("cg down");
      });

      await expect(instance.getUsdToFiatExchangeRate(BRL)).rejects.toThrow("cg down");
    });

    it("should throw when fastforex returns invalid rate and CoinGecko also fails", async () => {
      const instance = PriceFeedService.getInstance();
      // Binance down, fastforex returns a zero rate, CoinGecko throws.
      fetchMock = mock(async (url: string) =>
        isBinanceUrl(url)
          ? new Response("binance down", { status: 500 })
          : new Response(JSON.stringify({ base: "USD", result: { BRL: 0 } }), {
              headers: { "content-type": "application/json" },
              status: 200
            })
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => {
        throw new Error("cg down");
      });

      await expect(instance.getUsdToFiatExchangeRate(BRL)).rejects.toThrow("cg down");
    });

    it("should reject and fall back when fastforex is outside the CoinGecko sanity band", async () => {
      const instance = PriceFeedService.getInstance();
      // Binance down so the fastforex sanity band is exercised.
      fetchMock = mock(async (url: string) =>
        isBinanceUrl(url) ? new Response("binance down", { status: 500 }) : mockFastforexResponse(6.2)
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => 5.85);

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.85);
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining("fastforex USD-BRL rate 6.2"));
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining("above 2.00% limit"));
    });

    it("should return one for USD without calling external providers", async () => {
      const instance = PriceFeedService.getInstance();

      const rate = await instance.getUsdToFiatExchangeRate(USD);

      expect(rate).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should price every non-USD Vortex fiat currency, using Binance for BRL and fastforex otherwise", async () => {
      const instance = PriceFeedService.getInstance();
      const fastforexRates: Record<string, number> = {
        ARS: 1200,
        BRL: 5.85,
        COP: 4100,
        EUR: 0.86,
        MXN: 18.5
      };
      const coingeckoReferenceRates: Record<string, number> = {
        ARS: 1199,
        BRL: 5.86,
        COP: 4095,
        EUR: 0.861,
        MXN: 18.49
      };

      fetchMock = mock(async (url: string) => {
        if (isBinanceUrl(url)) {
          return mockBinanceResponse(fastforexRates.BRL);
        }
        const currency = new URL(url).searchParams.get("to");
        if (!currency) {
          throw new Error("Missing FastForex target currency in test request");
        }

        return mockFastforexResponse(fastforexRates[currency], currency as RampCurrency);
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async (_tokenId: string, vsCurrency: string) => {
        const referenceRate = coingeckoReferenceRates[vsCurrency.toUpperCase()];
        if (referenceRate === undefined) {
          throw new Error(`Missing CoinGecko reference rate for ${vsCurrency}`);
        }

        return referenceRate;
      });

      for (const currency of FASTFOREX_TEST_FIATS) {
        const rate = await instance.getUsdToFiatExchangeRate(currency);

        expect(rate).toBe(fastforexRates[currency]);
        if (currency === BRL) {
          expect(fetchMock).toHaveBeenCalledWith("https://api.binance.com/api/v3/ticker/price?symbol=USDTBRL", expect.anything());
        } else {
          expect(fetchMock).toHaveBeenCalledWith(
            `https://api.fastforex.io/fetch-one?from=USD&to=${currency}`,
            expect.anything()
          );
        }
        expect(instance.getCryptoPrice).toHaveBeenCalledWith("usd-coin", currency.toLowerCase());
      }
    });

    it("should reject non-fiat target currencies before fetching", async () => {
      const instance = PriceFeedService.getInstance();

      await expect(instance.getUsdToFiatExchangeRate(ETH)).rejects.toThrow(
        "USD-to-fiat exchange rate requires a fiat currency, got ETH"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("verifyBinanceReachability", () => {
    it("should log an info line when Binance is reachable", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => mockBinanceResponse(5.2));
      global.fetch = fetchMock as unknown as typeof fetch;

      await instance.verifyBinanceReachability();

      expect(fetchMock).toHaveBeenCalledWith("https://api.binance.com/api/v3/ticker/price?symbol=USDTBRL", expect.anything());
      expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining("Binance price feed reachable: USD-BRL spot rate 5.2"));
      expect(loggerMock.error).not.toHaveBeenCalled();
    });

    it("should log an error line when Binance is unreachable", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => new Response("blocked", { status: 451 }));
      global.fetch = fetchMock as unknown as typeof fetch;

      await instance.verifyBinanceReachability();

      expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining("Binance price feed UNREACHABLE for USD-BRL"));
    });

    it("should not throw when Binance is unreachable", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => {
        throw new Error("network down");
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      expect(instance.verifyBinanceReachability()).resolves.toBeUndefined();
    });
  });

  describe("convertCurrency", () => {
    it("should return the same amount when currencies match", async () => {
      const result = await PriceFeedService.getInstance().convertCurrency("100", BRL, BRL);
      expect(result).toBe("100.00");
    });

    it("should perform 1:1 conversion between USD-like stablecoins", async () => {
      const result = await PriceFeedService.getInstance().convertCurrency("100", USDC, USDT);
      expect(result).toBe("100");
    });

    it("should convert USD to fiat using fastforex rate", async () => {
      const instance = PriceFeedService.getInstance();
      instance.getCryptoPrice = mock(async () => 5.86);

      const result = await instance.convertCurrency("100", USDC, BRL);

      expect(result).toBe("585.00");
    });

    it("should convert fiat to USD using inverse fastforex rate", async () => {
      const instance = PriceFeedService.getInstance();
      instance.getCryptoPrice = mock(async () => 5.86);

      const result = await instance.convertCurrency("585", BRL, USDC);

      expect(result).toBe("100.00000000");
    });

    it("should convert USD to crypto using getCryptoPrice", async () => {
      const instance = PriceFeedService.getInstance();
      instance.getCryptoPrice = mock(async () => 3000);

      const result = await instance.convertCurrency("300", USDC, ETH);

      expect(result).toBe("0.10000000");
      expect(instance.getCryptoPrice).toHaveBeenCalledWith("ethereum", "usd");
    });

    it("should convert crypto to USD using getCryptoPrice", async () => {
      const instance = PriceFeedService.getInstance();
      instance.getCryptoPrice = mock(async () => 3000);

      const result = await instance.convertCurrency("0.1", ETH, USDC);

      expect(result).toBe("300.00000000");
      expect(instance.getCryptoPrice).toHaveBeenCalledWith("ethereum", "usd");
    });

    it("should respect custom decimal precision", async () => {
      const instance = PriceFeedService.getInstance();
      instance.getCryptoPrice = mock(async () => 5.86);

      const result = await instance.convertCurrency("100", USDC, BRL, 2);

      expect(result).toBe("585.00");
    });

    it("should throw instead of returning the original amount when conversion providers fail", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => new Response("fastforex down", { status: 500 }));
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => {
        throw new Error("cg down");
      });

      await expect(instance.convertCurrency("100", USDC, BRL)).rejects.toThrow("cg down");
    });

    it("should return the original amount only through the explicit fallback helper", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => new Response("fastforex down", { status: 500 }));
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => {
        throw new Error("cg down");
      });

      const result = await instance.convertCurrencyOrOriginal("100", USDC, BRL);

      expect(result).toBe("100");
    });

    it("should return null through the nullable helper when conversion fails", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => new Response("fastforex down", { status: 500 }));
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => {
        throw new Error("cg down");
      });

      const result = await instance.convertCurrencyOrNull("100", USDC, BRL);

      expect(result).toBeNull();
    });
  });

  describe("getFiatToUsdExchangeRate", () => {
    it("should return the inverse of the guarded USD-to-fiat rate", async () => {
      const instance = PriceFeedService.getInstance();
      instance.getCryptoPrice = mock(async () => 5.86);

      const rate = await instance.getFiatToUsdExchangeRate(BRL);

      expect(rate.toFixed(8)).toBe("0.17094017");
    });

    it("should return one for USD without calling external providers", async () => {
      const instance = PriceFeedService.getInstance();

      const rate = await instance.getFiatToUsdExchangeRate(USD);

      expect(rate.toString()).toBe("1");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("Configuration", () => {
    it("should read fastforex config from config/vars", () => {
      Reflect.set(PriceFeedService, "instance", undefined);
      const instance = PriceFeedService.getInstance();
      expect(Reflect.get(instance, "fastforexApiBaseUrl")).toBe(config.priceProviders.fastforex.baseUrl);
      expect(Reflect.get(instance, "fastforexApiKey")).toBe(config.priceProviders.fastforex.apiKey);
    });

    it("should read Binance config from config/vars", () => {
      Reflect.set(PriceFeedService, "instance", undefined);
      const instance = PriceFeedService.getInstance();
      expect(Reflect.get(instance, "binanceApiBaseUrl")).toBe(config.priceProviders.binance.baseUrl);
    });

    it("should read CoinGecko config from config/vars", () => {
      Reflect.set(PriceFeedService, "instance", undefined);
      const instance = PriceFeedService.getInstance();
      expect(Reflect.get(instance, "coingeckoApiBaseUrl")).toBe(config.priceProviders.coingecko.baseUrl);
      expect(Reflect.get(instance, "cryptoCacheTtlMs")).toBe(config.priceProviders.coingecko.cryptoCacheTtlMs);
      expect(Reflect.get(instance, "fiatCacheTtlMs")).toBe(config.priceProviders.coingecko.fiatCacheTtlMs);
    });

    it("should keep loaded configuration values when environment variables change after import", () => {
      process.env.COINGECKO_API_URL = "https://custom-api.example.com";
      process.env.CRYPTO_CACHE_TTL_MS = "60000";
      process.env.FIAT_CACHE_TTL_MS = "120000";

      Reflect.set(PriceFeedService, "instance", undefined);
      const instance = PriceFeedService.getInstance();

      expect(Reflect.get(instance, "coingeckoApiBaseUrl")).toBe(config.priceProviders.coingecko.baseUrl);
      expect(Reflect.get(instance, "cryptoCacheTtlMs")).toBe(config.priceProviders.coingecko.cryptoCacheTtlMs);
      expect(Reflect.get(instance, "fiatCacheTtlMs")).toBe(config.priceProviders.coingecko.fiatCacheTtlMs);
    });
  });
});
