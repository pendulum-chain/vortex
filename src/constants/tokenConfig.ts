import { AssetIconType } from '../hooks/useGetAssetIcon';
import { Networks } from '../helpers/networks';

export interface BaseInputTokenDetails {
  assetSymbol: string;
  decimals: number;
  pendulumErc20WrapperAddress: string;
  pendulumCurrencyId: { XCM: number };
  pendulumAssetSymbol: string;
  pendulumDecimals: number;
  networkAssetIcon: AssetIconType;
  network: Networks;
}

export enum InputTokenTypes {
  Evm = 'evm',
  Substrate = 'substrate',
}

type EvmInputTokenDetails = BaseInputTokenDetails & {
  erc20AddressSourceChain: `0x${string}`;
  type: InputTokenTypes.Evm;
};

type SubstrateInputTokenDetails = BaseInputTokenDetails & {
  foreignAssetId: number;
  type: InputTokenTypes.Substrate;
};

// Guard function to check if the input token is an EVM token
export function isEvmInputTokenDetails(inputToken: InputTokenDetails): inputToken is EvmInputTokenDetails {
  return inputToken.type === InputTokenTypes.Evm;
}

export type InputTokenDetails = EvmInputTokenDetails | SubstrateInputTokenDetails;

export type InputTokenType = 'usdc' | 'usdce' | 'usdt';

export interface Fiat {
  assetIcon: AssetIconType;
  symbol: string;
}

export interface OutputTokenDetails {
  tomlFileUrl: string;
  decimals: number;
  fiat: Fiat;
  stellarAsset: {
    code: {
      hex: string;
      string: string; // Stellar representation (3 or 4 letter code)
    };
    issuer: {
      hex: string;
      stellarEncoding: string;
    };
  };
  vaultAccountId: string;
  minWithdrawalAmountRaw: string;
  maxWithdrawalAmountRaw: string;
  erc20WrapperAddress: string;
  offrampFeesBasisPoints: number;
  offrampFeesFixedComponent?: number;
  usesMemo: boolean;
  supportsClientDomain: boolean;
}

const PENDULUM_USDC_AXL = {
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

export const INPUT_TOKEN_CONFIG: Record<Networks, Partial<Record<InputTokenType, InputTokenDetails>>> = {
  Polygon: {
    usdc: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
      networkAssetIcon: 'polygonUSDC',
      decimals: 6,
      network: Networks.Polygon,
      type: InputTokenTypes.Evm,
      ...PENDULUM_USDC_AXL,
    },
    usdce: {
      assetSymbol: 'USDC.e',
      erc20AddressSourceChain: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC.e on Polygon
      networkAssetIcon: 'polygonUSDC',
      decimals: 6,
      network: Networks.Polygon,
      type: InputTokenTypes.Evm,
      ...PENDULUM_USDC_AXL,
    },
    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', // USDT on Polygon
      networkAssetIcon: 'polygonUSDT',
      decimals: 6,
      network: Networks.Polygon,
      type: InputTokenTypes.Evm,
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
      type: InputTokenTypes.Evm,
      ...PENDULUM_USDC_AXL,
    },

    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT on Ethereum
      networkAssetIcon: 'ethereumUSDT',
      decimals: 6,
      network: Networks.Ethereum,
      type: InputTokenTypes.Evm,
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
      type: InputTokenTypes.Evm,
      ...PENDULUM_USDC_AXL,
    },

    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0x55d398326f99059fF775485246999027B3197955', // USDT on BSC
      networkAssetIcon: 'bscUSDT',
      decimals: 18,
      network: Networks.BSC,
      type: InputTokenTypes.Evm,
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
      type: InputTokenTypes.Evm,
      ...PENDULUM_USDC_AXL,
    },

    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT on Arbitrum
      networkAssetIcon: 'arbitrumUSDT',
      decimals: 6,
      network: Networks.Arbitrum,
      type: InputTokenTypes.Evm,
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
      type: InputTokenTypes.Evm,
      ...PENDULUM_USDC_AXL,
    },

    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // USDT on Base
      networkAssetIcon: 'baseUSDT',
      decimals: 6,
      network: Networks.Base,
      type: InputTokenTypes.Evm,
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
      type: InputTokenTypes.Evm,
      ...PENDULUM_USDC_AXL,
    },

    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', // USDT on Avalanche
      networkAssetIcon: 'avalancheUSDT',
      decimals: 6,
      network: Networks.Avalanche,
      type: InputTokenTypes.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
  AssetHub: {
    usdc: {
      assetSymbol: 'USDC',
      networkAssetIcon: 'assethubUSDC',
      decimals: 6,
      network: Networks.AssetHub,
      type: InputTokenTypes.Substrate,
      ...PENDULUM_USDC_ASSETHUB,
    },
  },
};

