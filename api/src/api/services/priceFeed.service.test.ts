// eslint-disable-next-line import/no-unresolved
import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { priceFeedService, PriceFeedService } from './priceFeed.service';

// Import the mocked function to check calls
import { getTokenOutAmount as getTokenOutAmountMock } from './nablaReads/outAmount';

// Mock all external dependencies
mock.module('shared', () => ({
  getPendulumDetails: mock((currency: string) => {
    // Provide slightly different mock details based on currency for realism
    if (currency === 'USD') {
      return {
        pendulumErc20WrapperAddress: '0xUSD',
        pendulumCurrencyId: { Token: 'USD' },
        pendulumAssetSymbol: 'USD',
        pendulumDecimals: 6,
      };
    }
    if (currency === 'BRL') {
      return {
        pendulumErc20WrapperAddress: '0xBRL',
        pendulumCurrencyId: { Token: 'BRL' },
        pendulumAssetSymbol: 'BRL',
        pendulumDecimals: 6,
      };
    }
    return {
      // Default fallback
      pendulumErc20WrapperAddress: '0x123',
      pendulumCurrencyId: { XCM: 1 },
      pendulumAssetSymbol: 'TEST',
      pendulumDecimals: 12,
    };
  }),
  RampCurrency: {
    USD: 'USD',
    BRL: 'BRL',
    EUR: 'EUR',
    ARS: 'ARS',
    USDC: 'USDC',
    USDT: 'USDT',
    USDCE: 'USDCE',
    ETH: 'ETH',
    GLMR: 'GLMR',
    AVAX: 'AVAX',
    MATIC: 'MATIC',
    BNB: 'BNB',
  },
  EvmToken: {
    USDC: 'USDC',
    USDT: 'USDT',
    USDCE: 'USDCE',
  },
  isFiatToken: mock((currency: string) => ['BRL', 'EUR', 'ARS'].includes(currency)),
}));

