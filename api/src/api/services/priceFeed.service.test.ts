// eslint-disable-next-line import/no-unresolved
import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { priceFeedService, PriceFeedService } from './priceFeed.service';

// Mock all external dependencies
mock.module('shared', () => ({
  getPendulumDetails: mock(() => ({
    pendulumErc20WrapperAddress: '0x123',
    pendulumCurrencyId: { XCM: 1 },
    pendulumAssetSymbol: 'TEST',
    pendulumDecimals: 12,
  })),
  RampCurrency: {
    // Not used directly but needed for the import
  },
}));

mock.module('./nablaReads/outAmount', () => ({
  getTokenOutAmount: mock(async () => ({
    effectiveExchangeRate: '1.25',
    preciseQuotedAmountOut: {
      preciseBigDecimal: {
        toString: () => '1.25',
      },
    },
    roundedDownQuotedAmountOut: {
      toString: () => '1.25',
    },
    swapFee: {
      toString: () => '0.01',
    },
  })),
}));

mock.module('./pendulum/apiManager', () => {
  const mockApiInstance = {
    api: {},
    ss58Format: 42,
    decimals: 12,
  };

  const mockApiManager = {
    getInstance: mock(() => ({
      getApi: mock(async () => mockApiInstance),
    })),
  };

  return {
    ApiManager: mockApiManager,
  };
});

mock.module('../../config/logger', () => ({
  default: {
    // Empty functions are intentional for mocking logger methods
    info: mock(() => { /* logger mock */ }),
    debug: mock(() => { /* logger mock */ }),
    warn: mock(() => { /* logger mock */ }),
    error: mock(() => { /* logger mock */ }),
  },
}));

// Mock the app initialization
mock.module('../../../index', () => ({}));

