import Big from 'big.js';
import { v4 as uuidv4 } from 'uuid';
import httpStatus from 'http-status';
import {
  DestinationType,
  EvmToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  getPendulumDetails,
  isEvmTokenDetails,
  Networks,
  OnChainToken,
  QuoteEndpoints,
  RampCurrency,
} from 'shared';
import { BaseRampService } from './base.service';
import QuoteTicket, { QuoteTicketMetadata } from '../../../models/quoteTicket.model';
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
import { priceFeedService } from '../priceFeed.service';

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

function getTargetFiatCurrency(
  rampType: 'on' | 'off',
  inputCurrency: RampCurrency,
  outputCurrency: RampCurrency,
): RampCurrency {
  // TODO: Add validation to ensure the identified currency is a supported fiat currency
  if (rampType === 'on') {
    // Assuming input is the fiat currency for on-ramp (e.g., BRL from pix)
    return inputCurrency;
  }
  // off-ramp: Assuming output is the fiat currency for off-ramp (e.g., BRL to pix, EUR to sepa)
  return outputCurrency;
}

/* eslint-enable @typescript-eslint/no-unused-vars */

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
    const { grossOutputAmount, networkFeeUSD, outputAmountMoonbeamRaw, inputAmountUsedForSwap } =
      await this.calculateGrossOutputAndNetworkFee(
        request.inputAmount,
        request.inputCurrency,
        request.outputCurrency,
        request.rampType,
        request.from,
        request.to,
      );

    const {
      vortexFee: vortexFeeFiat,
      anchorFee: anchorFeeFiat,
      partnerMarkupFee: partnerMarkupFeeFiat,
      feeCurrency,
    } = await this.calculateFeeComponents(
      request.inputAmount,
      grossOutputAmount,
      request.rampType,
      request.from,
      request.to,
      partner,
      request.inputCurrency,
      request.outputCurrency,
    );

    // We can pick any USD-like stablecoin for the conversion
    const usdCurrency = EvmToken.USDC;
    // Convert fees denoted in USD to fee currency
    const networkFeeFiatPromise = priceFeedService.convertCurrency(networkFeeUSD, usdCurrency, feeCurrency);
    // Convert fees denoted in fee currency to USD (needed for fee distribution transactions)
    const vortexFeeUsdPromise = priceFeedService.convertCurrency(vortexFeeFiat, feeCurrency, usdCurrency);
    const partnerMarkupFeeUsdPromise = priceFeedService.convertCurrency(partnerMarkupFeeFiat, feeCurrency, usdCurrency);
    const anchorFeeUsdPromise = priceFeedService.convertCurrency(anchorFeeFiat, feeCurrency, usdCurrency);

    const [networkFeeFiat, vortexFeeUsd, partnerMarkupFeeUsd, anchorFeeUsd] = await Promise.all([
      networkFeeFiatPromise,
      vortexFeeUsdPromise,
      partnerMarkupFeeUsdPromise,
      anchorFeeUsdPromise,
    ]);

    const usdFeeStructure = {
      network: networkFeeUSD,
      vortex: vortexFeeUsd,
      anchor: anchorFeeUsd,
      partnerMarkup: partnerMarkupFeeUsd,
      total: new Big(networkFeeUSD).plus(vortexFeeUsd).plus(partnerMarkupFeeUsd).plus(anchorFeeUsd).toFixed(2),
      currency: 'USD',
    };

    const totalFeeFiat = new Big(networkFeeFiat)
      .plus(vortexFeeFiat)
      .plus(partnerMarkupFeeFiat)
      .plus(anchorFeeFiat)
      .toFixed(2);

    // Calculate final output amount by subtracting the converted total fee from gross output
    const finalOutputAmount = new Big(grossOutputAmount).minus(totalFeeFiat);
    if (finalOutputAmount.lte(0)) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Input amount too low to cover calculated fees',
      });
    }
    // Format final output amount to 6 decimal places for onramps, 2 for offramps
    const finalOutputAmountStr =
      request.rampType === 'on' ? finalOutputAmount.toFixed(6, 0) : finalOutputAmount.toFixed(2, 0);

    // Store the complete detailed fee structure in target fiat currency
    const feeToStore: QuoteEndpoints.FeeStructure = {
      network: networkFeeFiat,
      vortex: vortexFeeFiat,
      anchor: anchorFeeFiat,
      partnerMarkup: partnerMarkupFeeFiat,
      total: totalFeeFiat,
      currency: feeCurrency,
    };

    // Create quote in database with the detailed fee structure
    const quote = await QuoteTicket.create({
      id: uuidv4(),
      rampType: request.rampType,
      from: request.from,
      to: request.to,
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      outputAmount: finalOutputAmountStr,
      outputCurrency: request.outputCurrency,
      fee: feeToStore,
      partnerId: partner?.id || null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      status: 'pending',
      metadata: {
        onrampOutputAmountMoonbeamRaw: outputAmountMoonbeamRaw,
        onrampInputAmountUnits: inputAmountUsedForSwap,
        grossOutputAmount, // Store the gross amount before fee deduction
        usdFeeStructure,
      } as QuoteTicketMetadata,
    });

    const responseFeeStructure: QuoteEndpoints.FeeStructure = {
      network: trimTrailingZeros(networkFeeFiat),
      vortex: trimTrailingZeros(vortexFeeFiat),
      anchor: trimTrailingZeros(anchorFeeFiat),
      partnerMarkup: trimTrailingZeros(partnerMarkupFeeFiat),
      total: trimTrailingZeros(totalFeeFiat),
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
    outputAmount: string, // This is the gross output amount of the Nabla swap before fees
    rampType: 'on' | 'off',
    from: DestinationType,
    to: DestinationType,
    partner: Partner | null,
    inputCurrency: RampCurrency,
    outputCurrency: RampCurrency,
  ): Promise<{
    vortexFee: string;
    anchorFee: string;
    partnerMarkupFee: string;
    feeCurrency: RampCurrency;
  }> {
    try {
      // Use this reference to satisfy ESLint
      this.validateChainSupport(rampType, from, to);

      // 1. Get Vortex Foundation fee from the dedicated partner record
      const vortexFoundationPartner = await Partner.findOne({
        where: {
          name: 'vortex_foundation',
          isActive: true,
          feeType: rampType
        },
      });

      if (!vortexFoundationPartner) {
        logger.error(`Vortex Foundation partner configuration not found for ${rampType}-ramp in database.`);
        throw new APIError({ status: httpStatus.INTERNAL_SERVER_ERROR, message: 'Internal configuration error [VF]' });
      }

      // 2. Get anchor base fee based on the ramp type and destination
      let anchorIdentifier = 'default';
      if (rampType === 'on' && from === 'pix') {
        anchorIdentifier = 'moonbeam_brla';
      } else if (rampType === 'off' && to === 'pix') {
        anchorIdentifier = 'moonbeam_brla';
      } else if (rampType === 'off' && to === 'sepa') {
        anchorIdentifier = 'stellar_eurc';
      } else if (rampType === 'off' && to === 'cbu') {
        anchorIdentifier = 'stellar_ars';
      }

      const anchorFeeConfigs = await FeeConfiguration.findAll({
        where: {
          feeType: rampType,
          identifier: anchorIdentifier,
          isActive: true,
        },
      });

      // Calculate anchor fee based on type (absolute or relative)
      let anchorFee = '0';
      if (anchorFeeConfigs.length > 0) {
        // Calculate total anchor fee by reducing the array
        const totalAnchorFee = anchorFeeConfigs.reduce((total, feeConfig) => {
          if (feeConfig.valueType === 'absolute') {
            return total.plus(feeConfig.value);
          }
          if (feeConfig.valueType === 'relative') {
            // Calculate relative fee based on the input or output amount
            const amount = rampType === 'on' ? inputAmount : outputAmount;
            const relativeFee = new Big(amount).mul(feeConfig.value);
            return total.plus(relativeFee);
          }
          return total;
        }, new Big(0));

        anchorFee = totalAnchorFee.toFixed(2);
      }

      // Calculate Vortex Foundation fee based on type (absolute or relative)
      let vortexFee = '0';
      if (vortexFoundationPartner.markupType === 'none') {
        vortexFee = '0';
      } else if (vortexFoundationPartner.markupType === 'absolute') {
        vortexFee = vortexFoundationPartner.markupValue.toFixed(2);
      } else {
        vortexFee = new Big(inputAmount).mul(vortexFoundationPartner.markupValue).toFixed(2);
      }

      // 3. Calculate partner markup fee if applicable
      let partnerMarkupFee = '0';
      // Only apply partner markup if partner exists, has a non-none markup type, and feeType matches current ramp type
      if (partner && partner.markupType !== 'none' && partner.feeType === rampType) {
        if (partner.markupType === 'absolute') {
          partnerMarkupFee = partner.markupValue.toFixed(2);
        } else {
          partnerMarkupFee = new Big(inputAmount).mul(partner.markupValue).toFixed(2);
        }
      }

      // Determine the correct fiat currency for the transaction
      const feeCurrency = getTargetFiatCurrency(rampType, inputCurrency, outputCurrency);

      return {
        vortexFee,
        anchorFee,
        partnerMarkupFee,
        feeCurrency,
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
        try {
          // Get current GLMR price in USD from price feed service
          const glmrPriceUSD = await priceFeedService.getCryptoPrice('moonbeam', 'usd');
          const squidFeeUSD = squidrouterSwapValue.mul(glmrPriceUSD).toFixed(2);
          networkFeeUSD = squidFeeUSD;
          logger.debug(`Network fee calculated using GLMR price: $${glmrPriceUSD}, fee: $${squidFeeUSD}`);
        } catch (error) {
          // If price feed fails, log the error and use a fallback price
          logger.error(
            `Failed to get GLMR price, using fallback: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          // Fallback to previous hardcoded value as safety measure
          const fallbackGlmrPrice = 0.08;
          const squidFeeUSD = squidrouterSwapValue.mul(fallbackGlmrPrice).toFixed(2);
          networkFeeUSD = squidFeeUSD;
          logger.warn(`Using fallback GLMR price: $${fallbackGlmrPrice}, fee: $${squidFeeUSD}`);
        }

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
