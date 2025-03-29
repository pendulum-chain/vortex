import Big from 'big.js';
import { v4 as uuidv4 } from 'uuid';
import { BaseRampService } from './base.service';
import QuoteTicket from '../../../models/quoteTicket.model';
import logger from '../../../config/logger';
import { APIError } from '../../errors/api-error';
import httpStatus from 'http-status';
import { DestinationType, getNetworkFromDestination, getPendulumDetails, RampCurrency } from 'shared';
import { getTokenOutAmount } from '../nablaReads/outAmount';
import { ApiManager } from '../pendulum/apiManager';
import { calculateTotalReceive } from '../../helpers/quote';

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
      to: ['pix', 'sepa', 'cbu'],
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

    // Create quote in database
    const quoteTicket = await QuoteTicket.create({
      id: uuidv4(),
      rampType: request.rampType,
      from: request.from,
      to: request.to,
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      outputAmount: outputAmount.receiveAmount,
      outputCurrency: request.outputCurrency,
      fee: outputAmount.fees,
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

  private async calculateOutputAmount(
    inputAmount: string,
    inputCurrency: RampCurrency,
    outputCurrency: RampCurrency,
    rampType: 'on' | 'off',
    from: DestinationType,
    to: DestinationType,
  ): Promise<{ receiveAmount: string; fees: string; outputAmountBeforeFees: string }> {
    const apiManager = ApiManager.getInstance();
    const networkName = 'pendulum';
    const apiInstance = await apiManager.getApi(networkName);

    try {
      const fromNetwork = getNetworkFromDestination(from);
      const toNetwork = getNetworkFromDestination(to);
      if (rampType === 'on' && !toNetwork) {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: 'Invalid toNetwork for onramp.',
        });
      }
      if (rampType === 'off' && !fromNetwork) {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: 'Invalid fromNetwork for offramp.',
        });
      }

      const inputTokenPendulumDetails =
        rampType === 'on' ? getPendulumDetails(inputCurrency) : getPendulumDetails(inputCurrency, fromNetwork);
      const outputTokenPendulumDetails =
        rampType === 'on' ? getPendulumDetails(outputCurrency, toNetwork) : getPendulumDetails(outputCurrency);

      if (Big(inputAmount).lte(0)) {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: 'Invalid input amount',
        });
      }

      const amountOut = await getTokenOutAmount({
        api: apiInstance.api,
        fromAmountString: inputAmount,
        inputTokenDetails: inputTokenPendulumDetails,
        outputTokenDetails: outputTokenPendulumDetails,
      });

      const outputAmountAfterFees = calculateTotalReceive(
        amountOut.roundedDownQuotedAmountOut,
        inputCurrency,
        outputCurrency,
      );
      const effectiveFees = amountOut.preciseQuotedAmountOut.preciseBigDecimal
        .minus(outputAmountAfterFees)
        .toFixed(2, 0);

      return {
        receiveAmount: outputAmountAfterFees,
        fees: effectiveFees,
        outputAmountBeforeFees: amountOut.roundedDownQuotedAmountOut.toString(),
      };
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
