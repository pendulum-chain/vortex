/**
 * Free token configuration (not bound to any network)
 */

import { AlfredpayLimitsTable, FiatCurrencyDetails, FiatToken, TokenType } from "../types/base";

/**
 * Hardcoded fallback AlfredPay limits derived from limits.md (May 11 2026 snapshot).
 *
 * Storage convention:
 * - onramp raw values are scaled by the parent fiat's decimals (USD/MXN/COP = 2).
 * - offramp raw values are scaled by stablecoin decimals (USDC/USDT = 6).
 */

const USD_LIMITS: AlfredpayLimitsTable = {
  offramp: {
    USDC: {
      BUSINESS: { maxRaw: "300000000000", minRaw: "1000000" },
      INDIVIDUAL: { maxRaw: "300000000000", minRaw: "1000000" }
    },
    USDT: {
      BUSINESS: { maxRaw: "300000000000", minRaw: "1000000" },
      INDIVIDUAL: { maxRaw: "100000000000", minRaw: "1000000" }
    }
  },
  onramp: {
    USDC: {
      BUSINESS: { maxRaw: "30000000", minRaw: "100" },
      INDIVIDUAL: { maxRaw: "10000000", minRaw: "100" }
    },
    USDT: {
      BUSINESS: { maxRaw: "30000000", minRaw: "100" },
      INDIVIDUAL: { maxRaw: "10000000", minRaw: "100" }
    }
  }
};

const MXN_LIMITS: AlfredpayLimitsTable = {
  offramp: {
    USDC: {
      BUSINESS: { maxRaw: "5000000000000", minRaw: "1000000" },
      INDIVIDUAL: { maxRaw: "5000000000000", minRaw: "1000000" }
    },
    USDT: {
      BUSINESS: { maxRaw: "5000000000000", minRaw: "1000000" },
      INDIVIDUAL: { maxRaw: "5000000000000", minRaw: "1000000" }
    }
  },
  onramp: {
    USDC: {
      BUSINESS: { maxRaw: "8699689121", minRaw: "20000" },
      INDIVIDUAL: { maxRaw: "8699689121", minRaw: "20000" }
    },
    USDT: {
      BUSINESS: { maxRaw: "8695217304", minRaw: "20000" },
      INDIVIDUAL: { maxRaw: "8695217304", minRaw: "20000" }
    }
  }
};

const COP_LIMITS: AlfredpayLimitsTable = {
  offramp: {
    USDC: {
      BUSINESS: { maxRaw: "300000000000", minRaw: "1000000" },
      INDIVIDUAL: { maxRaw: "300000000000", minRaw: "1000000" }
    },
    USDT: {
      BUSINESS: { maxRaw: "300000000000", minRaw: "1000000" },
      INDIVIDUAL: { maxRaw: "100000000000", minRaw: "1000000" }
    }
  },
  onramp: {
    USDC: {
      BUSINESS: { maxRaw: "110596799945", minRaw: "3500000" },
      INDIVIDUAL: { maxRaw: "36865599982", minRaw: "3500000" }
    },
    USDT: {
      BUSINESS: { maxRaw: "110596799945", minRaw: "3500000" },
      INDIVIDUAL: { maxRaw: "36865599982", minRaw: "3500000" }
    }
  }
};

export const freeTokenConfig: Partial<Record<FiatToken, FiatCurrencyDetails>> = {
  [FiatToken.USD]: {
    alfredpayLimits: USD_LIMITS,
    assetSymbol: "USD",
    decimals: 2,
    fiat: {
      assetIcon: "usd",
      name: "US Dollar",
      symbol: "USD"
    },
    // Legacy fields = floor across customer types & stablecoins (Individual caps), used as fallback when
    // the dynamic AlfredPay limit hasn't been resolved yet. Never above the strictest real limit.
    maxBuyAmountRaw: "10000000",
    maxSellAmountRaw: "100000000000",
    minBuyAmountRaw: "100",
    minSellAmountRaw: "1000000",
    type: TokenType.Fiat
  },
  [FiatToken.MXN]: {
    alfredpayLimits: MXN_LIMITS,
    assetSymbol: "MXN",
    decimals: 2,
    fiat: {
      assetIcon: "mxn",
      name: "Mexican Peso",
      symbol: "MXN"
    },
    maxBuyAmountRaw: "8695217304",
    maxSellAmountRaw: "5000000000000",
    minBuyAmountRaw: "20000",
    minSellAmountRaw: "1000000",
    type: TokenType.Fiat
  },
  [FiatToken.COP]: {
    alfredpayLimits: COP_LIMITS,
    assetSymbol: "COP",
    decimals: 2,
    fiat: {
      assetIcon: "cop",
      name: "Colombian Peso",
      symbol: "COP"
    },
    maxBuyAmountRaw: "36865599982",
    maxSellAmountRaw: "100000000000",
    minBuyAmountRaw: "3500000",
    minSellAmountRaw: "1000000",
    type: TokenType.Fiat
  }
};
