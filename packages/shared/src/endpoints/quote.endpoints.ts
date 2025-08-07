import { DestinationType, RampCurrency, RampDirection } from "../index";

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
  fee: QuoteFeeStructure;
  expiresAt: Date;
}

// GET /quotes/:id
export interface GetQuoteRequest {
  id: string;
}

export enum QuoteError {
  // Validation errors
  MissingRequiredFields = "Missing required fields",
  InvalidRampType = 'Invalid ramp type, must be "on" or "off"',

  // Quote lookup errors
  QuoteNotFound = "Quote not found",

  // Amount validation errors
  InputAmountTooLowToCoverFees = "Input amount too low to cover fees",
  InputAmountForSwapMustBeGreaterThanZero = "Input amount for swap must be greater than 0",
  InputAmountTooLow = "Input amount too low. Please try a larger amount.",
  InputAmountTooLowToCoverCalculatedFees = "Input amount too low to cover calculated fees.",

  // Token/calculation errors
  UnableToGetPendulumTokenDetails = "Unable to get Pendulum token details",
  FailedToCalculateQuote = "Failed to calculate the quote. Please try a lower amount.",

  // Fee calculation errors
  FailedToCalculatePreNablaDeductibleFees = "Failed to calculate pre-Nabla deductible fees",
  FailedToCalculateFeeComponents = "Failed to calculate fee components"
}
