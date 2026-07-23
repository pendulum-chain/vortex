import { EvmToken, getTokenUsdPrice, isFiatToken, normalizeTokenSymbol, RampCurrency, UsdLikeEvmToken } from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import { fetchWithTimeout } from "../helpers/fetchWithTimeout";

// Cache entry interface
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const FIAT_SANITY_SPREAD_LIMITS: Record<string, number> = {
  ARS: 0.25,
  BRL: 0.02,
  COP: 0.03,
  EUR: 0.02,
  MXN: 0.03
};

// Binance spot symbols quoted against USDT (treated as USD) and priced in fiat.
// Only currencies with a liquid Binance USDT market are listed; any fiat not
// present here skips Binance and falls straight through to fastforex.
const BINANCE_USDT_FIAT_SYMBOLS: Record<string, string> = {
  BRL: "USDTBRL",
  COP: "USDTCOP"
};

/**
 * PriceFeedService
 *
 * A singleton service that centralizes price lookups for crypto (CoinGecko) and fiat (fastforex) currencies.
 * This service is part of the fee-handling refactor to provide consistent price data across the application.
 * Includes in-memory caching with configurable TTLs to reduce API calls and improve performance.
 */
export class PriceFeedService {
  private static instance: PriceFeedService;

  // Configuration properties
  private coingeckoApiKey: string | undefined;

  private coingeckoApiBaseUrl: string;

  private fastforexApiKey: string | undefined;

  private fastforexApiBaseUrl: string;

  private binanceApiBaseUrl: string;

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
    this.coingeckoApiKey = config.priceProviders.coingecko.apiKey;
    this.coingeckoApiBaseUrl = config.priceProviders.coingecko.baseUrl;

    this.fastforexApiKey = config.priceProviders.fastforex.apiKey;
    this.fastforexApiBaseUrl = config.priceProviders.fastforex.baseUrl;

    this.binanceApiBaseUrl = config.priceProviders.binance.baseUrl;

    this.cryptoCacheTtlMs = config.priceProviders.coingecko.cryptoCacheTtlMs;
    this.fiatCacheTtlMs = config.priceProviders.coingecko.fiatCacheTtlMs;

    if (!this.coingeckoApiKey) {
      logger.warn("COINGECKO_API_KEY environment variable is not set. CoinGecko API calls may be rate-limited.");
    }

    if (!this.fastforexApiKey) {
      logger.warn("FASTFOREX_API_KEY environment variable is not set. Fiat rates will fall back to CoinGecko.");
    }

    logger.info(`PriceFeedService initialized with CoinGecko API URL: ${this.coingeckoApiBaseUrl}`);
    logger.info(`PriceFeedService initialized with fastforex API URL: ${this.fastforexApiBaseUrl}`);
    logger.info(`PriceFeedService initialized with Binance API URL: ${this.binanceApiBaseUrl}`);
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
      throw new Error("Token ID and currency are required");
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
      url.searchParams.append("ids", tokenId);
      url.searchParams.append("vs_currencies", vsCurrency);

      // Prepare headers for the request
      const headers: HeadersInit = {
        Accept: "application/json"
      };

      // Add API key if available
      if (this.coingeckoApiKey) {
        headers["x-cg-pro-api-key"] = this.coingeckoApiKey;
      }

