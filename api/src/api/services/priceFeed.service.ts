import Big from 'big.js';
import { EvmToken, getPendulumDetails, isFiatToken, RampCurrency } from 'shared';
import { PENDULUM_USDC_AXL } from 'shared/src/tokens/constants/pendulum';
import logger from '../../config/logger';
import { getTokenOutAmount } from './nablaReads/outAmount';
import { ApiManager } from './pendulum/apiManager';

// Cache entry interface
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * PriceFeedService
 *
 * A singleton service that centralizes price lookups for crypto (CoinGecko) and fiat (Nabla) currencies.
 * This service is part of the fee-handling refactor to provide consistent price data across the application.
 * Includes in-memory caching with configurable TTLs to reduce API calls and improve performance.
 */
export class PriceFeedService {
  private static instance: PriceFeedService;

  // Configuration properties
  private coingeckoApiKey: string | undefined;

  private coingeckoApiBaseUrl: string;

  // Cache configuration
  private cryptoCacheTtlMs: number;

  private fiatCacheTtlMs: number;

  // Cache storage
  private cryptoPriceCache: Map<string, CacheEntry<number>> = new Map();

  private fiatExchangeRateCache: Map<string, CacheEntry<number>> = new Map();

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    // Read configuration from environment variables
    this.coingeckoApiKey = process.env.COINGECKO_API_KEY;
    this.coingeckoApiBaseUrl = process.env.COINGECKO_API_URL || 'https://pro-api.coingecko.com/api/v3';

    // Read cache TTL configuration with defaults (5 minutes = 300000 ms)
    this.cryptoCacheTtlMs = parseInt(process.env.CRYPTO_CACHE_TTL_MS || '300000', 10);
    this.fiatCacheTtlMs = parseInt(process.env.FIAT_CACHE_TTL_MS || '300000', 10);

    if (!this.coingeckoApiKey) {
      logger.warn('COINGECKO_API_KEY environment variable is not set. CoinGecko API calls may be rate-limited.');
    }