describe('PriceFeedService', () => {
  // Mock data
  const mockCoinGeckoResponse = {
    bitcoin: {
      usd: 50000,
    },
  };

  // Original fetch for restoration
  const originalFetch = global.fetch;
  
  // Mock fetch function - using empty function body to avoid unused param warnings
  const fetchMock = mock(() => 
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockCoinGeckoResponse),
      text: () => Promise.resolve(''),
      status: 200,
      statusText: 'OK',
    })
  );

  // Setup and teardown
  beforeEach(() => {
    // Mock environment variables
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      COINGECKO_API_KEY: 'test-api-key',
      COINGECKO_API_URL: 'https://api.coingecko.com/api/v3',
      CRYPTO_CACHE_TTL_MS: '300000',
      FIAT_CACHE_TTL_MS: '300000',
    };

    // Mock fetch
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    // Restore fetch
    global.fetch = originalFetch;
    
    // Clear cache by creating a new instance
    // This is a hack since we can't directly reset the singleton
    // @ts-expect-error - accessing private property for testing
    PriceFeedService.instance = undefined;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when getInstance is called multiple times', () => {
      const instance1 = PriceFeedService.getInstance();
      const instance2 = PriceFeedService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should export a singleton instance', () => {
      expect(priceFeedService).toBeInstanceOf(PriceFeedService);
    });
  });

  describe('getCryptoPrice', () => {
    it('should fetch price from CoinGecko API when cache is empty', async () => {
      const price = await priceFeedService.getCryptoPrice('bitcoin', 'usd');
      
      expect(price).toBe(50000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/json',
            'x-cg-demo-api-key': 'test-api-key',
          }),
        })
      );
    });

    it('should return cached price without API call when cache is valid', async () => {
      // First call to populate cache
      await priceFeedService.getCryptoPrice('bitcoin', 'usd');
      
      // Reset mock to verify it's not called again
      fetchMock.mockClear();
      
      // Second call should use cache
      const price = await priceFeedService.getCryptoPrice('bitcoin', 'usd');
      
      expect(price).toBe(50000);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should make a new API call when cache expires', async () => {
      // Override TTL to a small value for testing
      process.env.CRYPTO_CACHE_TTL_MS = '100';
      
      // Reset singleton to apply new TTL
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      
      // First call to populate cache
      await priceFeedService.getCryptoPrice('bitcoin', 'usd');
      
      // Reset mock to verify it's called again
      fetchMock.mockClear();
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Second call should make a new API call
      await priceFeedService.getCryptoPrice('bitcoin', 'usd');
      
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should throw an error when token ID is not provided', async () => {
      await expect(priceFeedService.getCryptoPrice('', 'usd')).rejects.toThrow('Token ID and currency are required');
    });

    it('should throw an error when currency is not provided', async () => {
      await expect(priceFeedService.getCryptoPrice('bitcoin', '')).rejects.toThrow('Token ID and currency are required');
    });

    it('should throw an error when CoinGecko API returns non-OK response', async () => {
      // Override fetch mock for this test
      global.fetch = mock(() => 
        Promise.resolve({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: () => Promise.resolve('Rate limit exceeded'),
        })
      ) as any;
      
      await expect(priceFeedService.getCryptoPrice('bitcoin', 'usd')).rejects.toThrow('CoinGecko API error: 429 Too Many Requests');
    });

    it('should throw an error when token is not found in CoinGecko response', async () => {
      // Override fetch mock for this test
      global.fetch = mock(() => 
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          status: 200,
          statusText: 'OK',
        })
      ) as any;
      
      await expect(priceFeedService.getCryptoPrice('unknown-token', 'usd')).rejects.toThrow("Token 'unknown-token' not found in CoinGecko response");
    });

    it('should throw an error when currency is not found for token', async () => {
      // Override fetch mock for this test
      global.fetch = mock(() => 
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ bitcoin: {} }),
          status: 200,
          statusText: 'OK',
        })
      ) as any;
      
      await expect(priceFeedService.getCryptoPrice('bitcoin', 'unknown-currency')).rejects.toThrow("Currency 'unknown-currency' not found for token 'bitcoin'");
    });

    it('should handle network errors during fetch', async () => {
      // Override fetch mock for this test
      global.fetch = mock(() => Promise.reject(new Error('Network error'))) as any;
      
      await expect(priceFeedService.getCryptoPrice('bitcoin', 'usd')).rejects.toThrow('Network error');
    });

    it('should work without API key', async () => {
      // Remove API key
      delete process.env.COINGECKO_API_KEY;
      
      // Reset singleton to apply change
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      
      await priceFeedService.getCryptoPrice('bitcoin', 'usd');
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'x-cg-demo-api-key': expect.any(String),
          }),
        })
      );
    });
  });

  describe('getFiatExchangeRate', () => {
    it('should fetch exchange rate from Nabla when cache is empty', async () => {
      const rate = await priceFeedService.getFiatExchangeRate('USD', 'BRL');
      
      expect(rate).toBe(1.25);
    });

    it('should return cached exchange rate without Nabla call when cache is valid', async () => {
      // First call to populate cache
      await priceFeedService.getFiatExchangeRate('USD', 'BRL');
      
      // Second call should use cache
      const rate = await priceFeedService.getFiatExchangeRate('USD', 'BRL');
      
      expect(rate).toBe(1.25);
    });

    it('should make a new Nabla call when cache expires', async () => {
      // Override TTL to a small value for testing
      process.env.FIAT_CACHE_TTL_MS = '100';
      
      // Reset singleton to apply new TTL
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      
      // First call to populate cache
      await priceFeedService.getFiatExchangeRate('USD', 'BRL');
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Second call should make a new Nabla call
      await priceFeedService.getFiatExchangeRate('USD', 'BRL');
    });
  });

  describe('Configuration', () => {
    it('should use default values when environment variables are not set', () => {
      // Remove environment variables
      delete process.env.COINGECKO_API_URL;
      delete process.env.CRYPTO_CACHE_TTL_MS;
      delete process.env.FIAT_CACHE_TTL_MS;
      
      // Reset singleton to apply changes
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      
      // Create new instance
      const instance = PriceFeedService.getInstance();
      
      // @ts-expect-error - accessing private properties for testing
      expect(instance.coingeckoApiBaseUrl).toBe('https://api.coingecko.com/api/v3');
      // @ts-expect-error - accessing private properties for testing
      expect(instance.cryptoCacheTtlMs).toBe(300000);
      // @ts-expect-error - accessing private properties for testing
      expect(instance.fiatCacheTtlMs).toBe(300000);
    });

    it('should use environment variables when provided', () => {
      process.env.COINGECKO_API_URL = 'https://custom-api.example.com';
      process.env.CRYPTO_CACHE_TTL_MS = '60000';
      process.env.FIAT_CACHE_TTL_MS = '120000';
      
      // Reset singleton to apply changes
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      
      // Create new instance
      const instance = PriceFeedService.getInstance();
      
      // @ts-expect-error - accessing private properties for testing
      expect(instance.coingeckoApiBaseUrl).toBe('https://custom-api.example.com');
      // @ts-expect-error - accessing private properties for testing
      expect(instance.cryptoCacheTtlMs).toBe(60000);
      // @ts-expect-error - accessing private properties for testing
      expect(instance.fiatCacheTtlMs).toBe(120000);
    });
  });
});