      // Make the API request
      const response = await fetchWithTimeout(url.toString(), { headers });

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
        expiresAt: now + this.cryptoCacheTtlMs,
        value: price
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
   * Provider priority: Binance USDT spot (for currencies with a liquid market, e.g. BRL) is
   * tried first, then fastforex, then CoinGecko. The Binance USDT/fiat price reflects the crypto
   * spot rate local users transact at, which can diverge from the official fiat FX mid-market rate.
   *
   * @param toCurrency - The target currency code (e.g., 'BRL', 'ARS')
   * @returns The exchange rate (how much of toCurrency equals 1 unit of fromCurrency)
   */
  public async getUsdToFiatExchangeRate(toCurrency: RampCurrency): Promise<number> {
    const fromCurrency = "USD";
    const targetCurrency = toCurrency.toUpperCase() as RampCurrency;

    if (!isFiatToken(targetCurrency)) {
      throw new Error(`USD-to-fiat exchange rate requires a fiat currency, got ${toCurrency}`);
    }

    if (targetCurrency === "USD") {
      return 1;
    }

    const cacheKey = `fiat:${fromCurrency}:${targetCurrency}`;
    const cachedEntry = this.fiatExchangeRateCache.get(cacheKey);
    const now = Date.now();

    if (cachedEntry && cachedEntry.expiresAt > now) {
      logger.debug(`Cache hit for ${cacheKey}. Using cached exchange rate: ${cachedEntry.value}`);
      return cachedEntry.value;
    }

    if (BINANCE_USDT_FIAT_SYMBOLS[targetCurrency]) {
      logger.debug(`Cache miss for ${cacheKey}. Fetching from Binance spot.`);

      try {
        const rate = await this.getBinanceUsdtToFiatRate(targetCurrency);
        await this.assertRateWithinSanityBand("Binance", targetCurrency, rate);
        this.fiatExchangeRateCache.set(cacheKey, { expiresAt: now + this.fiatCacheTtlMs, value: rate });
        return rate;
      } catch (binanceError) {
        logger.warn(
          `Binance failed for ${fromCurrency}-${targetCurrency}, falling back to fastforex: ${binanceError instanceof Error ? binanceError.message : binanceError}`
        );
      }
    }

    if (this.fastforexApiKey) {
      logger.debug(`Cache miss for ${cacheKey}. Fetching from fastforex.`);

      try {
        const rate = await this.getFastforexRate(fromCurrency, targetCurrency);
        await this.assertRateWithinSanityBand("fastforex", targetCurrency, rate);
        this.fiatExchangeRateCache.set(cacheKey, { expiresAt: now + this.fiatCacheTtlMs, value: rate });
        return rate;
      } catch (ffError) {
        logger.warn(
          `fastforex failed for ${fromCurrency}-${targetCurrency}, falling back to CoinGecko: ${ffError instanceof Error ? ffError.message : ffError}`
        );
      }
    } else {
      logger.debug(`Cache miss for ${cacheKey}. FASTFOREX_API_KEY is not set, fetching from CoinGecko fallback.`);
    }

    logger.debug(`Fetching ${fromCurrency}-${targetCurrency} rate from CoinGecko as fallback.`);
    try {
      const rate = await this.getCryptoPrice("usd-coin", targetCurrency.toLowerCase());
      this.assertValidFiatRate("CoinGecko", fromCurrency, targetCurrency, rate);
      this.fiatExchangeRateCache.set(cacheKey, { expiresAt: now + this.fiatCacheTtlMs, value: rate });
      return rate;
    } catch (cgError) {
      if (cgError instanceof Error) {
        logger.error(`Error fetching fiat exchange rate from ${fromCurrency} to ${targetCurrency}: ${cgError.message}`);
      }
      throw cgError;
    }
  }

