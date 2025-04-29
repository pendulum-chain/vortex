import { DestinationType, RampCurrency } from '../index';

export namespace QuoteEndpoints {
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
    fee: string; // Kept for backward compatibility
    networkFee?: string; // New fee breakdown
    processingFee?: string; // New fee breakdown
    partnerMarkupFee?: string; // New fee breakdown
    feeCurrency?: string; // Currency of the fee components
    expiresAt: Date;
  }

  // GET /quotes/:id
  export interface GetQuoteRequest {
    id: string;
  }

  // The response is the same as the CreateQuoteResponse
}
