import { DestinationType, RampCurrency } from '../index';

export namespace QuoteEndpoints {
  // Fee structure
  export interface FeeStructure {
    network: string;
    anchor: string;
    vortex: string
    partnerMarkup: string;
    total: string;
    currency: string;
  }

  // POST /quotes
  export interface CreateQuoteRequest {
    rampType: 'on' | 'off';
    from: DestinationType;
    to: DestinationType;
    inputAmount: string;
    inputCurrency: RampCurrency;
    outputCurrency: RampCurrency;
    partnerId?: string; // Optional partner ID for fee markup
  }

  export interface QuoteResponse {
    id: string;
    rampType: 'on' | 'off';
    from: DestinationType;
    to: DestinationType;
    inputAmount: string;
    outputAmount: string;
    inputCurrency: RampCurrency;
    outputCurrency: RampCurrency;
    fee: FeeStructure;
    expiresAt: Date;
  }

  // GET /quotes/:id
  export interface GetQuoteRequest {
    id: string;
  }

  // The response is the same as the CreateQuoteResponse
}
