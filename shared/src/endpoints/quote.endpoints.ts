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
    fee: string;
    expiresAt: Date;
  }

  // GET /quotes/:id
  export interface GetQuoteRequest {
    id: string;
  }

  // The response is the same as the CreateQuoteResponse
}
