import Big from 'big.js';
import { v4 as uuidv4 } from 'uuid';
import httpStatus from 'http-status';
import {DestinationType, getNetworkFromDestination, getPendulumDetails, QuoteEndpoints, RampCurrency} from 'shared';
import { BaseRampService } from './base.service';
import QuoteTicket from '../../../models/quoteTicket.model';
import logger from '../../../config/logger';
import { APIError } from '../../errors/api-error';
import { getTokenOutAmount } from '../nablaReads/outAmount';
import { ApiManager } from '../pendulum/apiManager';
import { calculateTotalReceive } from '../../helpers/quote';

/**
 * Trims trailing zeros from a decimal string, keeping at least two decimal places.
 * @param decimalString - The decimal string to format
 * @returns Formatted string with unnecessary trailing zeros removed but at least two decimal places
 */
function trimTrailingZeros(decimalString: string): string {
  if (!decimalString.includes('.')) {
    return `${decimalString}.00`;
  }

  // Split string at decimal point
  const [integerPart, fractionalPart] = decimalString.split('.');

  // Trim trailing zeros but ensure there are at least 2 decimal places
  let trimmedFraction = fractionalPart.replace(/0+$/g, '');

  // If all were zeros or not enough digits, pad to 2 decimal places
  if (trimmedFraction.length === 0) {
    trimmedFraction = '00';
  } else if (trimmedFraction.length === 1) {
    trimmedFraction += '0';
  }

  return `${integerPart}.${trimmedFraction}`;
}


export class QuoteService extends BaseRampService {
  // List of supported chains for each ramp type
  private readonly SUPPORTED_CHAINS: {
    off: { from: DestinationType[]; to: DestinationType[] };
    on: { from: DestinationType[]; to: DestinationType[] };
  } = {
    off: {
      from: ['assethub', 'avalanche', 'arbitrum', 'bsc', 'base', 'ethereum', 'polygon'],
      to: ['pix', 'sepa', 'cbu'],
    },
    on: {
      from: ['pix'],
      to: ['assethub', 'avalanche', 'arbitrum', 'bsc', 'base', 'ethereum', 'polygon'],
    },
  };

  /**
   * Create a new quote
   */
  public async createQuote(request: QuoteEndpoints.CreateQuoteRequest): Promise<QuoteEndpoints.QuoteResponse> {
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

    // Don't store the quote in the database but only return a preliminary quote
    const quoteTicket = {
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
    };

    const quote = quoteTicket;

    return {
      id: quote.id,
      rampType: quote.rampType,
      from: quote.from,
      to: quote.to,
      inputAmount: trimTrailingZeros(quote.inputAmount),
      inputCurrency: quote.inputCurrency,
      outputAmount: trimTrailingZeros(quote.outputAmount),
      outputCurrency: quote.outputCurrency,
      fee: trimTrailingZeros(quote.fee),
      expiresAt: quote.expiresAt,
    };
  }

  /**
   * Get a quote by ID
   */
  public async getQuote(id: string): Promise<QuoteEndpoints.QuoteResponse | null> {
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
      inputAmount: trimTrailingZeros(quote.inputAmount),
      inputCurrency: quote.inputCurrency,
      outputAmount: trimTrailingZeros(quote.outputAmount),
      outputCurrency: quote.outputCurrency,
      fee: trimTrailingZeros(quote.fee),
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
