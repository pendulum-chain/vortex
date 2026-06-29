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

export interface QuoteResponse {
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

  // Compatibility errors
  AssetHubNotSupportedForAlfredPay = "AssetHub is not supported for this currency. Please select a different network.",

  // Token/calculation errors
  UnableToGetPendulumTokenDetails = "Unable to get Pendulum token details",
  FailedToCalculateQuote = "Failed to calculate the quote. Please try a lower amount.",

  // Fee calculation errors
  FailedToCalculatePreNablaDeductibleFees = "Failed to calculate pre-Nabla deductible fees",
  FailedToCalculateFeeComponents = "Failed to calculate fee components"
}
