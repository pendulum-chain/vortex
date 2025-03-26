import { EvmToken } from './evm';

export enum TokenType {
  Evm = 'evm',
  AssetHub = 'assethub',
  Stellar = 'stellar',
  Moonbeam = 'moonbeam',
}

export enum FiatToken {
  EURC = 'eurc',
  ARS = 'ars',
  BRL = 'brl',
}

export enum FiatCurreny {
  EUR = 'eur',
  ARS = 'ars',
  BRL = 'brl',
}

export enum AssetHubToken {
  USDC = 'usdc',
}

// Combines fiat currencies with tokens in one type
export type RampCurrency =
  | keyof typeof FiatCurreny
  | keyof typeof FiatToken
  | keyof typeof AssetHubToken
  | keyof typeof EvmToken;

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
  assetIcon: string;
  symbol: string;
  name: string;
}

export interface BaseFiatTokenDetails {
  fiat: FiatDetails;
  minWithdrawalAmountRaw: string;
  maxWithdrawalAmountRaw: string;
  pendulumErc20WrapperAddress: string;
  offrampFeesBasisPoints: number;
  offrampFeesFixedComponent?: number;
}
