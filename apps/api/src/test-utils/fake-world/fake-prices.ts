import type { RampCurrency } from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../api/services/priceFeed.service";

/**
 * Deterministic price world. Patches the exported priceFeedService instance
 * (the object every caller imports) rather than the class. Unknown lookups
 * throw so a test never computes fees from an accidental default.
 */
export class FakePrices {
  /** CoinGecko-style token id → USD price. */
  cryptoUsd: Record<string, number> = {
    ethereum: 2500,
    moonbeam: 0.08,
    "polygon-ecosystem-token": 0.5,
    "usd-coin": 1
  };
  /** Fiat/RampCurrency code (lowercased) → units of that currency per 1 USD. */
  perUsd: Record<string, number> = {
    ars: 1000,
    brl: 5,
    // BRLA is the on-chain twin of BRL and shares its peg.
    brla: 5,
    cop: 4000,
    eur: 0.9,
    // Consistent with cryptoUsd["polygon-ecosystem-token"] = 0.5.
    matic: 2,
    mxn: 17,
    usd: 1,
    usdc: 1,
    "usdc.e": 1,
    usdt: 1
  };

  getCryptoUsd(tokenId: string): number {
    const price = this.cryptoUsd[tokenId];
    if (price === undefined) {
      throw new Error(`FakePrices: no USD price for token id '${tokenId}' — set fakePrices.cryptoUsd['${tokenId}'].`);
    }
    return price;
  }

  getPerUsd(currency: string): number {
    const rate = this.perUsd[currency.toLowerCase()];
    if (rate === undefined) {
      throw new Error(`FakePrices: no per-USD rate for '${currency}' — set fakePrices.perUsd['${currency.toLowerCase()}'].`);
    }
    return rate;
  }
}

type PatchedMethods = "getCryptoPrice" | "getUsdToFiatExchangeRate" | "convertCurrency";

export function installFakePrices(): { fakePrices: FakePrices; restore: () => void } {
  const fakePrices = new FakePrices();
  const originals: Partial<Record<PatchedMethods, unknown>> = {
    convertCurrency: priceFeedService.convertCurrency,
    getCryptoPrice: priceFeedService.getCryptoPrice,
    getUsdToFiatExchangeRate: priceFeedService.getUsdToFiatExchangeRate
  };

  priceFeedService.getCryptoPrice = async (tokenId: string) => fakePrices.getCryptoUsd(tokenId);
  priceFeedService.getUsdToFiatExchangeRate = async (toCurrency: RampCurrency) => fakePrices.getPerUsd(toCurrency as string);
  priceFeedService.convertCurrency = async (
    amount: string,
    fromCurrency: RampCurrency,
    toCurrency: RampCurrency,
    decimals?: number | null
  ) => {
    const usd = new Big(amount).div(fakePrices.getPerUsd(fromCurrency as string));
    const converted = usd.times(fakePrices.getPerUsd(toCurrency as string));
    return decimals != null ? converted.toFixed(decimals, 0) : converted.toString();
  };
  return {
    fakePrices,
    restore: () => {
      Object.assign(priceFeedService, originals);
    }
  };
}