export function getInputTokenDetailsOrDefault(network: Networks, inputTokenType: InputTokenType): InputTokenDetails {
  const maybeInputTokenDetails = getInputTokenDetails(network, inputTokenType);
  if (maybeInputTokenDetails) {
    return maybeInputTokenDetails;
  }

  console.error(`Invalid input token type: ${inputTokenType}`);
  const networkType = (network.charAt(0).toUpperCase() + network.slice(1)) as Networks;
  const firstAvailableToken = Object.values(INPUT_TOKEN_CONFIG[networkType])[0];
  if (!firstAvailableToken) {
    throw new Error(`No tokens configured for network ${networkType}`);
  }
  return firstAvailableToken;
}

export function getInputTokenDetails(network: Networks, inputTokenType: InputTokenType): InputTokenDetails | undefined {
  const networkType = (network.charAt(0).toUpperCase() + network.slice(1)) as Networks;

  try {
    return INPUT_TOKEN_CONFIG[networkType][inputTokenType];
  } catch (error) {
    console.error(`Error getting input token details: ${error}`);
    throw error;
  }
}

export type OutputTokenType = 'eurc' | 'ars';
export const OUTPUT_TOKEN_CONFIG: Record<OutputTokenType, OutputTokenDetails> = {
  eurc: {
    tomlFileUrl: 'https://circle.anchor.mykobo.co/.well-known/stellar.toml',
    decimals: 12,
    fiat: {
      assetIcon: 'eur',
      symbol: 'EUR',
    },
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
    vaultAccountId: '6dgJM1ijyHFEfzUokJ1AHq3z3R3Z8ouc8B5SL9YjMRUaLsjh',
    erc20WrapperAddress: '6eNUvRWCKE3kejoyrJTXiSM7NxtWi37eRXTnKhGKPsJevAj5',
    minWithdrawalAmountRaw: '10000000000000',
    maxWithdrawalAmountRaw: '10000000000000000',
    offrampFeesBasisPoints: 125,
    usesMemo: false,
    supportsClientDomain: true,
  },
  ars: {
    tomlFileUrl: 'https://api.anclap.com/.well-known/stellar.toml',
    decimals: 12,
    fiat: {
      assetIcon: 'ars',
      symbol: 'ARS',
    },
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
    vaultAccountId: '6bE2vjpLRkRNoVDqDtzokxE34QdSJC2fz7c87R9yCVFFDNWs',
    erc20WrapperAddress: '6f7VMG1ERxpZMvFE2CbdWb7phxDgnoXrdornbV3CCd51nFsj',
    minWithdrawalAmountRaw: '11000000000000', // 11 ARS
    maxWithdrawalAmountRaw: '500000000000000000', // 500000 ARS
    offrampFeesBasisPoints: 200, // 2%
    offrampFeesFixedComponent: 10, // 10 ARS
    usesMemo: true,
    supportsClientDomain: true,
  },
};

export function getPendulumCurrencyId(outputTokenType: OutputTokenType) {
  const { stellarAsset } = OUTPUT_TOKEN_CONFIG[outputTokenType];
  return {
    Stellar: {
      AlphaNum4: { code: stellarAsset.code.hex, issuer: stellarAsset.issuer.hex },
    },
  };
}
