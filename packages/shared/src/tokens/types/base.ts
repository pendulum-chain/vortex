import { EvmToken } from "./evm";

export enum TokenType {
  Evm = "evm",
  AssetHub = "assethub",
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

export type PendulumCurrencyId = { XCM: number };

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

export enum AlfredpayCustomerType {
  INDIVIDUAL = "INDIVIDUAL",
  BUSINESS = "BUSINESS"
}

export type AlfredpayStablecoinKey = "USDC" | "USDT";

/** Min/max pair in human decimal units. */
export interface AmountLimits {
  min: string;
  max: string;
}

/** Min/max pair in raw integer-string units (storage form). */
export interface RawAmountLimits {
  minRaw: string;
  maxRaw: string;
}

/**
 * Multi-axis AlfredPay limits.
 * - `onramp` raw values are scaled by the FIAT decimals of the parent token.
 * - `offramp` raw values are scaled by the STABLECOIN decimals (USDC/USDT = 6).
 */
export interface AlfredpayLimitsTable {
  onramp: Record<AlfredpayStablecoinKey, Record<AlfredpayCustomerType, RawAmountLimits>>;
  offramp: Record<AlfredpayStablecoinKey, Record<AlfredpayCustomerType, RawAmountLimits>>;
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
  alfredpayLimits?: AlfredpayLimitsTable;
}

export interface FiatCurrencyDetails extends BaseTokenDetails, BaseFiatTokenDetails {
  type: TokenType.Fiat;
}
