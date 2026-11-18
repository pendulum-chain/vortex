import { DestinationType, Networks, PaymentMethod, RampCurrency, RampDirection } from "../index";
import { AmountLimits } from "../tokens/types/base";

// Fee structure
export interface QuoteFeeStructure {
  network: string;
  anchor: string;
  vortex: string;
  partnerMarkup: string;
  total: string;
  currency: RampCurrency;
}

// POST /quotes
export interface CreateQuoteRequest {
  rampType: RampDirection;
  from: DestinationType;
  to: DestinationType;
  inputAmount: string;
  inputCurrency: RampCurrency;
  outputCurrency: RampCurrency;
  partnerId?: string; // Optional partner name for fee markup (not UUID)
  apiKey?: string; // Optional public API key (pk_*) for tracking and discounts
  api?: boolean; // Optional flag to indicate API usage
  paymentMethod?: PaymentMethod;
  countryCode?: string;
  network: Networks;
  destinationAddress?: string; // BUY on Robinhood Chain only: address the gas reserve is sized for
}

// POST /quotes/best
export interface CreateBestQuoteRequest {
  rampType: RampDirection;
  from?: DestinationType;
  to?: DestinationType;
  inputAmount: string;
  inputCurrency: RampCurrency;
  outputCurrency: RampCurrency;
  partnerId?: string; // Optional partner name for fee markup (not UUID)
  apiKey?: string; // Optional public API key (pk_*) for tracking and discounts
  api?: boolean; // Optional flag to indicate API usage
  paymentMethod?: PaymentMethod;
  countryCode?: string;
  networks?: Networks[]; // Optional whitelist of networks to evaluate; if omitted, all eligible networks are tried
}

export interface ProviderCost {
  id: "ramp" | "conversion" | "bridge" | "swap" | "vortex" | "network";
  provider: "avenia" | "nabla" | "relay" | "uniswap" | "vortex" | "network";
  amountFiat: string; // BRL, 2 decimals, may be negative for "rate" rows
  includedIn: "fees" | "rate";
}

export interface NablaFeeSubsidyDisplay {
  amountFiat: string;
  amountUsd: string;
  currency: RampCurrency;
  chargedFeeBps: string;
  effectiveFeeBps: string;
}

export interface QuoteResponse {
  nablaFeeSubsidy?: NablaFeeSubsidyDisplay;
  id: string;
  rampType: RampDirection;
  from: DestinationType;
  to: DestinationType;
  inputAmount: string;
  outputAmount: string;
  inputCurrency: RampCurrency;
  outputCurrency: RampCurrency;
  network: Networks;

  // Flattened fees (Fiat)
  networkFeeFiat: string;
  anchorFeeFiat: string;
  vortexFeeFiat: string;
  partnerFeeFiat: string;
  totalFeeFiat: string;
  processingFeeFiat: string; // anchor + vortex
  feeCurrency: RampCurrency;

  // Flattened fees (USD)
  networkFeeUsd: string;
  anchorFeeUsd: string;
  vortexFeeUsd: string;
  partnerFeeUsd: string;
  totalFeeUsd: string;
  processingFeeUsd: string;

  // User benefit from quote-time discount, displayed in feeCurrency when present
  discountFiat?: string;
  discountUsd?: string;
  discountCurrency?: RampCurrency;

  paymentMethod: PaymentMethod;
  expiresAt: Date;
  createdAt: Date;
  sessionId?: string;

  /** Resolved AlfredPay input-side amount limits in human units of `inputCurrency`. Populated for USD/MXN/COP quotes. */
  alfredpayInputLimits?: AmountLimits;

  // Stock corridor only
  routingStrategy?: "direct";
  providerCosts?: ProviderCost[];
  gasless?: boolean;
  gasReserveAmount?: string;
  gasReserveCurrency?: "ETH";
  gasReserveFiat?: string;
  gasReserveUsd?: string;
}

// GET /quotes/:id
export interface GetQuoteRequest {
  id: string;
}

export enum QuoteError {
  // Validation errors
  MissingRequiredFields = "Missing required fields",
  InvalidRampType = 'Invalid ramp type, must be "BUY" or "SELL"',

  MissingToField = "SELL rampType requires 'to' parameter",
  MissingFromField = "BUY rampType requires 'from' parameter",
  InvalidNetworks = "Invalid 'networks' value: must be an array of valid network identifiers",

  // Quote lookup errors
  QuoteNotFound = "Quote not found",

  // Amount validation errors
  InputAmountTooLowToCoverFees = "Input amount too low to cover fees",
  InputAmountForSwapMustBeGreaterThanZero = "Input amount for swap must be greater than 0",
  InputAmountTooLow = "Input amount too low. Please try a larger amount.",
  InputAmountTooLowToCoverCalculatedFees = "Input amount too low to cover calculated fees.",
  LowLiquidity = "This route is temporarily unavailable due to low liquidity. Please try a smaller amount or check back soon.",
  BelowLowerLimitSell = "Output amount below minimum SELL limit of",
  BelowLowerLimitBuy = "Input amount below minimum BUY limit of",
  AboveUpperLimitSell = "Output amount exceeds maximum SELL limit of",
  AboveUpperLimitBuy = "Input amount exceeds maximum BUY limit of",

  // Availability errors
  UnsupportedCurrency = "Currency not supported",
  AnchorTemporarilyUnavailable = "This payment provider is temporarily unavailable. Please try again in a few minutes.",
  NetworkFeesTooHigh = "Destination network fees are temporarily too high. Please try again later.",
  StockTokenNotAvailable = "This token is not available on Robinhood Chain.",
  StockDexSubsidyUnavailable = "The stock DEX fee subsidy exceeds its configured budget. Please try again later.",
  StockUsdcFundingUnavailable = "Base USDC funding is temporarily unavailable. Please try again later.",
  StockTradingPaused = "Trading in this token is paused by the issuer. Please try again later.",
  StockPriceUnavailable = "The market price for this token is temporarily unavailable. Please try again later.",

  // Compatibility errors
  AssetHubNotSupportedForAlfredPay = "AssetHub is not supported for this currency. Please select a different network.",
  EurOnrampNetworkUnsupported = "EUR pay-ins are not available on this network yet. Please select a different network.",

  // Token/calculation errors
  UnableToGetPendulumTokenDetails = "Unable to get Pendulum token details",
  FailedToCalculateQuote = "Failed to calculate the quote. Please try a lower amount.",

  // Fee calculation errors
  FailedToCalculatePreNablaDeductibleFees = "Failed to calculate pre-Nabla deductible fees",
  FailedToCalculateFeeComponents = "Failed to calculate fee components"
}
