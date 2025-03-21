import { AssetIconType } from '../hooks/useGetAssetIcon';
import { Networks } from '../helpers/networks';

export type PendulumCurrencyId = { Stellar: { AlphaNum4: { code: string; issuer: string } } } | { XCM: number };

export interface BaseTokenDetails {
  type: TokenType;
  decimals: number;
  assetSymbol: string;
}

export interface PendulumDetails {
  pendulumErc20WrapperAddress: string;
  pendulumCurrencyId: PendulumCurrencyId;
  pendulumAssetSymbol: string;
  pendulumDecimals: number;
}

export interface FiatDetails {
  assetIcon: AssetIconType;
  symbol: string;
  name: string;
}

export enum TokenType {
  Evm = 'evm',
  AssetHub = 'assethub',
  Stellar = 'stellar',
  Moonbeam = 'moonbeam',
}

export enum EvmToken {
  USDC = 'usdc',
  USDT = 'usdt',
  USDCE = 'usdce',
}

export enum FiatToken {
  EURC = 'eurc',
  ARS = 'ars',
  BRL = 'brl',
}

export enum AssetHubToken {
  USDC = 'usdc',
}

export type OnChainToken = EvmToken | AssetHubToken;

// Common token representations.

export const PENDULUM_USDC_AXL = {
  pendulumErc20WrapperAddress: '6eMCHeByJ3m2yPsXFkezBfCQtMs3ymUPqtAyCA41mNWmbNJe',
  pendulumCurrencyId: { XCM: 12 },
  pendulumAssetSymbol: 'USDC.axl',
  pendulumDecimals: 6,
};

const PENDULUM_USDC_ASSETHUB = {
  pendulumErc20WrapperAddress: '6dAegKXwGWEXkfhNbeqeKothqhe6G81McRxG8zvaDYrpdVHF',
  pendulumCurrencyId: { XCM: 2 },
  foreignAssetId: 1337, // USDC on AssetHub
  pendulumAssetSymbol: 'USDC',
  pendulumDecimals: 6,
};

const PENDULUM_BRLA_MOONBEAM = {
  pendulumErc20WrapperAddress: '6eRq1yvty6KorGcJ3nKpNYrCBn9FQnzsBhFn4JmAFqWUwpnh',
  pendulumCurrencyId: { XCM: 13 },
  pendulumAssetSymbol: 'BRLA',
  pendulumDecimals: 18,
};

export type EvmTokenDetails = PendulumDetails &
  BaseTokenDetails & {
    type: TokenType.Evm;
    assetSymbol: string;
    networkAssetIcon: AssetIconType;
    network: Networks;
    erc20AddressSourceChain: `0x${string}`;
  };

export type AssetHubTokenDetails = PendulumDetails &
  BaseTokenDetails & {
    type: TokenType.AssetHub;
    assetSymbol: string;
    networkAssetIcon: AssetIconType;
    network: Networks;
    foreignAssetId: number;
  };

export interface BaseFiatTokenDetails {
  fiat: FiatDetails;
  minWithdrawalAmountRaw: string;
  maxWithdrawalAmountRaw: string;
  pendulumErc20WrapperAddress: string;
  offrampFeesBasisPoints: number;
  offrampFeesFixedComponent?: number;
}

export type StellarTokenDetails = PendulumDetails &
  BaseTokenDetails &
  BaseFiatTokenDetails & {
    type: TokenType.Stellar;
    stellarAsset: {
      code: {
        hex: string;
        string: string; // Stellar (3 or 4 letter) representation
      };
      issuer: {
        hex: string;
        stellarEncoding: string;
      };
    };
    vaultAccountId: string;
    supportsClientDomain: boolean;
    anchorHomepageUrl: string;
    tomlFileUrl: string;
    usesMemo: boolean;
  };

export type MoonbeamTokenDetails = PendulumDetails &
  BaseTokenDetails &
  BaseFiatTokenDetails & {
    type: TokenType.Moonbeam;
    polygonErc20Address: string;
    moonbeamErc20Address: string;
    partnerUrl: string;
  };

export type OnChainTokenDetails = EvmTokenDetails | AssetHubTokenDetails;

export const ON_CHAIN_TOKEN_CONFIG: Record<
  Networks,
  Partial<Record<EvmToken, EvmTokenDetails | AssetHubTokenDetails>>
