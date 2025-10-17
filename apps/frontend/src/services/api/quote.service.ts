import {
  CreateQuoteRequest,
  DestinationType,
  FiatToken,
  getNetworkFromDestination,
  OnChainToken,
  PaymentMethod,
  QuoteResponse,
  RampDirection
} from "@packages/shared";
import { apiRequest } from "./api-client";

/**
 * Service for interacting with Quote API endpoints
 */
export class QuoteService {
  private static readonly BASE_PATH = "/quotes";

  /**
   * Create a new quote
   * @param rampType The ramp type (on/off)
   * @param from The source destination type
   * @param to The target destination type
   * @param inputAmount The input amount
   * @param inputCurrency The input currency
   * @param outputCurrency The output currency
   * @param partnerId Optional partner ID for fee markup
   * @param paymentMethod Optional payment method
   * @param countryCode Optional country code
   * @returns The created quote
   */
  static async createQuote(
    rampType: RampDirection,
    from: DestinationType,
    to: DestinationType,
    inputAmount: string,
    inputCurrency: OnChainToken | FiatToken,
    outputCurrency: OnChainToken | FiatToken,
    partnerId?: string,
    paymentMethod?: PaymentMethod,
    countryCode?: string
  ): Promise<QuoteResponse> {
    const network = getNetworkFromDestination(rampType === RampDirection.BUY ? to : from);

    if (!network) {
      throw new Error(`Unable to determine network from ${rampType === RampDirection.BUY ? "to" : "from"} destination`);
    }

    const request: CreateQuoteRequest = {
      countryCode,
      from,
      inputAmount,
      inputCurrency,
      network,
      outputCurrency,
      paymentMethod,
      rampType,
      to
    };

    // Only add partnerId if it's provided and not empty
    if (partnerId) {
      request.partnerId = partnerId;
    }

    return apiRequest<QuoteResponse>("post", this.BASE_PATH, request);
  }

  /**
   * Get a quote by ID
   * @param id The quote ID
   * @returns The quote
   */
  static async getQuote(id: string): Promise<QuoteResponse> {
    return apiRequest<QuoteResponse>("get", `${this.BASE_PATH}/${id}`);
  }
}
