import { DestinationType, FiatToken, OnChainToken } from '../index';

export namespace QuoteEndpoints {
  // POST /quotes
  export interface CreateQuoteRequest {
    rampType: 'on' | 'off';
    from: DestinationType;
    to: DestinationType;
    inputAmount: string;
    inputCurrency: OnChainToken | FiatToken;
    outputCurrency: OnChainToken | FiatToken;
  }

  export interface QuoteResponse {
    id: string;
    rampType: 'on' | 'off';
    from: DestinationType;
    to: DestinationType;
    inputAmount: string;
    inputCurrency: OnChainToken | FiatToken;
    outputAmount: string;
    outputCurrency: OnChainToken | FiatToken;
    fee: string;
    expiresAt: Date;
  }

  // GET /quotes/:id
  export interface GetQuoteRequest {
    id: string;
  }

  // The response is the same as the CreateQuoteResponse
}
