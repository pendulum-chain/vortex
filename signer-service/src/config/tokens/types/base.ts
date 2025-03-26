import { EvmToken } from './evm';

import { MoonbeamTokenConfig, StellarTokenConfig } from '../../../constants/tokenConfig';

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

export enum AssetHubToken {
  USDC = 'usdc',
}

export type NablaToken = EvmToken | AssetHubToken | StellarTokenConfig | MoonbeamTokenConfig;

// Combines fiat currencies with tokens in one type
export type RampCurrency = keyof typeof FiatToken | keyof typeof AssetHubToken | keyof typeof EvmToken;

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
