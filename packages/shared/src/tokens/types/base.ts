import { EvmToken } from "./evm";
import { PendulumTokenDetails } from "./pendulum";

export enum TokenType {
  Evm = "evm",
  AssetHub = "assethub",
  Stellar = "stellar",
  Moonbeam = "moonbeam",
  Fiat = "fiat"
}

export enum FiatToken {
  EURC = "EUR",
  ARS = "ARS",
  BRL = "BRL",
  USD = "USD"
}

export enum AssetHubToken {
  USDC = "USDC",
  USDT = "USDT",
  DOT = "DOT"
}

export type OnChainToken = EvmToken | AssetHubToken;
/** Includes dynamic tokens (e.g. WETH, WBTC) loaded at runtime from SquidRouter */
export type OnChainTokenSymbol = OnChainToken | (string & {});
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
  buyFeesBasisPoints?: number;
  buyFeesFixedComponent?: number;
}

export interface FreeTokenDetails extends BaseTokenDetails, BaseFiatTokenDetails {
  type: TokenType.Fiat;
  pendulumRepresentative: PendulumTokenDetails;
}
