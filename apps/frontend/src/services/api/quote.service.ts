import { DestinationType, FiatToken, OnChainToken, QuoteEndpoints } from 'shared';
import { apiRequest } from './api-client';

/**
 * Service for interacting with Quote API endpoints
 */
export class QuoteService {
  private static readonly BASE_PATH = '/quotes';

  /**
   * Create a new quote
   * @param rampType The ramp type (on/off)
   * @param from The source destination type
   * @param to The target destination type
   * @param inputAmount The input amount
   * @param inputCurrency The input currency
   * @param outputCurrency The output currency
   * @param partnerId Optional partner ID for fee markup
   * @returns The created quote
   */
  static async createQuote(
    rampType: 'on' | 'off',
    from: DestinationType,
    to: DestinationType,
    inputAmount: string,
    inputCurrency: OnChainToken | FiatToken,
    outputCurrency: OnChainToken | FiatToken,
    partnerId?: string,
  ): Promise<QuoteEndpoints.QuoteResponse> {
    const request: QuoteEndpoints.CreateQuoteRequest = {
      rampType,
      from,
      to,
      inputAmount,
      inputCurrency,
      outputCurrency,
    };

    // Only add partnerId if it's provided and not empty
    if (partnerId) {
      request.partnerId = partnerId;
    }

    return apiRequest<QuoteEndpoints.QuoteResponse>('post', this.BASE_PATH, request);
  }

  /**
   * Get a quote by ID
   * @param id The quote ID
   * @returns The quote
   */
  static async getQuote(id: string): Promise<QuoteEndpoints.QuoteResponse> {
    return apiRequest<QuoteEndpoints.QuoteResponse>('get', `${this.BASE_PATH}/${id}`);
  }
}
