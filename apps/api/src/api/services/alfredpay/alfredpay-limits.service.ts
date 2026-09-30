import {
  AlfredpayApiService,
  AlfredpayConfigPair,
  AlfredpayStablecoinKey,
  DomesticCustomerType,
  FiatToken,
  getAnyFiatTokenDetails,
  RampDirection,
  RawAmountLimits
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../config/logger";

/** Refreshed once on startup, then daily. Limits don't change often, so this avoids beating the API. */
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const CUSTOMER_TYPES: DomesticCustomerType[] = [DomesticCustomerType.INDIVIDUAL, DomesticCustomerType.BUSINESS];

const ALFREDPAY_FIATS: Record<string, FiatToken> = {
  ARS: FiatToken.ARS,
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
  customer: DomesticCustomerType
): string {
  return `${direction}:${fiat}:${stablecoin}:${customer}`;
}

/** A provider bound is only a decimal string; null, absent or "" means Alfred sets no limit on that side. */
function isDecimalQuantity(value: unknown): value is string {
  return typeof value === "string" && /^\d+(\.\d+)?$/.test(value);
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
    customerType: DomesticCustomerType,
    direction: RampDirection
  ): RawAmountLimits {
    const cached = this.cache.get(cacheKey(direction, fiat, stablecoin, customerType));
    if (cached) return cached;
    return this.fallback(fiat, stablecoin, customerType, direction);
  }

  private fallback(
    fiat: FiatToken,
    stablecoin: AlfredpayStablecoinKey,
    customerType: DomesticCustomerType,
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
      // An unparseable 2xx body arrives as an empty listing; it must not wipe the limits we have.
      if (supportedPairs.length === 0) throw new Error("allConfigs returned no pairs");
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
    const axes = this.deriveAxes(pair);
    if (!axes) return;
    const { direction, fiat, stablecoin } = axes;

    // Limits are read back scaled by the fiat's decimals for BUY and the stablecoin's (6) for SELL
    // (resolveAlfredpayQuoteLimits). The listing also carries junk rows (decimals null, "" or huge);
    // a row scaled any other way would mix scales with our configured bound, so it is skipped.
    const decimals = direction === RampDirection.BUY ? getAnyFiatTokenDetails(fiat).decimals : 6;
    if (pair.decimals !== String(decimals)) return;
    if (pair.typeCustomer && !CUSTOMER_TYPES.includes(pair.typeCustomer)) return;

    // A row without any bound says nothing and must not shadow another row for the same pair.
    const minQuantity = isDecimalQuantity(pair.minQuantity) ? pair.minQuantity : null;
    const maxQuantity = isDecimalQuantity(pair.maxQuantity) ? pair.maxQuantity : null;
    if (minQuantity === null && maxQuantity === null) return;

    const customers: DomesticCustomerType[] = pair.typeCustomer ? [pair.typeCustomer] : CUSTOMER_TYPES;
    const isWildcard = !pair.typeCustomer;
    for (const customer of customers) {
      const key = cacheKey(direction, fiat, stablecoin, customer);
      // Specific customer rows take precedence over the wildcard (null) row, regardless of response order.
      if (isWildcard && target.has(key)) continue;
      // Where Alfred sets no limit on a side, keep our configured bound rather than reading it as unlimited.
      const configured = this.fallback(fiat, stablecoin, customer, direction);
      target.set(key, {
        maxRaw: maxQuantity === null ? configured.maxRaw : toRaw(maxQuantity, decimals),
        minRaw: minQuantity === null ? configured.minRaw : toRaw(minQuantity, decimals)
      });
    }
  }

  private deriveAxes(pair: AlfredpayConfigPair): DerivedAxes | null {
    if (!pair.fromCurrency) return null;
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