  /**
   * Get the fiat-to-USD exchange rate expected by quote discount math.
   * FastForex returns USD-to-fiat, so this is the inverse of that rate.
   */
  public async getFiatToUsdExchangeRate(currency: RampCurrency): Promise<Big> {
    const usdToFiatRate = await this.getUsdToFiatExchangeRate(currency);
    const rate = new Big(usdToFiatRate);

    if (rate.lte(0)) {
      throw new Error(`Invalid USD-to-fiat exchange rate for ${currency}: ${usdToFiatRate}`);
    }

    return new Big(1).div(rate);
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
  public async convertCurrency(
    amount: string,
    fromCurrency: RampCurrency,
    toCurrency: RampCurrency,
    decimals: number | null = null // Allow overriding, but default to null
  ): Promise<string> {
    return this.convertCurrencyStrict(amount, fromCurrency, toCurrency, decimals);
  }

  public async convertCurrencyOrOriginal(
    amount: string,
    fromCurrency: RampCurrency,
    toCurrency: RampCurrency,
    decimals: number | null = null
  ): Promise<string> {
    try {
      return await this.convertCurrencyStrict(amount, fromCurrency, toCurrency, decimals);
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

  public async convertCurrencyOrNull(
    amount: string,
    fromCurrency: RampCurrency,
    toCurrency: RampCurrency,
    decimals: number | null = null
  ): Promise<string | null> {
    try {
      return await this.convertCurrencyStrict(amount, fromCurrency, toCurrency, decimals);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Error converting ${amount} from ${fromCurrency} to ${toCurrency}: ${error.message}`);
      } else {
        logger.error(`Unknown error converting ${amount} from ${fromCurrency} to ${toCurrency}`);
      }

      return null;
    }
  }

  private async convertCurrencyStrict(
    amount: string,
    fromCurrency: RampCurrency,
    toCurrency: RampCurrency,
    decimals: number | null = null
  ): Promise<string> {
    fromCurrency = fromCurrency.toUpperCase() as RampCurrency;
    toCurrency = toCurrency.toUpperCase() as RampCurrency;

    // Determine target decimals based on currency type, unless explicitly overridden
    const targetDecimals = decimals !== null ? decimals : isFiatToken(toCurrency) ? 2 : 8;
    logger.debug(`Target decimals for ${toCurrency} set to ${targetDecimals}`);

    // If currencies are the same, return the original amount
    if (fromCurrency === toCurrency) {
      logger.debug(`Currencies are the same (${fromCurrency}), returning original amount: ${amount}`);
      return new Big(amount).toFixed(targetDecimals);
    }

    // Check if both currencies are USD-like stablecoins
    const isUsdLikeCurrency = (currency: RampCurrency): boolean =>
      currency.toUpperCase() === "USD" ||
      Object.values(UsdLikeEvmToken).includes(normalizeTokenSymbol(currency) as unknown as UsdLikeEvmToken);

    if (isUsdLikeCurrency(fromCurrency) && isUsdLikeCurrency(toCurrency)) {
      return this.convertUsdLikeToUsdLike(amount, fromCurrency, toCurrency);
    }

    if (isUsdLikeCurrency(fromCurrency) && isFiatToken(toCurrency)) {
      return this.convertUsdToFiat(amount, toCurrency, targetDecimals);
    }

    if (isFiatToken(fromCurrency) && isUsdLikeCurrency(toCurrency)) {
      return this.convertFiatToUsd(amount, fromCurrency, targetDecimals);
    }

    if (isUsdLikeCurrency(fromCurrency) && !isFiatToken(toCurrency) && !isUsdLikeCurrency(toCurrency)) {
      return this.convertUsdToCrypto(amount, toCurrency, targetDecimals);
    }

    if (!isFiatToken(fromCurrency) && !isUsdLikeCurrency(fromCurrency) && isUsdLikeCurrency(toCurrency)) {
      return this.convertCryptoToUsd(amount, fromCurrency, targetDecimals);
    }

    // For other currency pairs, convert via USD as an intermediate step
    logger.debug(`Converting ${fromCurrency} to ${toCurrency} via USD as intermediate`);
    // Pass null for decimals to let the recursive call determine the correct precision
    const amountInUSD = await this.convertCurrencyStrict(amount, fromCurrency, EvmToken.USDC, null);

    return this.convertCurrencyStrict(amountInUSD, EvmToken.USDC, toCurrency, null);
  }

  private async getFastforexRate(fromCurrency: string, toCurrency: string): Promise<number> {
    const normalizedBaseUrl = this.fastforexApiBaseUrl.endsWith("/")
      ? this.fastforexApiBaseUrl
      : `${this.fastforexApiBaseUrl}/`;
    const url = new URL("fetch-one", normalizedBaseUrl);
    url.searchParams.append("from", fromCurrency);
    url.searchParams.append("to", toCurrency);

    const headers = new Headers({ Accept: "application/json" });
    if (this.fastforexApiKey) {
      headers.set("X-API-Key", this.fastforexApiKey);
    }

    const response = await fetchWithTimeout(url.toString(), { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`fastforex API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { base: string; result: Record<string, number> };
    const rate = data.result[toCurrency];

    if (rate === undefined || rate <= 0) {
      throw new Error(`fastforex returned invalid rate for ${fromCurrency}-${toCurrency}: ${rate}`);
    }

    logger.debug(`fastforex rate ${fromCurrency}-${toCurrency}: ${rate}`);
    return rate;
  }

  /**
   * Probe every mapped Binance market at startup so an unreachable or geo-blocked
   * endpoint (e.g. HTTP 451) surfaces loudly in the logs instead of silently
   * degrading to the fastforex/CoinGecko fallback. Never throws — this is a
   * diagnostic only, and Binance failures are already handled at request time.
   */
  public async verifyBinanceReachability(): Promise<void> {
    for (const [currency, symbol] of Object.entries(BINANCE_USDT_FIAT_SYMBOLS)) {
      try {
        const rate = await this.getBinanceUsdtToFiatRate(currency as RampCurrency);
        logger.info(`Binance price feed reachable: USD-${currency} spot rate ${rate} (${symbol})`);
      } catch (error) {
        logger.error(
          `Binance price feed UNREACHABLE for USD-${currency} (${symbol}); USD-${currency} rates will silently fall back to fastforex/CoinGecko. If the egress IP is geo-blocked Binance returns HTTP 451. Error: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    }
  }

  private async getBinanceUsdtToFiatRate(targetCurrency: RampCurrency): Promise<number> {
    const symbol = BINANCE_USDT_FIAT_SYMBOLS[targetCurrency];
    if (!symbol) {
      throw new Error(`No Binance USDT symbol mapping for ${targetCurrency}`);
    }

    const normalizedBaseUrl = this.binanceApiBaseUrl.endsWith("/") ? this.binanceApiBaseUrl : `${this.binanceApiBaseUrl}/`;
    const url = new URL("api/v3/ticker/price", normalizedBaseUrl);
    url.searchParams.append("symbol", symbol);

    const response = await fetchWithTimeout(url.toString(), { headers: new Headers({ Accept: "application/json" }) });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Binance API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { symbol: string; price: string };

    if (data.symbol !== symbol) {
      throw new Error(`Binance returned unexpected symbol for ${symbol}: ${data.symbol}`);
    }

    const rate = Number(data.price);

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Binance returned invalid rate for ${symbol}: ${data.price}`);
    }

    logger.debug(`Binance spot rate ${symbol}: ${rate}`);
    return rate;
  }

  private async assertRateWithinSanityBand(provider: string, targetCurrency: RampCurrency, rate: number): Promise<void> {
    this.assertValidFiatRate(provider, "USD", targetCurrency, rate);

    let referenceRate: number;
    try {
      referenceRate = await this.getCryptoPrice("usd-coin", targetCurrency.toLowerCase());
      this.assertValidFiatRate("CoinGecko", "USD", targetCurrency, referenceRate);
    } catch (error) {
      logger.warn(
        `Unable to sanity-check ${provider} USD-${targetCurrency} rate against CoinGecko; accepting ${provider} rate: ${
          error instanceof Error ? error.message : error
        }`
      );
      return;
    }

    const spread = Big(rate).minus(referenceRate).abs().div(referenceRate).toNumber();
    const limit = FIAT_SANITY_SPREAD_LIMITS[targetCurrency] ?? 0.03;

    if (spread > limit) {
      throw new Error(
        `${provider} USD-${targetCurrency} rate ${rate} differs from CoinGecko reference ${referenceRate} by ${(
          spread * 100
        ).toFixed(2)}%, above ${(limit * 100).toFixed(2)}% limit`
      );
    }
  }

  private assertValidFiatRate(provider: string, fromCurrency: string, toCurrency: string, rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`${provider} returned invalid rate for ${fromCurrency}-${toCurrency}: ${rate}`);
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
      AVAX: "avalanche-2",
      BNB: "binancecoin",
      DOT: "polkadot",
      ETH: "ethereum",
      GLMR: "moonbeam",
      HDX: "hydradx",
      MATIC: "polygon-ecosystem-token"
    };

    return tokenIdMap[currency.toUpperCase()] || null;
  }

  // eslint-disable-next-line class-methods-use-this
  private logger(message: string): void {
    logger.debug(message);
  }

  private convertUsdLikeToUsdLike(amount: string, fromCurrency: RampCurrency, toCurrency: RampCurrency): string {
    logger.debug(`Both currencies are USD-like (${fromCurrency} -> ${toCurrency}), using 1:1 conversion for: ${amount}`);
    return amount;
  }

  private async convertUsdToFiat(amount: string, toCurrency: RampCurrency, decimals: number): Promise<string> {
    const rate = await this.getUsdToFiatExchangeRate(toCurrency);
    const result = new Big(amount).mul(new Big(rate)).toFixed(decimals);
    logger.debug(`Converted ${amount} USD to ${result} ${toCurrency} using rate: ${rate}`);
    return result;
  }

  private async convertFiatToUsd(amount: string, fromCurrency: RampCurrency, decimals: number): Promise<string> {
    const rate = await this.getUsdToFiatExchangeRate(fromCurrency);
    const rateBig = new Big(rate);
    if (rateBig.lte(0)) {
      throw new Error(`Invalid exchange rate for ${fromCurrency}: ${rate}`);
    }
    const result = new Big(amount).div(rateBig).toFixed(decimals);
    logger.debug(`Converted ${amount} ${fromCurrency} to ${result} USD using inverse rate: 1/${rate}`);
    return result;
  }

  private async convertUsdToCrypto(amount: string, toCurrency: RampCurrency, decimals: number): Promise<string> {
    // Try dynamic token price first
    const dynamicPrice = getTokenUsdPrice(toCurrency);
    if (dynamicPrice !== undefined && dynamicPrice > 0) {
      const result = new Big(amount).div(dynamicPrice).toFixed(decimals);
      logger.debug(`Converted ${amount} USD to ${result} ${toCurrency} using dynamic price: ${dynamicPrice}`);
      return result;
    }

    // Fall back to CoinGecko
    logger.debug(`No dynamic price for ${toCurrency}, falling back to CoinGecko`);
    const tokenId = this.getCoinGeckoTokenId(toCurrency);
    if (!tokenId) {
      throw new Error(`No CoinGecko token ID mapping for ${toCurrency}`);
    }

    const cryptoPriceUSD = await this.getCryptoPrice(tokenId, "usd");
    if (cryptoPriceUSD <= 0) {
      throw new Error(`Invalid price for ${toCurrency}: ${cryptoPriceUSD}`);
    }

    const result = new Big(amount).div(cryptoPriceUSD).toFixed(decimals);
    logger.debug(`Converted ${amount} USD to ${result} ${toCurrency} using CoinGecko price: ${cryptoPriceUSD}`);
    return result;
  }

  private async convertCryptoToUsd(amount: string, fromCurrency: RampCurrency, decimals: number): Promise<string> {
    // Try dynamic token price first
    const dynamicPrice = getTokenUsdPrice(fromCurrency);
    if (dynamicPrice !== undefined && dynamicPrice > 0) {
      const result = new Big(amount).mul(dynamicPrice).toFixed(decimals);
      logger.debug(`Converted ${amount} ${fromCurrency} to ${result} USD using dynamic price: ${dynamicPrice}`);
      return result;
    }

    // Fall back to CoinGecko
    logger.debug(`No dynamic price for ${fromCurrency}, falling back to CoinGecko`);
    const tokenId = this.getCoinGeckoTokenId(fromCurrency);
    if (!tokenId) {
      throw new Error(`No CoinGecko token ID mapping for ${fromCurrency}`);
    }

    const cryptoPriceUSD = await this.getCryptoPrice(tokenId, "usd");
    const result = new Big(amount).mul(cryptoPriceUSD).toFixed(decimals);
    logger.debug(`Converted ${amount} ${fromCurrency} to ${result} USD using CoinGecko price: ${cryptoPriceUSD}`);
    return result;
  }
}

export const priceFeedService = PriceFeedService.getInstance();
