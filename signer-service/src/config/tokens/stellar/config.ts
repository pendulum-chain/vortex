/**
 * Stellar token configuration
 */

import { FiatToken, TokenType } from '../types/base';
import { StellarTokenDetails } from '../types/stellar';

export const stellarTokenConfig: Record<FiatToken, StellarTokenDetails> = {
  [FiatToken.EURC]: {
    type: TokenType.Stellar,
    anchorHomepageUrl: 'https://mykobo.co',
    tomlFileUrl: 'https://circle.anchor.mykobo.co/.well-known/stellar.toml',
    decimals: 12,
    pendulumDecimals: 12,
    fiat: {
      assetIcon: 'eur',
      symbol: 'EUR',
      name: 'Euro',
    },
    assetSymbol: 'EURC',
    pendulumAssetSymbol: 'EURC',
    stellarAsset: {
      code: {
        hex: '0x45555243',
        string: 'EURC',
      },
      issuer: {
        hex: '0xcf4f5a26e2090bb3adcf02c7a9d73dbfe6659cc690461475b86437fa49c71136',
        stellarEncoding: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2',
      },
    },
    pendulumCurrencyId: {
      Stellar: {
        AlphaNum4: {
          code: '0x45555243',
          issuer: 'EURC',
        },
      },
    },
    vaultAccountId: '6dgJM1ijyHFEfzUokJ1AHq3z3R3Z8ouc8B5SL9YjMRUaLsjh',
    pendulumErc20WrapperAddress: '6eNUvRWCKE3kejoyrJTXiSM7NxtWi37eRXTnKhGKPsJevAj5',
    minWithdrawalAmountRaw: '10000000000000',
    maxWithdrawalAmountRaw: '10000000000000000',
    offrampFeesBasisPoints: 25,
    usesMemo: false,
    supportsClientDomain: true,
  },
  [FiatToken.ARS]: {
    type: TokenType.Stellar,
    anchorHomepageUrl: 'https://home.anclap.com',
    tomlFileUrl: 'https://api.anclap.com/.well-known/stellar.toml',
    decimals: 12,
    pendulumDecimals: 12,
    fiat: {
      assetIcon: 'ars',
      symbol: 'ARS',
      name: 'Argentine Peso',
    },
    assetSymbol: 'ARS',
    pendulumAssetSymbol: 'ARS',
    stellarAsset: {
      code: {
        hex: '0x41525300',
        string: 'ARS',
      },
      issuer: {
        hex: '0xb04f8bff207a0b001aec7b7659a8d106e54e659cdf9533528f468e079628fba1',
        stellarEncoding: 'GCYE7C77EB5AWAA25R5XMWNI2EDOKTTFTTPZKM2SR5DI4B4WFD52DARS',
      },
    },
    pendulumCurrencyId: {
      Stellar: {
        AlphaNum4: {
          code: '0x41525300',
          issuer: 'ARS',
        },
      },
    },
    vaultAccountId: '6bE2vjpLRkRNoVDqDtzokxE34QdSJC2fz7c87R9yCVFFDNWs',
    pendulumErc20WrapperAddress: '6f7VMG1ERxpZMvFE2CbdWb7phxDgnoXrdornbV3CCd51nFsj',
    minWithdrawalAmountRaw: '11000000000000', // 11 ARS
    maxWithdrawalAmountRaw: '500000000000000000', // 500000 ARS
    offrampFeesBasisPoints: 200, // 2%
    offrampFeesFixedComponent: 10, // 10 ARS
    usesMemo: true,
    supportsClientDomain: true,
  },
  [FiatToken.BRL]: {
    type: TokenType.Stellar,
    anchorHomepageUrl: 'https://placeholder.com', // Placeholder, update with actual URL
    tomlFileUrl: 'https://placeholder.com/.well-known/stellar.toml', // Placeholder, update with actual URL
    decimals: 12,
    pendulumDecimals: 12,
    fiat: {
      assetIcon: 'brl',
      symbol: 'BRL',
      name: 'Brazilian Real',
    },
    assetSymbol: 'BRL',
    pendulumAssetSymbol: 'BRL',
    stellarAsset: {
      code: {
        hex: '0x42524c00',
        string: 'BRL',
      },
      issuer: {
        hex: '0x0000000000000000000000000000000000000000000000000000000000000000', // Placeholder, update with actual value
        stellarEncoding: 'PLACEHOLDER', // Placeholder, update with actual value
      },
    },
    pendulumCurrencyId: {
      Stellar: {
        AlphaNum4: {
          code: '0x42524c00',
          issuer: 'BRL',
        },
      },
    },
    vaultAccountId: '6bE2vjpLRkRNoVDqDtzokxE34QdSJC2fz7c87R9yCVFFDNWs', // Placeholder, update with actual value
    pendulumErc20WrapperAddress: '6f7VMG1ERxpZMvFE2CbdWb7phxDgnoXrdornbV3CCd51nFsj', // Placeholder, update with actual value
    minWithdrawalAmountRaw: '10000000000000', // Placeholder, update with actual value
    maxWithdrawalAmountRaw: '10000000000000000', // Placeholder, update with actual value
    offrampFeesBasisPoints: 25, // Placeholder, update with actual value
    usesMemo: true, // Placeholder, update with actual value
    supportsClientDomain: true, // Placeholder, update with actual value
  },
};
