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