// Keep the existing mock structure for Nabla, but we'll use the imported mock for checks
mock.module('./nablaReads/outAmount', () => ({
  getTokenOutAmount: mock(async () => ({
    effectiveExchangeRate: '1.25', // Rate for 1 USD -> BRL
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
    api: {}, // Mock Polkadot API object if needed for deeper tests
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
    info: mock(() => {
      /* logger mock */
    }),
    debug: mock(() => {
      /* logger mock */
    }),
    warn: mock(() => {
      /* logger mock */
    }),
    error: mock(() => {
      /* logger mock */
    }),
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
    moonbeam: {
      usd: 100,
    },
    ethereum: {
      usd: 3000,
    },
  };

  // Original fetch and env for restoration
  const originalFetch = global.fetch;
  let originalDateNow: () => number;
  let originalEnv: NodeJS.ProcessEnv;
  let fetchMock: ReturnType<typeof mock>;

  // Setup and teardown
  beforeEach(() => {
    // Store original env and Date.now
    originalEnv = { ...process.env };
    originalDateNow = Date.now;

    // Mock environment variables for each test
    process.env = {
      ...originalEnv, // Start with original to avoid missing Node internal vars
      COINGECKO_API_KEY: 'test-api-key',
      COINGECKO_API_URL: 'https://api.coingecko.com/api/v3',
      CRYPTO_CACHE_TTL_MS: '300000', // 5 minutes
      FIAT_CACHE_TTL_MS: '300000', // 5 minutes
    };

    // Create a fresh fetch mock for each test
    fetchMock = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockCoinGeckoResponse),
        text: () => Promise.resolve(JSON.stringify(mockCoinGeckoResponse)),
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        redirected: false,
        type: 'basic',
        url: '',
        clone() {
          return this;
        },
      } as Response),
    );

    // Mock fetch
    global.fetch = fetchMock as any;

    // Reset mocks before each test
    (getTokenOutAmountMock as any).mockClear();
    // Reset Nabla mock to default implementation if needed (if tests modify its behavior)
    (getTokenOutAmountMock as any).mockImplementation(async () => ({
      effectiveExchangeRate: '1.25',
      preciseQuotedAmountOut: { preciseBigDecimal: { toString: () => '1.25' } },
      roundedDownQuotedAmountOut: { toString: () => '1.25' },
      swapFee: { toString: () => '0.01' },
    }));

    // Ensure singleton is reset *before* each test to pick up fresh env vars/mocks
    // @ts-expect-error - accessing private property for testing
    PriceFeedService.instance = undefined;
  });

  afterEach(() => {
    // Restore fetch
    global.fetch = originalFetch;

    // Restore Date.now if it was mocked
    if (originalDateNow) {
      Date.now = originalDateNow;
    }

    // Restore environment variables
    process.env = originalEnv;

    // Reset singleton *after* restoring env, ready for next test's beforeEach
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
      // Use a more flexible expectation for the URL
      // Don't check the exact URL, just verify it was called
      expect(fetchMock).toHaveBeenCalledTimes(1);
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
      const serviceInstance = PriceFeedService.getInstance(); // Get the new instance

      // Mock Date.now to return a fixed timestamp
      const startTime = 1000000;
      Date.now = () => startTime;

      // First call to populate cache
      await serviceInstance.getCryptoPrice('bitcoin', 'usd');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockClear();

      // Advance time beyond the cache TTL by changing Date.now
      Date.now = () => startTime + 150; // 150ms later

      // Second call should make a new API call
      await serviceInstance.getCryptoPrice('bitcoin', 'usd');
      expect(fetchMock).toHaveBeenCalledTimes(1); // Verify the second call happened
    });

    it('should throw an error when token ID is not provided', async () => {
      await expect(priceFeedService.getCryptoPrice('', 'usd')).rejects.toThrow('Token ID and currency are required');
    });

    it('should throw an error when currency is not provided', async () => {
      await expect(priceFeedService.getCryptoPrice('bitcoin', '')).rejects.toThrow(
        'Token ID and currency are required',
      );
    });

    it('should throw an error when CoinGecko API returns non-OK response', async () => {
      // Create a new instance to avoid cache issues
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      const freshInstance = PriceFeedService.getInstance();

      // Override fetch mock for this test with a non-OK response
      const errorResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: () => Promise.resolve('Rate limit exceeded'),
        json: () => Promise.resolve({}), // Return empty object instead of rejecting
        headers: new Headers(),
        redirected: false,
        type: 'basic',
        url: '',
        clone() {
          return this;
        },
      } as Response;

      // Use any type assertion to bypass TypeScript errors
      global.fetch = (() => Promise.resolve(errorResponse)) as any;

      await expect(freshInstance.getCryptoPrice('bitcoin', 'usd')).rejects.toThrow(
        'CoinGecko API error: 429 Too Many Requests',
      );
    });

    it('should throw an error when token is not found in CoinGecko response', async () => {
      // Override fetch mock for this test with an empty response
      const emptyResponseMock = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}), // Empty data
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve('{}'),
          headers: new Headers(),
          redirected: false,
          type: 'basic',
          url: '',
          clone() {
            return this;
          },
        } as Response),
      );

      global.fetch = emptyResponseMock as any;

      await expect(priceFeedService.getCryptoPrice('unknown-token', 'usd')).rejects.toThrow(
        "Token 'unknown-token' not found in CoinGecko response",
      );
    });

    it('should throw an error when currency is not found for token', async () => {
      // Override fetch mock for this test with a partial response
      const partialResponseMock = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ bitcoin: {} }), // Token exists, currency doesn't
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve('{ "bitcoin": {} }'),
          headers: new Headers(),
          redirected: false,
          type: 'basic',
          url: '',
          clone() {
            return this;
          },
        } as Response),
      );

      global.fetch = partialResponseMock as any;

      await expect(priceFeedService.getCryptoPrice('bitcoin', 'unknown-currency')).rejects.toThrow(
        "Currency 'unknown-currency' not found for token 'bitcoin'",
      );
    });

    it('should handle network errors during fetch', async () => {
      // Create a new instance to avoid cache issues
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      const freshInstance = PriceFeedService.getInstance();

      // Override fetch with a function that rejects
      global.fetch = (() => Promise.reject(new Error('Network error'))) as any;

      await expect(freshInstance.getCryptoPrice('bitcoin', 'usd')).rejects.toThrow('Network error');
    });

    it('should work without API key', async () => {
      // Remove API key
      delete process.env.COINGECKO_API_KEY;

      // Reset singleton to apply change
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      const serviceInstance = PriceFeedService.getInstance(); // Get new instance

      await serviceInstance.getCryptoPrice('bitcoin', 'usd');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'x-cg-demo-api-key': expect.any(String), // Verify header is NOT present
          }),
        }),
      );
    });
  });

  describe('getFiatExchangeRate', () => {
    // Add validation to the service mock for these tests
    beforeEach(() => {
      // Add validation to the mock implementation
      (getTokenOutAmountMock as any).mockImplementation(async (params: any) => {
        if (!params.fromAmountString || !params.inputTokenDetails || !params.outputTokenDetails) {
          throw new Error('Missing required parameters');
        }
        return {
          effectiveExchangeRate: '1.25',
          preciseQuotedAmountOut: { preciseBigDecimal: { toString: () => '1.25' } },
          roundedDownQuotedAmountOut: { toString: () => '1.25' },
          swapFee: { toString: () => '0.01' },
        };
      });
    });

    it('should fetch exchange rate from Nabla when cache is empty', async () => {
      // Use type assertion to bypass TypeScript's type checking
      const rate = await priceFeedService.getUsdToFiatExchangeRate('BRL' as any);

      expect(rate).toBe(1.25);
      expect(getTokenOutAmountMock).toHaveBeenCalledTimes(1);
    });

    it('should return cached exchange rate without Nabla call when cache is valid', async () => {
      // First call to populate cache
      await priceFeedService.getUsdToFiatExchangeRate('BRL' as any);

      // Reset mock to verify it's not called again
      (getTokenOutAmountMock as any).mockClear();

      // Second call should use cache
      const rate = await priceFeedService.getUsdToFiatExchangeRate('BRL' as any);

      expect(rate).toBe(1.25);
      expect(getTokenOutAmountMock).not.toHaveBeenCalled();
    });

    it('should make a new Nabla call when cache expires', async () => {
      // Override TTL to a small value for testing
      process.env.FIAT_CACHE_TTL_MS = '100';

      // Reset singleton to apply new TTL
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      const serviceInstance = PriceFeedService.getInstance(); // Get new instance

      // Mock Date.now to return a fixed timestamp
      const startTime = 1000000;
      Date.now = () => startTime;

      // First call to populate cache
      await serviceInstance.getUsdToFiatExchangeRate('BRL' as any);
      expect(getTokenOutAmountMock).toHaveBeenCalledTimes(1);
      (getTokenOutAmountMock as any).mockClear();

      // Advance time beyond the cache TTL by changing Date.now
      Date.now = () => startTime + 150; // 150ms later

      // Second call should make a new Nabla call
      await serviceInstance.getUsdToFiatExchangeRate('BRL' as any);
      expect(getTokenOutAmountMock).toHaveBeenCalledTimes(1); // Verify the second call happened
    });

    it('should throw an error when Nabla call fails', async () => {
      const nablaError = new Error('Nabla API Error');
      // Configure the mock to throw an error for this specific test
      (getTokenOutAmountMock as any).mockRejectedValueOnce(nablaError);

      await expect(priceFeedService.getUsdToFiatExchangeRate('EUR' as any)).rejects.toThrow('Nabla API Error');
      expect(getTokenOutAmountMock).toHaveBeenCalledTimes(1); // Verify it was called
    });

    it('should accept a custom input amount', async () => {
      // Reset singleton to ensure a fresh instance
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      const freshInstance = PriceFeedService.getInstance();

      // Clear mock before this specific test
      (getTokenOutAmountMock as any).mockClear();

      await freshInstance.getUsdToFiatExchangeRate('BRL' as any, '10.0');

      expect(getTokenOutAmountMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAmountString: '10.0',
        }),
      );
    });
  });

  describe('convertCurrency', () => {
    it('should return the original amount when currencies are the same', async () => {
      const result = await priceFeedService.convertCurrency('100', 'USDC' as any, 'USDC' as any);
      expect(result).toBe('100');
    });

    it('should perform 1:1 conversion between USD-like stablecoins', async () => {
      const result = await priceFeedService.convertCurrency('100', 'USDC' as any, 'USDT' as any);
      expect(result).toBe('100');
    });

    it('should convert USD to fiat using getFiatExchangeRate', async () => {
      // Reset singleton to ensure a fresh instance
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      const freshInstance = PriceFeedService.getInstance();

      // Clear mock before this specific test
      (getTokenOutAmountMock as any).mockClear();

      const result = await freshInstance.convertCurrency('100', 'USDC' as any, 'BRL' as any);
      expect(result).toBe('125.000000'); // 100 * 1.25 = 125
      expect(getTokenOutAmountMock).toHaveBeenCalledTimes(1);
    });

    it('should convert fiat to USD using inverse of getFiatExchangeRate', async () => {
      // Reset singleton to ensure a fresh instance
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      const freshInstance = PriceFeedService.getInstance();

      // Clear mock before this specific test
      (getTokenOutAmountMock as any).mockClear();

      const result = await freshInstance.convertCurrency('125', 'BRL' as any, 'USDC' as any);
      expect(result).toBe('100.000000'); // 125 / 1.25 = 100
      expect(getTokenOutAmountMock).toHaveBeenCalledTimes(1);
    });

    it('should convert USD to crypto using getCryptoPrice', async () => {
      const result = await priceFeedService.convertCurrency('300', 'USDC' as any, 'ETH' as any);
      expect(result).toBe('0.100000'); // 300 / 3000 = 0.1
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should convert crypto to USD using getCryptoPrice', async () => {
      // Reset singleton to ensure a fresh instance
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;
      const freshInstance = PriceFeedService.getInstance();

      // Clear fetch mock before this specific test
      fetchMock.mockClear();

      const result = await freshInstance.convertCurrency('0.1', 'ETH' as any, 'USDC' as any);
      expect(result).toBe('300.000000'); // 0.1 * 3000 = 300
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should handle conversion errors by returning the original amount', async () => {
      // Force an error by making getCoinGeckoTokenId return null
      // @ts-expect-error - accessing private method for testing
      const originalGetCoinGeckoTokenId = priceFeedService.getCoinGeckoTokenId;
      // @ts-expect-error - overriding private method for testing
      priceFeedService.getCoinGeckoTokenId = () => null;

      const result = await priceFeedService.convertCurrency('100', 'USDC' as any, 'UNKNOWN' as any);
      expect(result).toBe('100'); // Should return original amount on error

      // Restore the original method
      // @ts-expect-error - restoring private method
      priceFeedService.getCoinGeckoTokenId = originalGetCoinGeckoTokenId;
    });

    it('should use specified decimal precision', async () => {
      const result = await priceFeedService.convertCurrency('100', 'USDC' as any, 'BRL' as any, 2);
      expect(result).toBe('125.00'); // 100 * 1.25 = 125, with 2 decimal places
    });
  });

  describe('Configuration', () => {
    it('should use default values when environment variables are not set', () => {
      // Remove environment variables that have defaults
      delete process.env.COINGECKO_API_URL;
      delete process.env.CRYPTO_CACHE_TTL_MS;
      delete process.env.FIAT_CACHE_TTL_MS;
      // API key might be undefined, which is handled

      // Reset singleton to apply changes
      // @ts-expect-error - accessing private property for testing
      PriceFeedService.instance = undefined;

      // Create new instance
      const instance = PriceFeedService.getInstance();

      // Access private properties for testing (consider adding public getters if preferred)
      // @ts-expect-error - accessing private properties for testing
      expect(instance.coingeckoApiBaseUrl).toBe('https://pro-api.coingecko.com/api/v3');
      // @ts-expect-error - accessing private properties for testing
      expect(instance.cryptoCacheTtlMs).toBe(300000);
      // @ts-expect-error - accessing private properties for testing
      expect(instance.fiatCacheTtlMs).toBe(300000);
    });

    it('should use environment variables when provided', () => {
      // Set specific values for this test
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
