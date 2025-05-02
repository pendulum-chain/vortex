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
  Networks,
} from 'shared';
import { BaseRampService } from './base.service';
import QuoteTicket, { QuoteTicketFeeStructureDb, QuoteTicketMetadata } from '../../../models/quoteTicket.model';
import Partner from '../../../models/partner.model';
import FeeConfiguration from '../../../models/feeConfiguration.model';
import logger from '../../../config/logger';
import { APIError } from '../../errors/api-error';
import { getTokenOutAmount } from '../nablaReads/outAmount';
import { ApiManager } from '../pendulum/apiManager';
import { createOnrampRouteParams, getRoute } from '../transactions/squidrouter/route';
import { parseContractBalanceResponse, stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import {
  MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS,
  MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS_ETHEREUM,
} from '../../../constants/constants';
import { multiplyByPowerOfTen } from '../pendulum/helpers';

// TODO: Implement proper fee conversion logic using price feeds
function convertFeeToOutputCurrency(feeUSD: string, outputCurrency: RampCurrency, exchangeRateInfo?: string): string {
  logger.warn(`TODO: Implement fee conversion from USD to ${outputCurrency}. Using placeholder logic.`);
  
  // In a real implementation, we would use exchangeRateInfo for conversion
  if (exchangeRateInfo) {
    logger.debug(`Future implementation will use exchange rate: ${exchangeRateInfo}`);
  }
  
  // Placeholder: If output is USD-like, return feeUSD. Otherwise, return feeUSD (needs real conversion).
  const usdLikeCurrencies = ['USD', 'USDC', 'axlUSDC'];
  if (usdLikeCurrencies.includes(outputCurrency as string)) {
     return feeUSD;
  }
  // Returning USD value as placeholder - THIS WILL BE INCORRECT FOR CRYPTO OUTPUTS
  return feeUSD;
}

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

    // Validate and get partner if provided
    let partner = null;
    if (request.partnerId) {
      partner = await Partner.findOne({
        where: {
          id: request.partnerId,
          isActive: true,
        },
      });
      // If partnerId was provided but not found or not active, we'll proceed without a partner
    }

    // Calculate gross output amount and network fee
    const {
      grossOutputAmount,
      networkFeeUSD,
      outputAmountMoonbeamRaw,
      inputAmountUsedForSwap,
      effectiveExchangeRate
    } = await this.calculateGrossOutputAndNetworkFee(
      request.inputAmount,
      request.inputCurrency,
      request.outputCurrency,
      request.rampType,
      request.from,
      request.to,
    );

    // Calculate core fee components using the database-driven logic
    const {
      vortexFee,
      anchorFee,
      partnerMarkupFee,
      feeCurrency
    } = await this.calculateFeeComponents(
      request.inputAmount,
      request.rampType,
      request.from,
      request.to,
      partner,
    );

    // Calculate total fee in USD
    const totalFeeUSD = new Big(networkFeeUSD)
      .plus(vortexFee)
      .plus(anchorFee)
      .plus(partnerMarkupFee)
      .toString();

    // Convert total fee to output currency
    const totalFeeInOutputCurrency = convertFeeToOutputCurrency(
      totalFeeUSD,
      request.outputCurrency,
      effectiveExchangeRate // Pass exchange rate info if available
    );

    // Calculate final output amount by subtracting the converted total fee from gross output
    const finalOutputAmount = new Big(grossOutputAmount).minus(totalFeeInOutputCurrency);
    if (finalOutputAmount.lte(0)) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Input amount too low to cover calculated fees',
      });
    }
    const finalOutputAmountStr = finalOutputAmount.toFixed(6, 0);

    // Store the complete detailed fee structure
    const feeToStore: QuoteEndpoints.FeeStructure = {
      network: networkFeeUSD,
      vortex: vortexFee,
      anchor: anchorFee,
      partnerMarkup: partnerMarkupFee,
      total: totalFeeUSD,
      currency: feeCurrency, // Should be 'USD'
    };

    // Create quote in database with the detailed fee structure
    const quote = await QuoteTicket.create({
      id: uuidv4(),
      rampType: request.rampType,
      from: request.from,
      to: request.to,
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      outputAmount: finalOutputAmountStr, // Use the final output amount after fee deduction
      outputCurrency: request.outputCurrency,
      fee: feeToStore, // Store the detailed fee structure
      partnerId: partner?.id || null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      status: 'pending',
      metadata: {
        onrampOutputAmountMoonbeamRaw: outputAmountMoonbeamRaw,
        onrampInputAmountUnits: inputAmountUsedForSwap,
        grossOutputAmount, // Store the gross amount before fee deduction
      } as QuoteTicketMetadata,
    });

    const responseFeeStructure: QuoteEndpoints.FeeStructure = {
      network: trimTrailingZeros(networkFeeUSD),
      vortex: trimTrailingZeros(vortexFee),
      anchor: trimTrailingZeros(anchorFee),
      partnerMarkup: trimTrailingZeros(partnerMarkupFee),
      total: trimTrailingZeros(totalFeeUSD),
      currency: feeCurrency,
    };

    return {
      id: quote.id,
      rampType: quote.rampType,
      from: quote.from,
      to: quote.to,
      inputAmount: trimTrailingZeros(quote.inputAmount),
      inputCurrency: quote.inputCurrency,
      outputAmount: trimTrailingZeros(finalOutputAmountStr),
      outputCurrency: quote.outputCurrency,
      fee: responseFeeStructure,
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

    const responseFeeStructure: QuoteEndpoints.FeeStructure = {
      network: trimTrailingZeros(quote.fee.network),
      vortex: trimTrailingZeros(quote.fee.vortex),
      anchor: trimTrailingZeros(quote.fee.anchor),
      partnerMarkup: trimTrailingZeros(quote.fee.partnerMarkup),
      total: trimTrailingZeros(quote.fee.total),
      currency: quote.fee.currency,
    };

    return {
      id: quote.id,
      rampType: quote.rampType,
      from: quote.from,
      to: quote.to,
      inputAmount: trimTrailingZeros(quote.inputAmount),
      inputCurrency: quote.inputCurrency,
      outputAmount: trimTrailingZeros(quote.outputAmount),
      outputCurrency: quote.outputCurrency,
      fee: responseFeeStructure,
      expiresAt: quote.expiresAt,
    };
  }

  /**
   * Calculate core fee components for a quote (vortex, anchor, and partner markup fees)
   */
  private async calculateFeeComponents(
    inputAmount: string,
    rampType: 'on' | 'off',
    from: DestinationType,
    to: DestinationType,
    partner: Partner | null,
  ): Promise<{
    vortexFee: string;
    anchorFee: string;
    partnerMarkupFee: string;
    feeCurrency: string;
  }> {
    try {
      // Use this reference to satisfy ESLint
      this.validateChainSupport(rampType, from, to);

      // 1. Get Vortex Foundation fee from the dedicated partner record
      const vortexFoundationPartner = await Partner.findOne({
        where: { name: 'vortex_foundation', isActive: true },
      });

      if (!vortexFoundationPartner) {
        logger.error('Vortex Foundation partner configuration not found in database.');
        throw new APIError({ status: httpStatus.INTERNAL_SERVER_ERROR, message: 'Internal configuration error [VF]' });
      }

      // 2. Get anchor base fee based on the ramp type and destination
      let anchorIdentifier = 'default';
      if (rampType === 'on' && to === 'moonbeam') {
        anchorIdentifier = 'moonbeam_brla';
      } else if (rampType === 'off' && from === 'moonbeam') {
        anchorIdentifier = 'moonbeam_brla';
      }

      const anchorFeeConfig = await FeeConfiguration.findOne({
        where: {
          feeType: 'anchor_base',
          identifier: anchorIdentifier,
          isActive: true,
        },
      });

      // If no specific anchor fee is found, use 0
      const anchorFee = anchorFeeConfig ? anchorFeeConfig.value.toString() : '0';

      // Calculate Vortex Foundation fee based on type (absolute or relative)
      let vortexFee = '0';
      if (vortexFoundationPartner.markupType === 'none') {
        vortexFee = '0';
      } else if (vortexFoundationPartner.markupType === 'absolute') {
        vortexFee = vortexFoundationPartner.markupValue.toString();
      } else {
        // For relative fee, calculate based on input amount
        vortexFee = new Big(inputAmount).mul(vortexFoundationPartner.markupValue).div(100).toString();
      }

      // 3. Calculate partner markup fee if applicable
      let partnerMarkupFee = '0';
      if (partner && partner.markupType !== 'none') {
        if (partner.markupType === 'absolute') {
          partnerMarkupFee = partner.markupValue.toString();
        } else {
          // For relative fee, calculate based on input amount
          partnerMarkupFee = new Big(inputAmount).mul(partner.markupValue).div(100).toString();
        }
      }

      return {
        vortexFee,
        anchorFee,
        partnerMarkupFee,
        feeCurrency: 'USD',
      };
    } catch (error) {
      logger.error('Error calculating fee components:', error);
      throw new APIError({
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to calculate fee components',
      });
    }
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

  private async calculateGrossOutputAndNetworkFee(
    inputAmount: string,
    inputCurrency: RampCurrency,
    outputCurrency: RampCurrency,
    rampType: 'on' | 'off',
    from: DestinationType,
    to: DestinationType,
  ): Promise<{
    grossOutputAmount: string;
    networkFeeUSD: string;
    outputAmountMoonbeamRaw: string;
    inputAmountUsedForSwap: string;
    effectiveExchangeRate?: string;
  }> {
    // Use this reference to satisfy ESLint
    this.validateChainSupport(rampType, from, to);

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
      if (!outTokenDetails) {
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

      // Initialize networkFeeUSD with '0'
      let networkFeeUSD = '0';
      
      // Use the original input amount directly for the swap
      const inputAmountUsedForSwap = inputAmount;

      const amountOut = await getTokenOutAmount({
        api: apiInstance.api,
        fromAmountString: inputAmountUsedForSwap,
        inputTokenDetails: inputTokenPendulumDetails,
        outputTokenDetails: outputTokenPendulumDetails,
      });

      // if onramp, adjust for axlUSDC price difference.
      const outputAmountMoonbeamRaw: string = amountOut.preciseQuotedAmountOut.rawBalance.toFixed(); // Store the value before the adjustment.
      if (rampType === 'on' && to !== 'assethub') {
        const tokenDetails = getOnChainTokenDetails(getNetworkFromDestination(to)!, outputCurrency as OnChainToken);
        if (!tokenDetails || !isEvmTokenDetails(tokenDetails)) {
          throw new APIError({
            status: httpStatus.BAD_REQUEST,
            message: 'Invalid token details for onramp',
          });
        }

        const routeParams = createOnrampRouteParams(
          '0x30a300612ab372cc73e53ffe87fb73d62ed68da3', // It does not matter.
          amountOut.preciseQuotedAmountOut.rawBalance.toFixed(),
          tokenDetails!,
          getNetworkFromDestination(to)!,
          '0x30a300612ab372cc73e53ffe87fb73d62ed68da3',
        );

        const routeResult = await getRoute(routeParams);
        const { route } = routeResult.data;
        const { toAmountMin } = route.estimate;

        // Check against our moonbeam funding amounts.
        const squidrouterSwapValue = multiplyByPowerOfTen(Big(route.transactionRequest.value), -18);
        const fundingAmountUnits =
          getNetworkFromDestination(to) === Networks.Ethereum
            ? Big(MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS_ETHEREUM)
            : Big(MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS);
        const squidrouterSwapValueBuffer = getNetworkFromDestination(to) === Networks.Ethereum ? 10 : 2;

        // Leave 10 glmr for other operations of the ephemeral, and as buffer for potential price changes.
        if (squidrouterSwapValue.gte(fundingAmountUnits.minus(squidrouterSwapValueBuffer))) {
          throw new APIError({
            status: httpStatus.SERVICE_UNAVAILABLE,
            message: 'Cannot service this route at the moment. Please try again later.',
          });
        }

        // Calculate network fee in USD for EVM on-ramp via Squidrouter
        const squidFeeUSD = squidrouterSwapValue.mul(0.08).toFixed(4);
        // TODO: Replace hardcoded GLMR->USD rate (0.08) with dynamic price fetching.
        networkFeeUSD = squidFeeUSD;

        amountOut.preciseQuotedAmountOut = parseContractBalanceResponse(
          tokenDetails!.pendulumDecimals,
          BigInt(toAmountMin),
        );
        amountOut.roundedDownQuotedAmountOut = amountOut.preciseQuotedAmountOut.preciseBigDecimal.round(2, 0);
        amountOut.effectiveExchangeRate = stringifyBigWithSignificantDecimals(
          amountOut.preciseQuotedAmountOut.preciseBigDecimal.div(new Big(inputAmountUsedForSwap)),
          4,
        );
      }

      // Get the gross output amount (before any fees)
      const grossOutputAmount = amountOut.preciseQuotedAmountOut.preciseBigDecimal.toFixed(6, 0);

      // Return the values using the new structure
      return {
        grossOutputAmount,
        networkFeeUSD,
        outputAmountMoonbeamRaw,
        inputAmountUsedForSwap,
        effectiveExchangeRate: amountOut.effectiveExchangeRate,
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