> = {
  Polygon: {
    usdc: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
      networkAssetIcon: 'polygonUSDC',
      decimals: 6,
      network: Networks.Polygon,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    usdce: {
      assetSymbol: 'USDC.e',
      erc20AddressSourceChain: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC.e on Polygon
      networkAssetIcon: 'polygonUSDC',
      decimals: 6,
      network: Networks.Polygon,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', // USDT on Polygon
      networkAssetIcon: 'polygonUSDT',
      decimals: 6,
      network: Networks.Polygon,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
  Ethereum: {
    usdc: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum
      networkAssetIcon: 'ethereumUSDC',
      decimals: 6,
      network: Networks.Ethereum,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },

    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT on Ethereum
      networkAssetIcon: 'ethereumUSDT',
      decimals: 6,
      network: Networks.Ethereum,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
  BSC: {
    usdc: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC on BSC
      networkAssetIcon: 'bscUSDC',
      decimals: 18,
      network: Networks.BSC,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },

    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0x55d398326f99059fF775485246999027B3197955', // USDT on BSC
      networkAssetIcon: 'bscUSDT',
      decimals: 18,
      network: Networks.BSC,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
  Arbitrum: {
    usdc: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
      networkAssetIcon: 'arbitrumUSDC',
      decimals: 6,
      network: Networks.Arbitrum,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },

    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT on Arbitrum
      networkAssetIcon: 'arbitrumUSDT',
      decimals: 6,
      network: Networks.Arbitrum,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
  Base: {
    usdc: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      networkAssetIcon: 'baseUSDC',
      decimals: 6,
      network: Networks.Base,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },

    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // USDT on Base
      networkAssetIcon: 'baseUSDT',
      decimals: 6,
      network: Networks.Base,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
  Avalanche: {
    usdc: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // USDC on Avalanche
      networkAssetIcon: 'avalancheUSDC',
      decimals: 6,
      network: Networks.Avalanche,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },

    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', // USDT on Avalanche
      networkAssetIcon: 'avalancheUSDT',
      decimals: 6,
      network: Networks.Avalanche,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
  AssetHub: {
    usdc: {
      assetSymbol: 'USDC',
      networkAssetIcon: 'assethubUSDC',
      decimals: 6,
      network: Networks.AssetHub,
      type: TokenType.AssetHub,
      ...PENDULUM_USDC_ASSETHUB,
    },
  },
};

export const STELLAR_FIAT_TOKEN_CONFIG: Partial<Record<FiatToken, StellarTokenDetails>> = {
  eurc: {
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
  ars: {
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
};

export const MOONBEAM_FIAT_TOKEN_CONFIG: Partial<Record<FiatToken, MoonbeamTokenDetails>> = {
  brl: {
    type: TokenType.Moonbeam,
    assetSymbol: 'BRL',
    partnerUrl: 'https://brla.digital',
    decimals: 18,
    fiat: {
      assetIcon: 'brl',
      symbol: 'BRL',
      name: 'Brazilian Real',
    },
    polygonErc20Address: '0xe6a537a407488807f0bbeb0038b79004f19dddfb',
    moonbeamErc20Address: '0xfeb25f3fddad13f82c4d6dbc1481516f62236429',
    minWithdrawalAmountRaw: '3000000000000000000', // 3 BRL.
    maxWithdrawalAmountRaw: '10000000000000000000000', // 10,000 BRL. Maximum value for a KYC level 1 user.
    offrampFeesBasisPoints: 0,
    offrampFeesFixedComponent: 0.75, // 0.75 BRL
    ...PENDULUM_BRLA_MOONBEAM,
  },
};

export type TokenDetails = EvmTokenDetails | AssetHubTokenDetails | StellarTokenDetails | MoonbeamTokenDetails;

export function isEvmToken(token: TokenDetails): token is EvmTokenDetails {
  return token.type === TokenType.Evm;
}

export function isAssetHubToken(token: TokenDetails): token is AssetHubTokenDetails {
  return token.type === TokenType.AssetHub;
}

export function isStellarToken(token: TokenDetails): token is StellarTokenDetails {
  return token.type === TokenType.Stellar;
}

export function isMoonbeamToken(token: TokenDetails): token is MoonbeamTokenDetails {
  return token.type === TokenType.Moonbeam;
}

export function isFiatToken(token: OnChainToken | FiatToken): token is FiatToken {
  return token === FiatToken.EURC || token === FiatToken.ARS || token === FiatToken.BRL;
}

export function getStellarTokenDetails(token: TokenDetails): StellarTokenDetails {
  if (isStellarToken(token)) {
    return token;
  }
  throw new Error(`Token is not a Stellar token`);
}

export function getMoonbeamTokenDetails(token: TokenDetails): MoonbeamTokenDetails {
  if (isMoonbeamToken(token)) {
    return token;
  }
  throw new Error(`Token is not a Moonbeam token`);
}

export function getEnumKeyByStringValue<T extends { [key: string]: string }>(
  enumObj: T,
  value: string,
): T[keyof T] | undefined {
  const key = Object.keys(enumObj).find((k) => enumObj[k as keyof T] === value) as keyof T | undefined;
  return key ? enumObj[key] : undefined;
}

export function isStellarOutputTokenDetails(
  tokenDetails: StellarTokenDetails | MoonbeamTokenDetails,
): tokenDetails is StellarTokenDetails {
  return tokenDetails.type === TokenType.Stellar;
}

export function isMoonbeamOutputTokenDetails(
  outputTokenDetails: StellarTokenDetails | MoonbeamTokenDetails,
): outputTokenDetails is MoonbeamTokenDetails {
  return outputTokenDetails.type === TokenType.Moonbeam;
}

export function isStellarOutputToken(outputToken: FiatToken): boolean {
  const maybeOutputTokenDetails = STELLAR_FIAT_TOKEN_CONFIG[outputToken];
  return maybeOutputTokenDetails === undefined;
}

export function getOnChainTokenDetailsOrDefault(network: Networks, OnChainToken: OnChainToken): OnChainTokenDetails {
  const maybeOnChainTokenDetails = getOnChainTokenDetails(network, OnChainToken);
  if (maybeOnChainTokenDetails) {
    return maybeOnChainTokenDetails;
  }

  console.error(`Invalid input token type: ${OnChainToken}`);
  const networkType = (network.charAt(0).toUpperCase() + network.slice(1)) as Networks;
  const firstAvailableToken = Object.values(ON_CHAIN_TOKEN_CONFIG[networkType])[0];
  if (!firstAvailableToken) {
    throw new Error(`No tokens configured for network ${networkType}`);
  }
  return firstAvailableToken;
}

export function getOnChainTokenDetails(network: Networks, OnChainToken: OnChainToken): OnChainTokenDetails | undefined {
  const networkType = (network.charAt(0).toUpperCase() + network.slice(1)) as Networks;

  try {
    return ON_CHAIN_TOKEN_CONFIG[networkType][OnChainToken];
  } catch (error) {
    console.error(`Error getting input token details: ${error}`);
    throw error;
  }
}

export function getTokenDetailsSpacewalk(fiatToken: FiatToken): StellarTokenDetails {
  const maybeOutputTokenDetails = STELLAR_FIAT_TOKEN_CONFIG[fiatToken];

  if (maybeOutputTokenDetails) {
    return maybeOutputTokenDetails;
  }
  throw new Error(`Invalid fiat token type: ${fiatToken}. Token type is not Stellar.`);
}

export function getAnyFiatTokenDetailsMoonbeam(fiatToken: FiatToken): MoonbeamTokenDetails {
  const maybeOutputTokenDetails = MOONBEAM_FIAT_TOKEN_CONFIG[fiatToken];

  if (maybeOutputTokenDetails) {
    return maybeOutputTokenDetails;
  }
  throw new Error(`Invalid output token type: ${FiatToken}. Token type is not Moonbeam.`);
}

export function getBaseFiatTokenDetails(fiatTokenType: FiatToken): BaseFiatTokenDetails {
  const tokenDetails = STELLAR_FIAT_TOKEN_CONFIG[fiatTokenType] || MOONBEAM_FIAT_TOKEN_CONFIG[fiatTokenType];
  if (!tokenDetails) {
    throw new Error(`Fiat token ${fiatTokenType} not found in token config`);
  }

  return tokenDetails;
}

export function getAnyFiatTokenDetails(fiatToken: FiatToken): StellarTokenDetails | MoonbeamTokenDetails {
  return (STELLAR_FIAT_TOKEN_CONFIG[fiatToken] || MOONBEAM_FIAT_TOKEN_CONFIG[fiatToken])!; // I suppose this is safe
}

export function getPendulumCurrencyId(FiatToken: FiatToken): PendulumCurrencyId {
  const tokenDetails = getAnyFiatTokenDetails(FiatToken);
  return tokenDetails.pendulumCurrencyId;
}

export function getPendulumDetails(tokenType: OnChainToken | FiatToken, network: Networks): PendulumDetails {
  const tokenDetails = isFiatToken(tokenType)
    ? getAnyFiatTokenDetails(tokenType)
    : getOnChainTokenDetailsOrDefault(network, tokenType as OnChainToken);

  if (!tokenDetails) {
    throw new Error('Invalid token provided for pendulum details.');
  }

  return {
    pendulumErc20WrapperAddress: tokenDetails.pendulumErc20WrapperAddress,
    pendulumCurrencyId: tokenDetails.pendulumCurrencyId,
    pendulumAssetSymbol: tokenDetails.pendulumAssetSymbol,
    pendulumDecimals: tokenDetails.pendulumDecimals,
  };
}
