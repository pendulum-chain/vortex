import BrlIcon from '../assets/coins/BRL.png';
import UsdcIcon from '../assets/coins/USDC.png';
import EurcIcon from '../assets/coins/EURC.png';

export interface InputTokenDetails {
  assetSymbol: string;
  erc20AddressSourceChain: `0x${string}`;
  axelarEquivalent: {
    pendulumErc20WrapperAddress: string;
    pendulumCurrencyId: any;
    pendulumAssetSymbol: string;
  };
  decimals: number;
  icon: string;
}

export type InputTokenType = 'usdc';

export interface OutputTokenDetails {
  tomlFileUrl: string;
  decimals: number;
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
  icon: string;
}
export const INPUT_TOKEN_CONFIG: Record<InputTokenType, InputTokenDetails> = {
  usdc: {
    assetSymbol: 'USDC.e',
    erc20AddressSourceChain: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC.e on Polygon
    axelarEquivalent: {
      pendulumErc20WrapperAddress: '6cXCaQeLQtYhyaQgMGaLcBakgfdgNiSoENW2LA2z8nLBcpSh',
      pendulumCurrencyId: { XCM: 12 },
      pendulumAssetSymbol: 'USDC.axl',
    },
    decimals: 6,
    icon: UsdcIcon,
  },
};

export type OutputTokenType = 'brl' | 'eurc';
export const OUTPUT_TOKEN_CONFIG: Record<OutputTokenType, OutputTokenDetails> = {
  brl: {
    tomlFileUrl: 'https://ntokens.com/.well-known/stellar.toml',
    decimals: 12,
    stellarAsset: {
      code: {
        hex: '0x42524c00',
        string: 'BRL',
      },
      issuer: {
        hex: '0xeaac68d4d0e37b4c24c2536916e830735f032d0d6b2a1c8fca3bc5a25e083e3a',
        stellarEncoding: 'GDVKY2GU2DRXWTBEYJJWSFXIGBZV6AZNBVVSUHEPZI54LIS6BA7DVVSP',
      },
    },
    vaultAccountId: '6g7fKQQZ9VfbBTQSaKBcATV4psApFra5EDwKLARFZCCVnSWS',
    minWithdrawalAmountRaw: '200000000000000',
    maxWithdrawalAmountRaw: '10000000000000000',
    erc20WrapperAddress: '6dZCR7KVmrcxBoUTcM3vUgpQagQAW2wg2izMrT3N4reftwW5',
    icon: BrlIcon,
  },
  eurc: {
    tomlFileUrl: 'https://mykobo.co/.well-known/stellar.toml',
    decimals: 12,
    stellarAsset: {
      code: {
        hex: '0x45555243',
        string: 'EURC',
      },
      issuer: {
        hex: '0x2112ee863867e4e219fe254c0918b00bc9ea400775bfc3ab4430971ce505877c',
        stellarEncoding: 'GAQRF3UGHBT6JYQZ7YSUYCIYWAF4T2SAA5237Q5LIQYJOHHFAWDXZ7NM',
      },
    },
    vaultAccountId: '6bsD97dS8ZyomMmp1DLCnCtx25oABtf19dypQKdZe6FBQXSm',
    erc20WrapperAddress: '6fA9DRKJ12oTXfSAU7ZZGZ9gEQ92YnyRXeJzW1wXekPzeXZC',
    minWithdrawalAmountRaw: '10000000000000',
    maxWithdrawalAmountRaw: '10000000000000000',
    icon: EurcIcon,
  },
};

export function getPendulumCurrencyId(outputTokenType: OutputTokenType): any {
  const { stellarAsset } = OUTPUT_TOKEN_CONFIG[outputTokenType];
  return {
    Stellar: {
      AlphaNum4: { code: stellarAsset.code.hex, issuer: stellarAsset.issuer.hex },
    },
  };
}
