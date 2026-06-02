// eslint-disable-next-line import/no-unresolved
import {afterEach, beforeEach, describe, expect, it, mock} from "bun:test";
import {PriceFeedService, priceFeedService} from "./priceFeed.service";

mock.module("@vortexfi/shared", () => ({
  ApiManager: {
    getInstance: () => ({
      getApi: async () => ({ api: {} })
    })
  },
  EvmToken: { USDC: "USDC", USDCE: "USDC.e", USDT: "USDT" },
  getTokenUsdPrice: () => undefined,
  isFiatToken: (currency: string) => ["BRL", "EUR", "ARS", "MXN", "COP"].includes(currency),
  normalizeTokenSymbol: (symbol: string) => symbol,
  UsdLikeEvmToken: { USDC: "USDC", USDCE: "USDC.e", USDT: "USDT" }
}));

mock.module("../../config/logger", () => ({
  default: { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} }
}));

mock.module("../../../index", () => ({}));

describe("PriceFeedService", () => {
  let originalDateNow: () => number;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalDateNow = Date.now;
    process.env = {
      ...originalEnv,
      COINGECKO_API_KEY: "test-api-key",
      COINGECKO_API_URL: "https://api.coingecko.com/api/v3",
      CRYPTO_CACHE_TTL_MS: "300000",
      FASTFOREX_API_KEY: "test-fastforex-key",
      FASTFOREX_API_URL: "https://api.fastforex.io",
      FIAT_CACHE_TTL_MS: "300000"
    } as any;
    // @ts-expect-error - accessing private property for testing
    PriceFeedService.instance = undefined;
  });

  afterEach(() => {
    if (originalDateNow) Date.now = originalDateNow;
    process.env = originalEnv;
    // @ts-expect-error - accessing private property for testing
    PriceFeedService.instance = undefined;
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      expect(PriceFeedService.getInstance()).toBe(PriceFeedService.getInstance());
    });

    it("should export a singleton instance", () => {
      expect(priceFeedService).toBeInstanceOf(PriceFeedService);
    });
  });

  describe("getUsdToFiatExchangeRate", () => {
    it("should use fastforex as primary source", async () => {
      const instance = PriceFeedService.getInstance();
      // @ts-expect-error
      instance.getFastforexRate = mock(async () => 5.85);

      const rate = await instance.getUsdToFiatExchangeRate("BRL" as any);
      expect(rate).toBe(5.85);
      // @ts-expect-error
      expect(instance.getFastforexRate).toHaveBeenCalledWith("USD", "BRL");
    });

    it("should return cached rate on second call", async () => {
      const instance = PriceFeedService.getInstance();
      // @ts-expect-error
      instance.getFastforexRate = mock(async () => 5.85);

      await instance.getUsdToFiatExchangeRate("BRL" as any);
      // @ts-expect-error
      instance.getFastforexRate.mockClear();

      const rate = await instance.getUsdToFiatExchangeRate("BRL" as any);
      expect(rate).toBe(5.85);
      // @ts-expect-error
      expect(instance.getFastforexRate).not.toHaveBeenCalled();
    });

    it("should refetch after cache expires", async () => {
      const instance = PriceFeedService.getInstance();

      let callCount = 0;
      // @ts-expect-error
      instance.getFastforexRate = mock(async () => {
        callCount++;
        return callCount === 1 ? 5.85 : 5.90;
      });

      const startTime = 1000000;
      Date.now = () => startTime;
      await instance.getUsdToFiatExchangeRate("BRL" as any);

      Date.now = () => startTime + 400_000; // past 300s default TTL
      const rate = await instance.getUsdToFiatExchangeRate("BRL" as any);
      expect(rate).toBe(5.90);
    });

    it("should fall back to CoinGecko when fastforex fails", async () => {
      const instance = PriceFeedService.getInstance();
      // @ts-expect-error
      instance.getFastforexRate = mock(async () => { throw new Error("fastforex down"); });
      instance.getCryptoPrice = mock(async () => 5.92);

      const rate = await instance.getUsdToFiatExchangeRate("BRL" as any);
      expect(rate).toBe(5.92);
    });

    it("should throw when both fastforex and CoinGecko fail", async () => {
      const instance = PriceFeedService.getInstance();
      // @ts-expect-error
      instance.getFastforexRate = mock(async () => { throw new Error("fastforex down"); });
      instance.getCryptoPrice = mock(async () => { throw new Error("cg down"); });

      await expect(instance.getUsdToFiatExchangeRate("BRL" as any)).rejects.toThrow("cg down");
    });

    it("should throw when fastforex returns invalid rate and CoinGecko also fails", async () => {
      const instance = PriceFeedService.getInstance();
      // @ts-expect-error
      instance.getFastforexRate = mock(async () => { throw new Error("invalid rate"); });
      instance.getCryptoPrice = mock(async () => { throw new Error("cg down"); });

      await expect(instance.getUsdToFiatExchangeRate("BRL" as any)).rejects.toThrow();
    });
  });

  describe("convertCurrency", () => {
    it("should return the same amount when currencies match", async () => {
      const result = await priceFeedService.convertCurrency("100", "BRL" as any, "BRL" as any);
      expect(result).toBe("100.00");
    });

    it("should perform 1:1 conversion between USD-like stablecoins", async () => {
      const result = await priceFeedService.convertCurrency("100", "USDC" as any, "USDT" as any);
      expect(result).toBe("100");
    });

    it("should convert USD to fiat using fastforex rate", async () => {
      const instance = PriceFeedService.getInstance();
      // @ts-expect-error
      instance.getFastforexRate = mock(async () => 5.85);

      const result = await instance.convertCurrency("100", "USDC" as any, "BRL" as any);
      expect(result).toBe("585.00"); // 100 * 5.85 = 585, 2 decimals for fiat
    });

    it("should convert fiat to USD using inverse fastforex rate", async () => {
      const instance = PriceFeedService.getInstance();
      // @ts-expect-error
      instance.getFastforexRate = mock(async () => 5.85);

      const result = await instance.convertCurrency("585", "BRL" as any, "USDC" as any);
      expect(result).toBe("100.00000000"); // 585 / 5.85 = 100, 8 decimals for crypto
    });

    it("should respect custom decimal precision", async () => {
      const instance = PriceFeedService.getInstance();
      // @ts-expect-error
      instance.getFastforexRate = mock(async () => 5.85);

      const result = await instance.convertCurrency("100", "USDC" as any, "BRL" as any, 2);
      expect(result).toBe("585.00");
    });
  });

  describe("Configuration", () => {
    it("should read fastforex config", () => {
      const instance = PriceFeedService.getInstance();
      // @ts-expect-error
      expect(instance.fastforexApiBaseUrl).toBeDefined();
      // @ts-expect-error
      expect(instance.fastforexApiKey).toBeDefined();
    });

    it("should read CoinGecko config", () => {
      const instance = PriceFeedService.getInstance();
      // @ts-expect-error
      expect(instance.coingeckoApiBaseUrl).toBeDefined();
      // @ts-expect-error
      expect(instance.cryptoCacheTtlMs).toBeGreaterThan(0);
      // @ts-expect-error
      expect(instance.fiatCacheTtlMs).toBeGreaterThan(0);
    });
  });
});