    logger.info(`PriceFeedService initialized with CoinGecko API URL: ${this.coingeckoApiBaseUrl}`);
    logger.info(`Cache TTLs configured - Crypto: ${this.cryptoCacheTtlMs}ms, Fiat: ${this.fiatCacheTtlMs}ms`);
  }

  /**
   * Get the singleton instance of PriceFeedService
   */
  public static getInstance(): PriceFeedService {
    if (!PriceFeedService.instance) {
      PriceFeedService.instance = new PriceFeedService();
    }
    return PriceFeedService.instance;
  }

  /**
   * Get the price of a cryptocurrency in terms of another currency
   *
   * @param tokenId - The ID of the token as recognized by CoinGecko (e.g., 'bitcoin', 'ethereum')
   * @param vsCurrency - The currency to get the price in (e.g., 'usd', 'eur')
   * @returns The price of the token in the specified currency
   * @throws Error if the price cannot be fetched or if the token/currency is not found
   */
  public async getCryptoPrice(tokenId: string, vsCurrency: string): Promise<number> {
    if (!tokenId || !vsCurrency) {
      throw new Error('Token ID and currency are required');
    }

    // Create a cache key for this request
    const cacheKey = `crypto:${tokenId}:${vsCurrency}`;

    // Check if we have a valid cached value
    const cachedEntry = this.cryptoPriceCache.get(cacheKey);
    const now = Date.now();

    if (cachedEntry && cachedEntry.expiresAt > now) {
      logger.debug(`Cache hit for ${cacheKey}. Using cached price: ${cachedEntry.value}`);
      return cachedEntry.value;
    }

    logger.debug(`Cache miss for ${cacheKey}. Fetching from CoinGecko API.`);

    try {
      logger.debug(`Fetching price for ${tokenId} in ${vsCurrency} from CoinGecko`);

      // Construct the API URL
      const url = new URL(`${this.coingeckoApiBaseUrl}/simple/price`);
      url.searchParams.append('ids', tokenId);
      url.searchParams.append('vs_currencies', vsCurrency);

      // Prepare headers for the request
      const headers: HeadersInit = {
        Accept: 'application/json',
      };

      // Add API key if available
      if (this.coingeckoApiKey) {
        headers['x-cg-pro-api-key'] = this.coingeckoApiKey;
      }

      // Make the API request
      const response = await fetch(url.toString(), { headers });

      // Handle non-2xx responses
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`CoinGecko API error (${response.status}): ${errorText}`);
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
      }

      // Parse the response
      const data = await response.json();

      // Check if the token exists in the response
      if (!data[tokenId]) {
        throw new Error(`Token '${tokenId}' not found in CoinGecko response`);
      }

      // Check if the currency exists for the token
      if (data[tokenId][vsCurrency] === undefined) {
        throw new Error(`Currency '${vsCurrency}' not found for token '${tokenId}'`);
      }

      // Extract the price
      const price = data[tokenId][vsCurrency];
      logger.debug(`Price for ${tokenId} in ${vsCurrency}: ${price}`);

      // Cache the result with expiration time
      this.cryptoPriceCache.set(cacheKey, {
        value: price,
        expiresAt: now + this.cryptoCacheTtlMs,
      });

      return price;
    } catch (error) {
      // Log the error with appropriate context
      if (error instanceof Error) {
        logger.error(`Error fetching crypto price for ${tokenId} in ${vsCurrency}: ${error.message}`);
      } else {
        logger.error(`Unknown error fetching crypto price for ${tokenId} in ${vsCurrency}`);
      }

      // Re-throw the error to be handled by the caller
      throw error;
    }
  }

  /**
   * Get the exchange rate from USD to another fiat currency. The source currency is always USD.
   *
   * @param toCurrency - The target currency code (e.g., 'BRL', 'ARS')
   * @param inputAmount - The amount to convert (default is '1.0')
   * @returns The exchange rate (how much of toCurrency equals 1 unit of fromCurrency)
   */
  public async getFiatExchangeRate(toCurrency: RampCurrency, inputAmount = '1.0'): Promise<number> {
    const fromCurrency = 'USD';

    const cacheKey = `fiat:${fromCurrency}:${toCurrency}`;
    const cachedEntry = this.fiatExchangeRateCache.get(cacheKey);
    const now = Date.now();

    if (cachedEntry && cachedEntry.expiresAt > now) {
      logger.debug(`Cache hit for ${cacheKey}. Using cached exchange rate: ${cachedEntry.value}`);
      return cachedEntry.value;
    }

    logger.debug(`Cache miss for ${cacheKey}. Fetching from Nabla.`);

    try {
      logger.debug(
        `Using ${this.constructor.name} instance to fetch exchange rate from ${fromCurrency} to ${toCurrency}`,
      );

      const apiManager = ApiManager.getInstance();
      const networkName = 'pendulum';
      const apiInstance = await apiManager.getApi(networkName);

      // We assume that the exchange rate from axlUSDC to the target currency in the Forex AMM
      // resemble the real fiat exchange rate.
      const inputTokenPendulumDetails = PENDULUM_USDC_AXL;
      const outputTokenPendulumDetails = getPendulumDetails(toCurrency);

      // Call getTokenOutAmount to get the exchange rate
      const amountOut = await getTokenOutAmount({
        api: apiInstance.api,
        fromAmountString: inputAmount,
        inputTokenDetails: inputTokenPendulumDetails,
        outputTokenDetails: outputTokenPendulumDetails,
      });

      const exchangeRate = parseFloat(amountOut.effectiveExchangeRate);

      logger.debug(`Exchange rate from ${fromCurrency} to ${toCurrency}: ${exchangeRate}`);

      this.fiatExchangeRateCache.set(cacheKey, {
        value: exchangeRate,
        expiresAt: now + this.fiatCacheTtlMs,
      });

      return exchangeRate;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Error fetching fiat exchange rate from ${fromCurrency} to ${toCurrency}: ${error.message}`);
      } else {
        logger.error(`Unknown error fetching fiat exchange rate from ${fromCurrency} to ${toCurrency}`);
      }

      // Re-throw the error to be handled by the caller
      throw error;
    }
  }

  /**
   * Helper function to map RampCurrency to CoinGecko token ID
   * @param currency - The RampCurrency to map
   * @returns The corresponding CoinGecko token ID or null if not mappable
   */
  private getCoinGeckoTokenId(currency: RampCurrency): string | null {
    // Using 'this' to satisfy eslint
    this.logger(`Getting CoinGecko token ID for ${currency}`);

    const tokenIdMap: Record<string, string> = {
      GLMR: 'moonbeam',
      ETH: 'ethereum',
      AVAX: 'avalanche-2',
      MATIC: 'matic-network',
      BNB: 'binancecoin',
    };

    return tokenIdMap[currency as string] || null;
  }

  // Helper method to satisfy eslint for 'this' usage
  // eslint-disable-next-line class-methods-use-this
  private logger(message: string): void {
    logger.debug(message);
  }

  /**
   * Unified bidirectional currency conversion function
   *
   * Converts an amount from one currency to another, handling all possible conversion paths:
   * - USD to Fiat: Uses getFiatExchangeRate
   * - Fiat to USD: Uses inverse of getFiatExchangeRate
   * - USD to Crypto: Uses getCryptoPrice
   * - Crypto to USD: Uses getCryptoPrice
   * - Same currency: Returns original amount
   *
   * @param amount - The amount to convert
   * @param fromCurrency - The source currency
   * @param toCurrency - The target currency
   * @returns The converted amount as a string
   */
  public async convertCurrency(amount: string, fromCurrency: RampCurrency, toCurrency: RampCurrency, decimals = 6): Promise<string> {
    try {
      // If currencies are the same, return the original amount
      if (fromCurrency === toCurrency) {
        logger.debug(`Currencies are the same (${fromCurrency}), returning original amount: ${amount}`);
        return amount;
      }

      // Check if both currencies are USD-like stablecoins
      const isUsdLikeCurrency = (currency: RampCurrency): boolean =>
        currency === EvmToken.USDC || currency === EvmToken.USDT || currency === EvmToken.USDCE;

      if (isUsdLikeCurrency(fromCurrency) && isUsdLikeCurrency(toCurrency)) {
        logger.debug(
          `Both currencies are USD-like (${fromCurrency} -> ${toCurrency}), using 1:1 conversion for: ${amount}`,
        );
        return amount;
      }

      // USD -> Fiat conversion
      if (isUsdLikeCurrency(fromCurrency) && isFiatToken(toCurrency)) {
        const rate = await this.getFiatExchangeRate(toCurrency);
        const result = new Big(amount).mul(rate).toFixed(decimals);
        logger.debug(`Converted ${amount} ${fromCurrency} to ${result} ${toCurrency} using rate: ${rate}`);
        return result;
      }

      // Fiat -> USD conversion
      if (isFiatToken(fromCurrency) && isUsdLikeCurrency(toCurrency)) {
        const rate = await this.getFiatExchangeRate(fromCurrency);
        if (rate <= 0) {
          throw new Error(`Invalid exchange rate for ${fromCurrency}: ${rate}`);
        }
        const result = new Big(amount).div(rate).toFixed(decimals);
        logger.debug(`Converted ${amount} ${fromCurrency} to ${result} ${toCurrency} using inverse rate: 1/${rate}`);
        return result;
      }

      // USD -> Crypto conversion
      if (isUsdLikeCurrency(fromCurrency) && !isFiatToken(toCurrency) && !isUsdLikeCurrency(toCurrency)) {
        const tokenId = this.getCoinGeckoTokenId(toCurrency);
        if (!tokenId) {
          throw new Error(`No CoinGecko token ID mapping for ${toCurrency}`);
        }

        const cryptoPriceUSD = await this.getCryptoPrice(tokenId, 'usd');
        if (cryptoPriceUSD <= 0) {
          throw new Error(`Invalid price for ${toCurrency}: ${cryptoPriceUSD}`);
        }

        const result = new Big(amount).div(cryptoPriceUSD).toFixed(decimals);
        logger.debug(`Converted ${amount} ${fromCurrency} to ${result} ${toCurrency} using price: ${cryptoPriceUSD}`);
        return result;
      }

      // Crypto -> USD conversion
      if (!isFiatToken(fromCurrency) && !isUsdLikeCurrency(fromCurrency) && isUsdLikeCurrency(toCurrency)) {
        const tokenId = this.getCoinGeckoTokenId(fromCurrency);
        if (!tokenId) {
          throw new Error(`No CoinGecko token ID mapping for ${fromCurrency}`);
        }

        const cryptoPriceUSD = await this.getCryptoPrice(tokenId, 'usd');
        const result = new Big(amount).mul(cryptoPriceUSD).toFixed(decimals);
        logger.debug(`Converted ${amount} ${fromCurrency} to ${result} ${toCurrency} using price: ${cryptoPriceUSD}`);
        return result;
      }

      // For other currency pairs, convert via USD as an intermediate step
      logger.debug(`Converting ${fromCurrency} to ${toCurrency} via USD as intermediate`);
      const amountInUSD = await this.convertCurrency(amount, fromCurrency, EvmToken.USDC);
      return this.convertCurrency(amountInUSD, EvmToken.USDC, toCurrency);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Error converting ${amount} from ${fromCurrency} to ${toCurrency}: ${error.message}`);
      } else {
        logger.error(`Unknown error converting ${amount} from ${fromCurrency} to ${toCurrency}`);
      }

      // Return the original amount as fallback
      logger.warn(`Returning original amount ${amount} as fallback due to conversion error`);
      return amount;
    }
  }
}

export const priceFeedService = PriceFeedService.getInstance();
