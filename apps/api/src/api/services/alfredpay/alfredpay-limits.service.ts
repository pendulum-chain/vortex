import {
  AlfredpayApiService,
  AlfredpayConfigPair,
  AlfredpayCustomerType,
  AlfredpayStablecoinKey,
  FiatToken,
  getAnyFiatTokenDetails,
  RampDirection,
  RawAmountLimits
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../config/logger";

/** Refreshed once on startup, then daily. Limits don't change often, so this avoids beating the API. */
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const CUSTOMER_TYPES: AlfredpayCustomerType[] = [AlfredpayCustomerType.INDIVIDUAL, AlfredpayCustomerType.BUSINESS];

const ALFREDPAY_FIATS: Record<string, FiatToken> = {
  COP: FiatToken.COP,
  MXN: FiatToken.MXN,
  USD: FiatToken.USD
};

function isStablecoinSymbol(symbol: string): symbol is AlfredpayStablecoinKey {
  return symbol === "USDC" || symbol === "USDT";
}

function cacheKey(
  direction: RampDirection,
  fiat: FiatToken,
  stablecoin: AlfredpayStablecoinKey,
  customer: AlfredpayCustomerType
): string {
  return `${direction}:${fiat}:${stablecoin}:${customer}`;
}

function toRaw(quantityDecimal: string, decimals: number): string {
  return new Big(quantityDecimal).mul(new Big(10).pow(decimals)).round(0, Big.roundDown).toFixed(0);
}

interface DerivedAxes {
  direction: RampDirection;
  fiat: FiatToken;
  stablecoin: AlfredpayStablecoinKey;
}

export class AlfredpayLimitsService {
  private static instance: AlfredpayLimitsService;

  private cache = new Map<string, RawAmountLimits>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  public static getInstance(): AlfredpayLimitsService {
    if (!AlfredpayLimitsService.instance) {
      AlfredpayLimitsService.instance = new AlfredpayLimitsService();
    }
    return AlfredpayLimitsService.instance;
  }

  public start(): void {
    if (this.intervalHandle) return;
    void this.refresh();
    this.intervalHandle = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
    this.intervalHandle.unref();
  }

  public stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Returns raw limits for the given key. Falls back to hardcoded values when the cache is empty
   * (first fetch hasn't succeeded yet) or doesn't contain a matching entry.
   *
   * Onramp raw values are scaled by the fiat's decimals; offramp raw values by the stablecoin's decimals (6).
   */
  public getLimits(
    fiat: FiatToken,
    stablecoin: AlfredpayStablecoinKey,
    customerType: AlfredpayCustomerType,
    direction: RampDirection
  ): RawAmountLimits {
    const cached = this.cache.get(cacheKey(direction, fiat, stablecoin, customerType));
    if (cached) return cached;
    return this.fallback(fiat, stablecoin, customerType, direction);
  }

  private fallback(
    fiat: FiatToken,
    stablecoin: AlfredpayStablecoinKey,
    customerType: AlfredpayCustomerType,
    direction: RampDirection
  ): RawAmountLimits {
    const hardcoded = getAnyFiatTokenDetails(fiat).alfredpayLimits;
    if (!hardcoded) {
      throw new Error(`AlfredPay limits missing for ${fiat} — token config is out of sync`);
    }
    const table = direction === RampDirection.BUY ? hardcoded.onramp : hardcoded.offramp;
    return table[stablecoin][customerType];
  }

  private async refresh(): Promise<void> {
    try {
      const { supportedPairs } = await AlfredpayApiService.getInstance().getAllConfigs();
      const nextCache = new Map<string, RawAmountLimits>();
      for (const pair of supportedPairs) {
        this.indexPair(nextCache, pair);
      }
      this.cache = nextCache;
      logger.info(`[AlfredpayLimits] refreshed: ${supportedPairs.length} pairs, ${nextCache.size} cache entries`);
    } catch (err) {
      logger.warn("[AlfredpayLimits] refresh failed, retaining previous cache (or hardcoded fallback if empty)", err);
    }
  }

  private indexPair(target: Map<string, RawAmountLimits>, pair: AlfredpayConfigPair): void {
    const decimals = Number(pair.decimals);
    if (!Number.isFinite(decimals)) return;

    const axes = this.deriveAxes(pair);
    if (!axes) return;

    const { direction, fiat, stablecoin } = axes;
    const limits: RawAmountLimits = {
      maxRaw: toRaw(pair.maxQuantity, decimals),
      minRaw: toRaw(pair.minQuantity, decimals)
    };

    const customers: AlfredpayCustomerType[] = pair.typeCustomer ? [pair.typeCustomer] : CUSTOMER_TYPES;
    const isWildcard = !pair.typeCustomer;
    for (const customer of customers) {
      const key = cacheKey(direction, fiat, stablecoin, customer);
      // Specific customer rows take precedence over the wildcard (null) row, regardless of response order.
      if (!isWildcard || !target.has(key)) {
        target.set(key, limits);
      }
    }
  }

  private deriveAxes(pair: AlfredpayConfigPair): DerivedAxes | null {
    const fromFiat = ALFREDPAY_FIATS[pair.fromCurrency];
    const toFiat = ALFREDPAY_FIATS[pair.toCurrency];

    if (fromFiat && isStablecoinSymbol(pair.toCurrency)) {
      return { direction: RampDirection.BUY, fiat: fromFiat, stablecoin: pair.toCurrency };
    }
    if (toFiat && isStablecoinSymbol(pair.fromCurrency)) {
      return { direction: RampDirection.SELL, fiat: toFiat, stablecoin: pair.fromCurrency };
    }
    return null;
  }
}
