import { v4 as uuidv4 } from 'uuid';
import { BaseRampService } from './base.service';
import QuoteTicket from '../../../models/quoteTicket.model';
import logger from '../../../config/logger';
import { APIError } from '../../errors/api-error';
import httpStatus from 'http-status';
import { DestinationType, Networks, PaymentMethod } from '../../helpers/networks';
import { RampCurrency } from '../../../config/tokens';

export interface QuoteRequest {
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
  inputCurrency: RampCurrency;
  outputAmount: string;
  outputCurrency: RampCurrency;
  fee: string;
  expiresAt: Date;
}

export class QuoteService extends BaseRampService {
  // List of supported chains for each ramp type
  private readonly SUPPORTED_CHAINS: {
    off: { from: DestinationType[]; to: DestinationType[] };
    on: { from: DestinationType[]; to: DestinationType[] };
  } = {
    off: {
      from: ['AssetHub', 'Avalanche', 'Arbitrum', 'BSC', 'Base', 'Ethereum', 'Polygon'],
      to: ['pix', 'sepa'],
    },
    on: {
      from: ['pix'],
      to: ['AssetHub', 'Avalanche', 'Arbitrum', 'BSC', 'Base', 'Ethereum', 'Polygon'],
    },
  };

  /**
   * Create a new quote
   */
  public async createQuote(request: QuoteRequest): Promise<QuoteResponse> {
    // Validate chain support
    this.validateChainSupport(request.rampType, request.from, request.to);

    // Calculate output amount (this would typically involve calling an external service or using a formula)
    const outputAmount = await this.calculateOutputAmount(
      request.inputAmount,
      request.inputCurrency,
      request.outputCurrency,
      request.rampType,
      request.from,
      request.to,
    );

    const fee = '0.01'; // Placeholder fee

    // Create quote in database
    const quoteTicket = await QuoteTicket.create({
      id: uuidv4(),
      rampType: request.rampType,
      from: request.from,
      to: request.to,
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      outputAmount,
      outputCurrency: request.outputCurrency,
      fee,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      status: 'pending',
    });

    const quote = quoteTicket.dataValues;

    return {
      id: quote.id,
      rampType: quote.rampType,
      from: quote.from,
      to: quote.to,
      inputAmount: quote.inputAmount,
      inputCurrency: quote.inputCurrency,
      outputAmount: quote.outputAmount,
      outputCurrency: quote.outputCurrency,
      fee: quote.fee,
      expiresAt: quote.expiresAt,
    };
  }

  /**
   * Get a quote by ID
   */
  public async getQuote(id: string): Promise<QuoteResponse | null> {
    const quoteTicket = await this.getQuoteTicket(id);

    if (!quoteTicket) {
      return null;
    }

    const quote = quoteTicket.dataValues;

    return {
      id: quote.id,
      rampType: quote.rampType,
      from: quote.from,
      to: quote.to,
      inputAmount: quote.inputAmount,
      inputCurrency: quote.inputCurrency,
      outputAmount: quote.outputAmount,
      outputCurrency: quote.outputCurrency,
      fee: quote.fee,
      expiresAt: quote.expiresAt,
    };
  }

  /**
   * Validate that the chain is supported for the given ramp type
   */
  private validateChainSupport(rampType: 'on' | 'off', from: DestinationType, to: DestinationType): void {
    if (!this.SUPPORTED_CHAINS[rampType].from.includes(from) || !this.SUPPORTED_CHAINS[rampType].to.includes(to)) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: `${rampType}ramping from ${from} to ${to} is not supported.`,
      });
    }
  }

  /**
   * Calculate the output amount for a given input
   * This is a placeholder implementation - in a real system, this would call an external service
   * or use a more sophisticated calculation based on market rates, fees, etc.
   */
  private async calculateOutputAmount(
    inputAmount: string,
    inputCurrency: RampCurrency,
    outputCurrency: RampCurrency,
    rampType: 'on' | 'off',
    from: DestinationType,
    to: DestinationType,
  ): Promise<string> {
    try {
      // This is a simplified example - in a real implementation, you would:
      // 1. Call an external price oracle or exchange rate API
      // 2. Apply any fees or slippage
      // 3. Consider the specific chain and currencies involved

      // For this example, we'll use a fixed exchange rate with a fee
      const exchangeRate = 0.96; // Example: 1 inputCurrency = 0.96 outputCurrency
      const fee = 0.01; // 1% fee

      const inputAmountNumber = parseFloat(inputAmount);
      const outputAmountBeforeFee = inputAmountNumber * exchangeRate;
      const outputAmountAfterFee = outputAmountBeforeFee * (1 - fee);

      // Format to 6 decimal places
      return outputAmountAfterFee.toFixed(6);
    } catch (error) {
      logger.error('Error calculating output amount:', error);
      throw new APIError({
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to calculate output amount',
      });
    }
  }
}

export default new QuoteService();
