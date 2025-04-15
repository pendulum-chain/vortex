import Big from 'big.js';
import { v4 as uuidv4 } from 'uuid';
import httpStatus from 'http-status';
import {
  DestinationType,
  getNetworkFromDestination,
  getPendulumDetails,
  QuoteEndpoints,
  RampCurrency,
  getOnChainTokenDetails,
  OnChainToken,
  isEvmTokenDetails,
} from 'shared';
import { BaseRampService } from './base.service';
import QuoteTicket, { QuoteTicketMetadata } from '../../../models/quoteTicket.model';
import logger from '../../../config/logger';
import { APIError } from '../../errors/api-error';
import { getTokenOutAmount } from '../nablaReads/outAmount';
import { ApiManager } from '../pendulum/apiManager';
import { calculateTotalReceive, calculateTotalReceiveOnramp } from '../../helpers/quote';
import { createOnrampRouteParams, getRoute } from '../transactions/squidrouter/route';
import { parseContractBalanceResponse, stringifyBigWithSignificantDecimals } from '../../helpers/contracts';

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

    // Validate that the output amount is positive after fees
    if (Big(outputAmount.receiveAmount).lte(0)) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Input amount is too low - fixed fee would exceed the output amount',
      });
    }

    // Create quote in database
    const quote = await QuoteTicket.create({
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
      metadata: {
        onrampOutputAmountMoonbeamRaw: outputAmount.outputAmountMoonbeamRaw,
        onrampInputAmountUnits: outputAmount.inputAmountAfterFees,
      } as QuoteTicketMetadata,
    });

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
    const quote = await this.getQuoteTicket(id);

    if (!quote) {
      return null;
    }

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
  ): Promise<{
    receiveAmount: string;
    fees: string;
    outputAmountBeforeFees: string;
    outputAmountMoonbeamRaw: string;
    inputAmountAfterFees: string;
  }> {
    const apiManager = ApiManager.getInstance();
    const networkName = 'pendulum';
    const apiInstance = await apiManager.getApi(networkName);

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
    const outTokenDetails = toNetwork ? getOnChainTokenDetails(toNetwork, outputCurrency as OnChainToken) : undefined;
    if (rampType === 'on') {
      if (!outTokenDetails || !isEvmTokenDetails(outTokenDetails)) {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: 'Invalid token details for onramp',
        });
      }
    }

    if (Big(inputAmount).lte(0)) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Invalid input amount',
      });
    }

    try {
      const inputTokenPendulumDetails =
        rampType === 'on' ? getPendulumDetails(inputCurrency) : getPendulumDetails(inputCurrency, fromNetwork);
      const outputTokenPendulumDetails =
        rampType === 'on' ? getPendulumDetails(outputCurrency, toNetwork) : getPendulumDetails(outputCurrency);

      const inputAmountAfterFees =
        rampType === 'on' ? calculateTotalReceiveOnramp(new Big(inputAmount), inputCurrency) : inputAmount;

      const amountOut = await getTokenOutAmount({
        api: apiInstance.api,
        fromAmountString: inputAmountAfterFees,
        inputTokenDetails: inputTokenPendulumDetails,
        outputTokenDetails: outputTokenPendulumDetails,
      });

      // if onramp, adjust for axlUSDC price difference.
      const outputAmountMoonbeamRaw: string = amountOut.preciseQuotedAmountOut.rawBalance.toFixed(); // Store the value before the adjustment.
<<<<<<< Updated upstream
      if (rampType === 'on') {
=======
      if (rampType === 'on' && to !== 'assethub') {
        const outTokenDetails = getOnChainTokenDetails(getNetworkFromDestination(to)!, outputCurrency as OnChainToken);
        if (!outTokenDetails || !isEvmTokenDetails(outTokenDetails)) {
          throw new APIError({
            status: httpStatus.BAD_REQUEST,
            message: 'Invalid token details for onramp',
          });
        }

>>>>>>> Stashed changes
        const routeParams = createOnrampRouteParams(
          '0x30a300612ab372cc73e53ffe87fb73d62ed68da3', // It does not matter.
          amountOut.preciseQuotedAmountOut.rawBalance.toFixed(),
          outTokenDetails!,
          getNetworkFromDestination(to)!,
          '0x30a300612ab372cc73e53ffe87fb73d62ed68da3',
        );

        const routeResult = await getRoute(routeParams);
        const { route } = routeResult.data;
        const { toAmountMin } = route.estimate;

        amountOut.preciseQuotedAmountOut = parseContractBalanceResponse(
          outTokenDetails!.pendulumDecimals,
          BigInt(toAmountMin),
        );
        amountOut.roundedDownQuotedAmountOut = amountOut.preciseQuotedAmountOut.preciseBigDecimal.round(2, 0);
        amountOut.effectiveExchangeRate = stringifyBigWithSignificantDecimals(
          amountOut.preciseQuotedAmountOut.preciseBigDecimal.div(new Big(inputAmountAfterFees)),
          4,
        );
      }

      const outputAmountAfterFees =
        rampType === 'off'
          ? calculateTotalReceive(amountOut.preciseQuotedAmountOut.preciseBigDecimal, outputCurrency)
          : amountOut.preciseQuotedAmountOut.preciseBigDecimal.toFixed(6, 0);

      const effectiveFeesOfframp = amountOut.preciseQuotedAmountOut.preciseBigDecimal
        .minus(outputAmountAfterFees)
        .toFixed(2, 0);

      const effectiveFeesOnrampBrl = new Big(inputAmount).minus(inputAmountAfterFees);
      const effectiveFeesOnramp = effectiveFeesOnrampBrl.mul(amountOut.effectiveExchangeRate).toFixed(6, 0);
      const effectiveFees = rampType === 'off' ? effectiveFeesOfframp : effectiveFeesOnramp;

      return {
        receiveAmount: outputAmountAfterFees,
        fees: effectiveFees,
        outputAmountBeforeFees: amountOut.roundedDownQuotedAmountOut.toString(),
        outputAmountMoonbeamRaw,
        inputAmountAfterFees,
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
