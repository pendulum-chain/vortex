import BrlIcon from '../assets/coins/BRL.png';
import UsdcIcon from '../assets/coins/USDC.png';

export interface TokenDetails {
  currencyId: any;
  isOfframp: boolean;
  decimals: number;
  erc20Address?: string;
  assetCode: string;
  assetIssuer?: string;
  canSwapTo: string[];
  // optional depending if the asset is allowd to be offramped
  tomlFileUrl?: string;
  vaultAccountId?: string;
  minWithdrawalAmount?: string;
  assetCodeHex?: string; // Optional property
  icon: string;
  isPolygonChain?: boolean;
  erc20AddressNativeChain?: string;
}

export type TokenType = 'brl' | 'usdc';
export type TokenConfig = Record<TokenType, TokenDetails>;
export enum AssetCodes {
  BRL = 'BRL',
  USDC = 'USDC',
  USDCE = 'USDC.e',
}

// Every asset specified in here must either be offrampable or be swapable to an offrampable asset
export const TOKEN_CONFIG: TokenConfig = {
  brl: {
    tomlFileUrl: 'https://ntokens.com/.well-known/stellar.toml',
    isOfframp: true,
    decimals: 12,
    currencyId: {
      Stellar: {
        AlphaNum4: { code: '0x42524c00', issuer: '0xeaac68d4d0e37b4c24c2536916e830735f032d0d6b2a1c8fca3bc5a25e083e3a' },
      },
    },
    assetCode: AssetCodes.BRL,
    canSwapTo: ['usdc'],
    assetIssuer: 'GDVKY2GU2DRXWTBEYJJWSFXIGBZV6AZNBVVSUHEPZI54LIS6BA7DVVSP',
    vaultAccountId: '6g7fKQQZ9VfbBTQSaKBcATV4psApFra5EDwKLARFZCCVnSWS',
    minWithdrawalAmount: '200000000000000',
    assetCodeHex: '0x42524c00',
    erc20Address: '6dZCR7KVmrcxBoUTcM3vUgpQagQAW2wg2izMrT3N4reftwW5',
    icon: BrlIcon,
  },
  // We treat many of the properties of polygon token as the equivalent axl{X} one on Pendulum.
  // we will receive
  usdc: {
    assetCode: AssetCodes.USDCE,
    erc20AddressNativeChain: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC.e on Polygon
    // erc20AddressNativeChain: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
    // erc20Address is that of axlUSDC on pendulum
    // this is done to provide the user with the expected exchange rate
    erc20Address: '6cXCaQeLQtYhyaQgMGaLcBakgfdgNiSoENW2LA2z8nLBcpSh',
    // Decimals should be consistent in BOTH CHAINS
    decimals: 6,
    // currency id of axlUSDC
    currencyId: { XCM: 12 },
    isOfframp: false,
    // whatever axlUSDC can be offramped to...
    canSwapTo: ['brl'],
    icon: UsdcIcon,
    isPolygonChain: true,
  },
} as const;
