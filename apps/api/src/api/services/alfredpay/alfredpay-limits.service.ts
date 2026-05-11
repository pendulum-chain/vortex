import {
  AlfredpayApiService,
  AlfredpayConfigPair,
  AlfredpayCustomerKey,
  AlfredpayCustomerType,
  AlfredpayLimitsBucket,
  AlfredpayStablecoinKey,
  FiatToken,
  getAnyFiatTokenDetails,
  isAlfredpayToken
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../config/logger";

export type AlfredpayLimitsDirection = "onramp" | "offramp";

/** Refreshed once on startup, then daily. Limits don't change often, so this avoids beating the API. */
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const CUSTOMER_TYPES: AlfredpayCustomerKey[] = ["INDIVIDUAL", "BUSINESS"];

const ALFREDPAY_FIATS: Record<string, FiatToken> = {
  COP: FiatToken.COP,
  MXN: FiatToken.MXN,
  USD: FiatToken.USD
};

function isStablecoinSymbol(symbol: string): symbol is AlfredpayStablecoinKey {
  return symbol === "USDC" || symbol === "USDT";
}

function cacheKey(
  direction: AlfredpayLimitsDirection,
  fiat: FiatToken,
  stablecoin: AlfredpayStablecoinKey,
  customer: AlfredpayCustomerKey
): string {
  return `${direction}:${fiat}:${stablecoin}:${customer}`;
}

function toRaw(quantityDecimal: string, decimals: number): string {
  return new Big(quantityDecimal).mul(new Big(10).pow(decimals)).round(0, Big.roundDown).toFixed(0);
}

export class AlfredpayLimitsService {
  private static instance: AlfredpayLimitsService;

  private cache = new Map<string, AlfredpayLimitsBucket>();
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
  }

  public stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Returns the limits bucket for the given key. Falls back to hardcoded values when the cache is empty
   * (first fetch hasn't succeeded yet) or doesn't contain a matching entry.
   *
   * Onramp raw values are scaled by the fiat's decimals; offramp raw values by the stablecoin's decimals (6).
   */
  public getLimits(
    fiat: FiatToken,
    stablecoin: AlfredpayStablecoinKey,
    customerType: AlfredpayCustomerKey,
    direction: AlfredpayLimitsDirection
  ): AlfredpayLimitsBucket {
    const cached = this.cache.get(cacheKey(direction, fiat, stablecoin, customerType));
    if (cached) return cached;
    return this.fallback(fiat, stablecoin, customerType, direction);
  }

  private fallback(
    fiat: FiatToken,
    stablecoin: AlfredpayStablecoinKey,
    customerType: AlfredpayCustomerKey,
    direction: AlfredpayLimitsDirection
  ): AlfredpayLimitsBucket {
    const hardcoded = getAnyFiatTokenDetails(fiat).alfredpayLimits;
    if (!hardcoded) {
      // Should never happen for AlfredPay tokens. Return permissive sentinel so we don't reject quotes outright.
      return { maxRaw: "0", minRaw: "0" };
    }
    return hardcoded[direction][stablecoin][customerType];
  }

  private async refresh(): Promise<void> {
    try {
      const { supportedPairs } = await AlfredpayApiService.getInstance().getAllConfigs();
      const nextCache = new Map<string, AlfredpayLimitsBucket>();
      for (const pair of supportedPairs) {
        this.indexPair(nextCache, pair);
      }
      this.cache = nextCache;
      logger.info(`[AlfredpayLimits] refreshed: ${supportedPairs.length} pairs, ${nextCache.size} cache entries`);
    } catch (err) {
      logger.warn("[AlfredpayLimits] refresh failed, retaining previous cache (or hardcoded fallback if empty)", err);
    }
  }

  private indexPair(target: Map<string, AlfredpayLimitsBucket>, pair: AlfredpayConfigPair): void {
    const decimals = Number(pair.decimals);
    if (!Number.isFinite(decimals)) return;

    const direction = this.deriveDirection(pair);
    if (!direction) return;

    const { fiat, stablecoin } = direction;
    const bucket: AlfredpayLimitsBucket = {
      maxRaw: toRaw(pair.maxQuantity, decimals),
      minRaw: toRaw(pair.minQuantity, decimals)
    };

    const customers: AlfredpayCustomerKey[] = pair.typeCustomer ? [pair.typeCustomer as AlfredpayCustomerKey] : CUSTOMER_TYPES;
    for (const customer of customers) {
      const key = cacheKey(direction.direction, fiat, stablecoin, customer);
      // The API can return overlapping rows (typeCustomer=null + a specific BUSINESS row). Specific wins by sorting last.
      target.set(key, bucket);
    }
  }

  private deriveDirection(
    pair: AlfredpayConfigPair
  ): { direction: AlfredpayLimitsDirection; fiat: FiatToken; stablecoin: AlfredpayStablecoinKey } | null {
    const fromFiat = ALFREDPAY_FIATS[pair.fromCurrency];
    const toFiat = ALFREDPAY_FIATS[pair.toCurrency];

    if (fromFiat && isStablecoinSymbol(pair.toCurrency)) {
      return { direction: "onramp", fiat: fromFiat, stablecoin: pair.toCurrency };
    }
    if (toFiat && isStablecoinSymbol(pair.fromCurrency)) {
      return { direction: "offramp", fiat: toFiat, stablecoin: pair.fromCurrency };
    }
    return null;
  }

  /**
   * Test helper: pre-seed the cache without going through the API.
   */
  public _setForTesting(entries: Iterable<[string, AlfredpayLimitsBucket]>): void {
    this.cache = new Map(entries);
  }
}

export function resolveAlfredpayLimits(
  fiat: FiatToken,
  stablecoin: AlfredpayStablecoinKey,
  customerType: AlfredpayCustomerKey,
  direction: AlfredpayLimitsDirection
): AlfredpayLimitsBucket {
  if (!isAlfredpayToken(fiat)) {
    throw new Error(`resolveAlfredpayLimits called with non-AlfredPay fiat: ${fiat}`);
  }
  return AlfredpayLimitsService.getInstance().getLimits(fiat, stablecoin, customerType, direction);
}

export function normalizeCustomerType(type: AlfredpayCustomerType | null | undefined): AlfredpayCustomerKey {
  return type === AlfredpayCustomerType.BUSINESS ? "BUSINESS" : "INDIVIDUAL";
}
