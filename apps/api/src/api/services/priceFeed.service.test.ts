// eslint-disable-next-line import/no-unresolved
import {afterAll, afterEach, beforeEach, describe, expect, it, mock} from "bun:test";
import type {RampCurrency} from "@vortexfi/shared";

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

process.env = {
  ...originalEnv,
  COINGECKO_API_KEY: "test-api-key",
  COINGECKO_API_URL: "https://api.coingecko.com/api/v3",
  CRYPTO_CACHE_TTL_MS: "300000",
  FASTFOREX_API_KEY: "test-fastforex-key",
  FASTFOREX_API_URL: "https://api.fastforex.io",
  FIAT_CACHE_TTL_MS: "300000"
} as NodeJS.ProcessEnv;

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

mock.module("../../../index", () => ({}));

const { PriceFeedService, priceFeedService } = await import("./priceFeed.service");

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

  beforeEach(() => {
    originalDateNow = Date.now;
    fetchMock = mock(async () => mockFastforexResponse(5.85));
    global.fetch = fetchMock as unknown as typeof fetch;
    Object.values(loggerMock).forEach(logger => logger.mockClear());
    Reflect.set(PriceFeedService, "instance", undefined);
  });

  afterEach(() => {
    Date.now = originalDateNow;
    global.fetch = originalFetch;
    Reflect.set(PriceFeedService, "instance", undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    Reflect.set(PriceFeedService, "instance", undefined);
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
    it("should use fastforex as primary source", async () => {
      const instance = PriceFeedService.getInstance();
      instance.getCryptoPrice = mock(async () => 5.86);

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.85);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.fastforex.io/fetch-one?from=USD&to=BRL",
        expect.anything()
      );
      expect(instance.getCryptoPrice).toHaveBeenCalledWith("usd-coin", "brl");
      const [, options] = fetchMock.mock.calls[0] as [string, { headers: Headers }];
      expect(options.headers.get("Accept")).toBe("application/json");
      expect(options.headers.get("X-API-Key")).toBe("test-fastforex-key");
    });

    it("should preserve path components in configured fastforex base URL", async () => {
      const instance = PriceFeedService.getInstance();
      Reflect.set(instance, "fastforexApiBaseUrl", "https://api.fastforex.io/v1");
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
      fetchMock = mock(async () => mockFastforexResponse(++callCount === 1 ? 5.85 : 5.9));
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

    it("should fall back to CoinGecko when fastforex fails", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => new Response("fastforex down", { status: 500 }));
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => 5.92);

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.92);
      expect(instance.getCryptoPrice).toHaveBeenCalledWith("usd-coin", "brl");
    });

    it("should skip fastforex and fall back to CoinGecko when fastforex key is missing", async () => {
      const instance = PriceFeedService.getInstance();
      Reflect.set(instance, "fastforexApiKey", undefined);
      instance.getCryptoPrice = mock(async () => 5.92);

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.92);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(instance.getCryptoPrice).toHaveBeenCalledWith("usd-coin", "brl");
    });

    it("should throw when both fastforex and CoinGecko fail", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => new Response("fastforex down", { status: 500 }));
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => {
        throw new Error("cg down");
      });

      await expect(instance.getUsdToFiatExchangeRate(BRL)).rejects.toThrow("cg down");
    });

    it("should throw when fastforex returns invalid rate and CoinGecko also fails", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(
        async () =>
          new Response(JSON.stringify({ base: "USD", result: { BRL: 0 } }), {
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
      fetchMock = mock(async () => mockFastforexResponse(6.2));
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => 5.85);

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.85);
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining("above 2.00% limit"));
    });

    it("should fail closed when both fastforex and CoinGecko return invalid fiat rates", async () => {
      const instance = PriceFeedService.getInstance();
      fetchMock = mock(async () => mockFastforexResponse(6.2));
      global.fetch = fetchMock as unknown as typeof fetch;
      instance.getCryptoPrice = mock(async () => 0);

      await expect(instance.getUsdToFiatExchangeRate(BRL)).rejects.toThrow("CoinGecko returned invalid rate for USD-BRL: 0");

      instance.getCryptoPrice = mock(async () => 5.85);
      fetchMock.mockClear();

      const rate = await instance.getUsdToFiatExchangeRate(BRL);

      expect(rate).toBe(5.85);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should return one for USD without calling external providers", async () => {
      const instance = PriceFeedService.getInstance();

      const rate = await instance.getUsdToFiatExchangeRate(USD);

      expect(rate).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should fetch FastForex rates for every non-USD Vortex fiat currency", async () => {
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
        expect(fetchMock).toHaveBeenCalledWith(
          `https://api.fastforex.io/fetch-one?from=USD&to=${currency}`,
          expect.anything()
        );
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
    it("should read fastforex config", () => {
      const instance = PriceFeedService.getInstance();
      expect(Reflect.get(instance, "fastforexApiBaseUrl")).toBe("https://api.fastforex.io");
      expect(Reflect.get(instance, "fastforexApiKey")).toBe("test-fastforex-key");
    });

    it("should read CoinGecko config", () => {
      const instance = PriceFeedService.getInstance();
      expect(Reflect.get(instance, "coingeckoApiBaseUrl")).toBe("https://api.coingecko.com/api/v3");
      expect(Reflect.get(instance, "cryptoCacheTtlMs")).toBe(300000);
      expect(Reflect.get(instance, "fiatCacheTtlMs")).toBe(300000);
    });
  });
});
