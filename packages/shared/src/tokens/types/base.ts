import { EvmToken } from "./evm";

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
  USD = "USD",
  MXN = "MXN",
  COP = "COP"
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

/** String-literal values match `AlfredpayCustomerType` enum in services/alfredpay/types.ts. */
export type AlfredpayCustomerKey = "INDIVIDUAL" | "BUSINESS";
export type AlfredpayStablecoinKey = "USDC" | "USDT";

export interface AlfredpayLimitsBucket {
  minRaw: string;
  maxRaw: string;
}

/**
 * Multi-axis AlfredPay limits.
 * - `onramp` raw values are scaled by the FIAT decimals of the parent token.
 * - `offramp` raw values are scaled by the STABLECOIN decimals (USDC/USDT = 6).
 */
export interface AlfredpayCurrencyLimits {
  onramp: Record<AlfredpayStablecoinKey, Record<AlfredpayCustomerKey, AlfredpayLimitsBucket>>;
  offramp: Record<AlfredpayStablecoinKey, Record<AlfredpayCustomerKey, AlfredpayLimitsBucket>>;
}

export interface BaseFiatTokenDetails {
  fiat: FiatDetails;
  minSellAmountRaw: string;
  maxSellAmountRaw: string;
  minBuyAmountRaw: string;
  maxBuyAmountRaw: string;
  buyFeesBasisPoints?: number;
  buyFeesFixedComponent?: number;
  /** Multi-axis AlfredPay limits; populated only for AlfredPay-routed fiats (USD/MXN/COP). */
  alfredpayLimits?: AlfredpayCurrencyLimits;
}

export interface FiatCurrencyDetails extends BaseTokenDetails, BaseFiatTokenDetails {
  type: TokenType.Fiat;
}
