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

export function isStellarTokenConfig(config: StellarTokenConfig | XCMTokenConfig): config is StellarTokenConfig {
  return (
    'assetCode' in config &&
    'assetIssuer' in config &&
    'clientDomainEnabled' in config &&
    'homeDomain' in config &&
    'maximumSubsidyAmountRaw' in config &&
    'memoEnabled' in config &&
    'minWithdrawalAmount' in config &&
    'pendulumCurrencyId' in config &&
    'tomlFileUrl' in config &&
    'vaultAccountId' in config
  );
}

export function isXCMTokenConfig(config: StellarTokenConfig | XCMTokenConfig): config is XCMTokenConfig {
  return 'decimals' in config && 'maximumSubsidyAmountRaw' in config && 'pendulumCurrencyId' in config;
}

export type TokenConfig = {
  ars: StellarTokenConfig;
  eurc: StellarTokenConfig;
  usdc: XCMTokenConfig;
  'usdc.axl': XCMTokenConfig;
};

const eurc: StellarTokenConfig = {
  tomlFileUrl: 'https://circle.anchor.mykobo.co/.well-known/stellar.toml',
  assetCode: 'EURC',
  assetIssuer: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2',
  vaultAccountId: '6bsD97dS8ZyomMmp1DLCnCtx25oABtf19dypQKdZe6FBQXSm',
  minWithdrawalAmount: '10000000000000',
  maximumSubsidyAmountRaw: '1000000000000', // 1 unit
  homeDomain: 'circle.anchor.mykobo.co',
  clientDomainEnabled: true,
  memoEnabled: false,
  pendulumCurrencyId: {
    Stellar: {
      AlphaNum4: {
        code: '0x45555243',
        issuer: '0xcf4f5a26e2090bb3adcf02c7a9d73dbfe6659cc690461475b86437fa49c71136',
      },
    },
  },
};

const ars: StellarTokenConfig = {
  tomlFileUrl: 'https://api.anclap.com/.well-known/stellar.toml',
  assetCode: 'ARS',
  assetIssuer: 'GCYE7C77EB5AWAA25R5XMWNI2EDOKTTFTTPZKM2SR5DI4B4WFD52DARS',
  vaultAccountId: '6bE2vjpLRkRNoVDqDtzokxE34QdSJC2fz7c87R9yCVFFDNWs',
  minWithdrawalAmount: '11000000000000', //  11 ARS. Anchor minimum limit.
  maximumSubsidyAmountRaw: '100000000000000', // Defined by us:  100 unit ~ 0.1 USD @ Oct/2024
  homeDomain: 'api.anclap.com',
  clientDomainEnabled: true,
  memoEnabled: true,
  pendulumCurrencyId: {
    Stellar: {
      AlphaNum4: {
        code: '0x41525300',
        issuer: '0xb04f8bff207a0b001aec7b7659a8d106e54e659cdf9533528f468e079628fba1',
      },
    },
  },
};

export const TOKEN_CONFIG: TokenConfig = {
  ars,
  eurc,
  usdc: {
    pendulumCurrencyId: { XCM: 2 },
    decimals: 6,
    maximumSubsidyAmountRaw: '1000000', // 1 unit
  },
  'usdc.axl': {
    pendulumCurrencyId: { XCM: 12 },
    decimals: 6,
    maximumSubsidyAmountRaw: '1000000', // 1 unit
  },
};

export function getTokenConfigByAssetCode(
  config: TokenConfig,
  assetCode: string,
): StellarTokenConfig | XCMTokenConfig | undefined {
  for (const key in config) {
    const token = config[key as keyof TokenConfig];
    if ('assetCode' in token && token.assetCode === assetCode) {
      return token;
    }
  }
  return;
}

export function getPaddedAssetCode(assetCode: string): string {
  return assetCode.padEnd(4, '\0');
}
