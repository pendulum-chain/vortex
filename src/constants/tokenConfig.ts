import { AssetIconType } from '../hooks/useGetIcon';

export interface InputTokenDetails {
  assetSymbol: string;
  erc20AddressSourceChain: `0x${string}`;
  axelarEquivalent: {
    pendulumErc20WrapperAddress: string;
    pendulumCurrencyId: { XCM: number };
    pendulumAssetSymbol: string;
  };
  polygonAssetIcon: AssetIconType;
  decimals: number;
}

export type InputTokenType = 'usdc' | 'usdce';

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
      string: string;
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
}
export const INPUT_TOKEN_CONFIG: Record<InputTokenType, InputTokenDetails> = {
  usdc: {
    assetSymbol: 'USDC',
    erc20AddressSourceChain: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
    axelarEquivalent: {
      pendulumErc20WrapperAddress: '6dhRvkn4FheTeSHuNdAA2bxgEWbKRo6vrLaibTENk5e8kBUo',
      pendulumCurrencyId: { XCM: 12 },
      pendulumAssetSymbol: 'USDC.axl',
    },
    polygonAssetIcon: 'polygonUSDC',
    decimals: 6,
  },
  usdce: {
    assetSymbol: 'USDC.e',
    erc20AddressSourceChain: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC.e on Polygon
    axelarEquivalent: {
      pendulumErc20WrapperAddress: '6dhRvkn4FheTeSHuNdAA2bxgEWbKRo6vrLaibTENk5e8kBUo',
      pendulumCurrencyId: { XCM: 12 },
      pendulumAssetSymbol: 'USDC.axl',
    },
    polygonAssetIcon: 'polygonUSDC',
    decimals: 6,
  },
};

export type OutputTokenType = 'eurc';
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
    erc20WrapperAddress: '6eEEZCxJB8YstEEGjkacneHUjd2XzHTht7rwNu6evv4VSC2w',
    minWithdrawalAmountRaw: '10000000000000',
    maxWithdrawalAmountRaw: '10000000000000000',
    offrampFeesBasisPoints: 125,
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
