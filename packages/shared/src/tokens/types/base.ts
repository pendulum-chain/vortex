import { EvmToken } from "./evm";

export enum TokenType {
  Evm = "evm",
  AssetHub = "assethub",
  Stellar = "stellar",
  Moonbeam = "moonbeam"
}

export enum FiatToken {
  EURC = "eur",
  ARS = "ars",
  BRL = "brl"
}

export enum AssetHubToken {
  USDC = "usdc"
}

export type OnChainToken = EvmToken | AssetHubToken;
export type NablaToken = OnChainToken;

// Combines fiat currencies with tokens in one type
export type RampCurrency = FiatToken | OnChainToken;

export type PendulumCurrencyId = { Stellar: { AlphaNum4: { code: string; issuer: string } } } | { XCM: number };

export interface BaseTokenDetails {
  type: TokenType;
  decimals: number;
  assetSymbol: string;
}

export interface FiatDetails {
  assetIcon: string;
  symbol: string;
  name: string;
}

export interface BaseFiatTokenDetails {
  fiat: FiatDetails;
  minSellAmountRaw: string;
  maxSellAmountRaw: string;
  minBuyAmountRaw: string;
  maxBuyAmountRaw: string;
  sellFeesBasisPoints: number;
  sellFeesFixedComponent?: number;
  buyFeesBasisPoints?: number;
  buyFeesFixedComponent?: number;
}
