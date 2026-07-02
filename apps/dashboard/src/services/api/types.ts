/**
 * Wire-compatible mirror of the Vortex backend contract (`@vortexfi/shared`).
 *
 * These types are hand-copied (not imported) so the lightweight dashboard app
 * stays decoupled from the shared blockchain graph. Field names, enum values and
 * shapes MATCH the real contract verbatim so swapping the mock services for real
 * HTTP calls (see quote.service.ts / ramp.service.ts) is a one-file change.
 *
 * Sources:
 *   packages/shared/src/endpoints/quote.endpoints.ts
 *   packages/shared/src/endpoints/ramp.endpoints.ts
 *   packages/shared/src/endpoints/webhook.endpoints.ts
 *   packages/shared/src/tokens/types/base.ts
 *   packages/shared/src/helpers/networks.ts
 */

export enum RampDirection {
  BUY = "BUY",
  SELL = "SELL"
}

/** Note: EURC enum key maps to the wire value "EUR". */
export enum FiatToken {
  EURC = "EUR",
  ARS = "ARS",
  BRL = "BRL",
  USD = "USD",
  MXN = "MXN",
  COP = "COP"
}

export enum Networks {
  AssetHub = "assethub",
  Arbitrum = "arbitrum",
  Base = "base",
  Ethereum = "ethereum",
  Polygon = "polygon"
}

export enum EPaymentMethod {
  PIX = "pix",
  SEPA = "sepa",
  CBU = "cbu",
  ACH = "ach",
  WIRE = "wire",
  SPEI = "spei"
}
export type PaymentMethod = EPaymentMethod;

export type RampCurrency = string;
export type DestinationType = Networks | PaymentMethod;

export interface AmountLimits {
  min: string;
  max: string;
}

/** POST /v1/quotes */
export interface CreateQuoteRequest {
  rampType: RampDirection;
  from: DestinationType;
  to: DestinationType;
  inputAmount: string;
  inputCurrency: RampCurrency;
  outputCurrency: RampCurrency;
  partnerId?: string;
  apiKey?: string;
  paymentMethod?: PaymentMethod;
  countryCode?: string;
  network: Networks;
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

  // Flattened fees (fiat)
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

  // Quote-time discount, shown in feeCurrency when present
  discountFiat?: string;
  discountUsd?: string;
  discountCurrency?: RampCurrency;

  paymentMethod: PaymentMethod;
  // Serialized as ISO strings over the wire (typed Date in the real contract).
  expiresAt: string;
  createdAt: string;
  sessionId?: string;
  alfredpayInputLimits?: AmountLimits;
}

/** Coarse status polled alongside currentPhase (webhook.endpoints.ts). */
export enum TransactionStatus {
  PENDING = "PENDING",
  COMPLETE = "COMPLETE",
  FAILED = "FAILED"
}

/** Subset of the real RampPhase union that the mock lifecycle walks through. */
export type RampPhase =
  | "initial"
  | "fundEphemeral"
  | "nablaApprove"
  | "nablaSwap"
  | "alfredpayOfframpTransfer"
  | "complete"
  | "failed"
  | "timedOut";

export enum EphemeralAccountType {
  Substrate = "Substrate",
  EVM = "EVM"
}

export interface AccountMeta {
  address: string;
  type: EphemeralAccountType;
}

/** POST /v1/ramp/register */
export interface RegisterRampRequest {
  quoteId: string;
  signingAccounts: AccountMeta[];
  userId?: string;
  additionalData?: {
    walletAddress?: string;
    destinationAddress?: string;
    pixDestination?: string;
    receiverTaxId?: string;
    taxId?: string;
    email?: string;
    [key: string]: unknown;
  };
}

/** POST /v1/ramp/start */
export interface StartRampRequest {
  rampId: string;
}

export interface RampProcess {
  id: string;
  type: RampDirection;
  currentPhase: RampPhase;
  status?: TransactionStatus;
  from: DestinationType;
  to: DestinationType;
  inputAmount: string;
  inputCurrency: string;
  outputAmount: string;
  outputCurrency: string;
  network?: Networks;
  paymentMethod: PaymentMethod;
  quoteId: string;
  walletAddress?: string;
  transactionHash?: string;
  transactionExplorerLink?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

/** GET /v1/ramp/:id */
export interface GetRampStatusResponse extends RampProcess {
  anchorFeeFiat: string;
  networkFeeFiat: string;
  partnerFeeFiat: string;
  vortexFeeFiat: string;
  totalFeeFiat: string;
  processingFeeFiat: string;
  feeCurrency: string;
  discountFiat?: string;
  discountCurrency?: RampCurrency;
}

/**
 * User-facing quote errors. Limit variants are PREFIXES — the real backend appends
 * the actual value + currency (e.g. "Input amount below minimum BUY limit of 10.00 EUR")
 * and the frontend parses it back out with a regex, so mocks must do the same.
 */
export enum QuoteError {
  MissingRequiredFields = "Missing required fields",
  QuoteNotFound = "Quote not found",
  InputAmountTooLow = "Input amount too low. Please try a larger amount.",
  InputAmountTooLowToCoverFees = "Input amount too low to cover fees",
  LowLiquidity = "This route is temporarily unavailable due to low liquidity. Please try a smaller amount or check back soon.",
  BelowLowerLimitSell = "Output amount below minimum SELL limit of",
  BelowLowerLimitBuy = "Input amount below minimum BUY limit of",
  AboveUpperLimitSell = "Output amount exceeds maximum SELL limit of",
  AboveUpperLimitBuy = "Input amount exceeds maximum BUY limit of",
  UnsupportedCurrency = "Currency not supported",
  FailedToCalculateQuote = "Failed to calculate the quote. Please try a lower amount."
}

/** Mirrors the frontend regex that extracts the suffixed limit value. */
export function extractBackendLimit(message: string): { value: string; currency: string } | undefined {
  const match = message.match(/of\s+(\d+(?:\.\d+)?)\s+([A-Z]{3})/);
  if (!match || match[1] === undefined || match[2] === undefined) {
    return undefined;
  }
  return { currency: match[2], value: match[1] };
}
