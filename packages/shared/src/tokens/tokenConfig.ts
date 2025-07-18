// TODO we may now de-duplicate this and use StellarTokenDetails from token configs.

export interface StellarTokenConfig {
  assetCode: string;
  assetIssuer: string;
  clientDomainEnabled: boolean;
  homeDomain: string;
  maximumSubsidyAmountRaw: string;
  memoEnabled: boolean;
  minWithdrawalAmount: string;
  pendulumCurrencyId: {
    Stellar: {
      AlphaNum4: {
        code: string;
        issuer: string;
      };
    };
  };
  tomlFileUrl: string;
  vaultAccountId: string;
}

export interface XCMTokenConfig {
  decimals: number;
  maximumSubsidyAmountRaw: string;
  pendulumCurrencyId: { XCM: number };
}

export type MoonbeamTokenConfig = XCMTokenConfig;

export function isStellarTokenConfig(config: StellarTokenConfig | XCMTokenConfig): config is StellarTokenConfig {
  return (
    "assetCode" in config &&
    "assetIssuer" in config &&
    "clientDomainEnabled" in config &&
    "homeDomain" in config &&
    "maximumSubsidyAmountRaw" in config &&
    "memoEnabled" in config &&
    "minWithdrawalAmount" in config &&
    "pendulumCurrencyId" in config &&
    "tomlFileUrl" in config &&
    "vaultAccountId" in config
  );
}

export function isXCMTokenConfig(config: StellarTokenConfig | XCMTokenConfig): config is XCMTokenConfig {
  return "decimals" in config && "maximumSubsidyAmountRaw" in config && "pendulumCurrencyId" in config;
}

export type TokenConfig = {
  ars: StellarTokenConfig;
  eurc: StellarTokenConfig;
  brl: MoonbeamTokenConfig;
  usdc: XCMTokenConfig;
  glmr: XCMTokenConfig;
  "usdc.axl": XCMTokenConfig;
};

const eurc: StellarTokenConfig = {
  assetCode: "EURC",
  assetIssuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
  clientDomainEnabled: true,
  homeDomain: "stellar.mykobo.co",
  maximumSubsidyAmountRaw: "15000000000000",
  memoEnabled: false, // 15 units
  minWithdrawalAmount: "10000000000000",
  pendulumCurrencyId: {
    Stellar: {
      AlphaNum4: {
        code: "0x45555243",
        issuer: "0xcf4f5a26e2090bb3adcf02c7a9d73dbfe6659cc690461475b86437fa49c71136"
      }
    }
  },
  tomlFileUrl: "https://stellar.mykobo.co/.well-known/stellar.toml",
  vaultAccountId: "6bsD97dS8ZyomMmp1DLCnCtx25oABtf19dypQKdZe6FBQXSm"
};

const ars: StellarTokenConfig = {
  assetCode: "ARS",
  assetIssuer: "GCYE7C77EB5AWAA25R5XMWNI2EDOKTTFTTPZKM2SR5DI4B4WFD52DARS",
  clientDomainEnabled: true,
  homeDomain: "api.anclap.com",
  maximumSubsidyAmountRaw: "6000000000000000", //  11 ARS. Anchor minimum limit.
  memoEnabled: true, // Defined by us:  6000 unit ~ 6 USD @ Jan/2025
  minWithdrawalAmount: "11000000000000",
  pendulumCurrencyId: {
    Stellar: {
      AlphaNum4: {
        code: "0x41525300",
        issuer: "0xb04f8bff207a0b001aec7b7659a8d106e54e659cdf9533528f468e079628fba1"
      }
    }
  },
  tomlFileUrl: "https://api.anclap.com/.well-known/stellar.toml",
  vaultAccountId: "6bE2vjpLRkRNoVDqDtzokxE34QdSJC2fz7c87R9yCVFFDNWs"
};

export const TOKEN_CONFIG: TokenConfig = {
  ars,
  brl: {
    decimals: 18,
    maximumSubsidyAmountRaw: "86000000000000000000", // 86 units = 15 usd @ Mar/2025
    pendulumCurrencyId: { XCM: 13 }
  },
  eurc,
  glmr: {
    decimals: 18,
    maximumSubsidyAmountRaw: "0", // This definition is not used to subsidize swaps.
    pendulumCurrencyId: { XCM: 6 }
  },
  usdc: {
    decimals: 6,
    maximumSubsidyAmountRaw: "15000000", // 15 units
    pendulumCurrencyId: { XCM: 2 }
  },
  "usdc.axl": {
    decimals: 6,
    maximumSubsidyAmountRaw: "15000000", // 15 units
    pendulumCurrencyId: { XCM: 12 }
  }
};

export function getTokenConfigByAssetCode(
  config: TokenConfig,
  assetCode: string
): StellarTokenConfig | XCMTokenConfig | undefined {
  for (const key in config) {
    const token = config[key as keyof TokenConfig];
    if ("assetCode" in token && token.assetCode === assetCode) {
      return token;
    }
  }
  return;
}

export function getPaddedAssetCode(assetCode: string): string {
  return assetCode.padEnd(4, "\0");
}
