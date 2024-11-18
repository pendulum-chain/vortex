import { polygon } from 'wagmi/chains';
import { AssetIconType } from '../hooks/useGetIcon';

type EvmNetworkType = typeof polygon.name;
type SubstrateNetworkType = 'AssetHub';
export type NetworkType = EvmNetworkType | SubstrateNetworkType;

interface EvmInputTokenDetails {
  assetSymbol: string;
  decimals: number;
  erc20AddressSourceChain: `0x${string}`;
  pendulumErc20WrapperAddress: string;
  pendulumCurrencyId: { XCM: number };
  pendulumAssetSymbol: string;
  networkAssetIcon: AssetIconType;
  network: EvmNetworkType;
}

interface SubstrateTokenDetails {
  assetSymbol: string;
  decimals: number;
  pendulumErc20WrapperAddress: string;
  pendulumCurrencyId: { XCM: number };
  pendulumAssetSymbol: string;
  networkAssetIcon: AssetIconType;
  network: SubstrateNetworkType;
}

// Guard function to check if the input token is an EVM token
export function isEvmInputTokenDetails(inputToken: InputTokenDetails): inputToken is EvmInputTokenDetails {
  return (inputToken as EvmInputTokenDetails).erc20AddressSourceChain !== undefined;
}

export type InputTokenDetails = EvmInputTokenDetails | SubstrateTokenDetails;

type EvmInputTokenType = 'usdc' | 'usdce' | 'usdt';
type SubstrateInputTokenType = 'usdc';
export type InputTokenType = EvmInputTokenType | SubstrateInputTokenType;

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
  supportsClientDomain: boolean;
}

const PENDULUM_USDC_AXL = {
  pendulumErc20WrapperAddress: '6eMCHeByJ3m2yPsXFkezBfCQtMs3ymUPqtAyCA41mNWmbNJe',
  pendulumCurrencyId: { XCM: 12 },
  pendulumAssetSymbol: 'USDC.axl',
};

const PENDULUM_USDC_ASSETHUB = {
  pendulumErc20WrapperAddress: '6dAegKXwGWEXkfhNbeqeKothqhe6G81McRxG8zvaDYrpdVHF',
  pendulumCurrencyId: { XCM: 2 },
  pendulumAssetSymbol: 'USDC',
};

export const INPUT_TOKEN_CONFIG: Record<NetworkType, Partial<Record<InputTokenType, InputTokenDetails>>> = {
  Polygon: {
    usdc: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
      networkAssetIcon: 'polygonUSDC',
      decimals: 6,
      network: polygon.name,
      ...PENDULUM_USDC_AXL,
    },
    usdce: {
      assetSymbol: 'USDC.e',
      erc20AddressSourceChain: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC.e on Polygon
      networkAssetIcon: 'polygonUSDC',
      decimals: 6,
      network: polygon.name,
      ...PENDULUM_USDC_AXL,
    },
    usdt: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', // USDT on Polygon
      networkAssetIcon: 'polygonUSDT',
      decimals: 6,
      network: polygon.name,
      ...PENDULUM_USDC_AXL,
    },
  },
  AssetHub: {
    usdc: {
      assetSymbol: 'USDC',
      decimals: 6,
      network: 'AssetHub',
      networkAssetIcon: 'usdc',
      ...PENDULUM_USDC_ASSETHUB,
    },
  },
};

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
    supportsClientDomain: false,
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
