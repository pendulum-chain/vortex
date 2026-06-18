// TODO we may now de-duplicate this and use token details from token configs.

export interface XCMTokenConfig {
  decimals: number;
  maximumSubsidyAmountRaw: string;
  pendulumCurrencyId: { XCM: number };
}

export type MoonbeamTokenConfig = XCMTokenConfig;

export function isXCMTokenConfig(config: XCMTokenConfig): config is XCMTokenConfig {
  return "decimals" in config && "maximumSubsidyAmountRaw" in config && "pendulumCurrencyId" in config;
}

export type TokenConfig = {
  BRL: MoonbeamTokenConfig;
  USDC: XCMTokenConfig;
  GLMR: XCMTokenConfig;
  "USDC.AXL": XCMTokenConfig;
};

export const TOKEN_CONFIG: TokenConfig = {
  BRL: {
    decimals: 18,
    maximumSubsidyAmountRaw: "86000000000000000000", // 86 units = 15 usd @ Mar/2025
    pendulumCurrencyId: { XCM: 13 }
  },
  GLMR: {
    decimals: 18,
    maximumSubsidyAmountRaw: "0", // This definition is not used to subsidize swaps.
    pendulumCurrencyId: { XCM: 6 }
  },
  USDC: {
    decimals: 6,
    maximumSubsidyAmountRaw: "15000000", // 15 units
    pendulumCurrencyId: { XCM: 2 }
  },
  "USDC.AXL": {
    decimals: 6,
    maximumSubsidyAmountRaw: "15000000", // 15 units
    pendulumCurrencyId: { XCM: 12 }
  }
};

export function getTokenConfigByAssetCode(config: TokenConfig, assetCode: string): XCMTokenConfig | undefined {
  for (const key in config) {
    const token = config[key as keyof TokenConfig];
    if (key === assetCode) {
      return token;
    }
  }
  return;
}

export function getPaddedAssetCode(assetCode: string): string {
  return assetCode.padEnd(4, "\0");
}
