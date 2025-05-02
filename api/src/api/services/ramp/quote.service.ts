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

/**
 * Helper function to map RampCurrency to CoinGecko token ID
 * @param currency - The RampCurrency to map
 * @returns The corresponding CoinGecko token ID or null if not mappable
 */
function getCoinGeckoTokenId(currency: RampCurrency): string | null {
  const tokenIdMap: Record<string, string> = {
    'GLMR': 'moonbeam',
    'ETH': 'ethereum',
    'AVAX': 'avalanche-2',
    'MATIC': 'matic-network',
    'BNB': 'binancecoin',
  };
  
  return tokenIdMap[currency as string] || null;
}

/**
 * Determines if a currency is a USD-like stablecoin
 * @param currency - The currency to check
 * @returns True if the currency is USD-like
 */
function isUsdLikeCurrency(currency: RampCurrency): boolean {
  const usdLikeCurrencies = ['USD', 'USDC', 'axlUSDC', 'USDT'];
  return usdLikeCurrencies.includes(currency as string);
}

/**
 * Converts a fee amount in USD to the specified output currency
 * @param feeUSD - The fee amount in USD
 * @param outputCurrency - The target currency to convert to
 * @returns The fee amount in the output currency
 */
async function convertFeeToOutputCurrency(feeUSD: string, outputCurrency: RampCurrency): Promise<string> {
  try {
    // If output is USD-like, return feeUSD (1:1 conversion)
    if (isUsdLikeCurrency(outputCurrency)) {
      return feeUSD;
    }
    
    // Check if outputCurrency is another fiat currency
    const fiatCurrencies = ['BRL', 'EUR', 'ARS'];
    if (fiatCurrencies.includes(outputCurrency as string)) {
      // Get exchange rate from USD to the target fiat
      const rate = await priceFeedService.getFiatExchangeRate('USD', outputCurrency as string);
      return new Big(feeUSD).mul(rate).toFixed(2);
    }
    
    // If outputCurrency is a crypto token, convert USD to crypto
    const tokenId = getCoinGeckoTokenId(outputCurrency);
    if (tokenId) {
      // Get crypto price in USD
      const cryptoPriceUSD = await priceFeedService.getCryptoPrice(tokenId, 'usd');
      if (cryptoPriceUSD <= 0) {
        throw new Error(`Invalid price for ${outputCurrency}: ${cryptoPriceUSD}`);
      }
      
      // Calculate fee in crypto: feeUSD / cryptoPriceUSD
      return new Big(feeUSD).div(cryptoPriceUSD).toFixed(6);
    }
    
    // If we reach here, we couldn't convert the fee
    logger.warn(`Could not convert fee from USD to ${outputCurrency}. Using 1:1 conversion as fallback.`);
    return feeUSD;
  } catch (error) {
    // Log the error but don't fail the quote creation
    logger.error(`Error converting fee from USD to ${outputCurrency}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    // Return the USD value as fallback
    return feeUSD;
  }
}

/**
 * Converts a USD amount to the specified target fiat currency
 * @param amountUSD - The amount in USD
 * @param targetFiat - The target fiat currency
 * @returns The amount in the target fiat currency
 */
async function convertUSDtoTargetFiat(amountUSD: string, targetFiat: RampCurrency): Promise<string> {
  try {
    // If target is USD-like, return amountUSD (1:1 conversion)
    if (isUsdLikeCurrency(targetFiat)) {
      return amountUSD;
    }
    
    // Get exchange rate from USD to the target fiat
    const rate = await priceFeedService.getFiatExchangeRate('USD', targetFiat as string);
    
    // Calculate amount in target fiat
    return new Big(amountUSD).mul(rate).toFixed(2);
  } catch (error) {
    // Log the error but don't fail the quote creation
    logger.error(`Error converting USD to ${targetFiat}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    // Return the USD value as fallback
    return amountUSD;
  }
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

    // Calculate core fee components using the database-driven logic
    const { vortexFee, anchorFee, partnerMarkupFee } = await this.calculateFeeComponents(
      request.inputAmount,
      request.rampType,
      request.from,
      request.to,
      partner,
    );

    // Calculate total fee in USD
    const totalFeeUSD = new Big(networkFeeUSD).plus(vortexFee).plus(anchorFee).plus(partnerMarkupFee).toString();

    // Determine target fiat currency
    const targetFiat = getTargetFiatCurrency(request.rampType, request.inputCurrency, request.outputCurrency);

    // Convert fees to target fiat
    const networkFeeFiatPromise = convertUSDtoTargetFiat(networkFeeUSD, targetFiat);
    const vortexFeeFiatPromise = convertUSDtoTargetFiat(vortexFee, targetFiat);
    const anchorFeeFiatPromise = convertUSDtoTargetFiat(anchorFee, targetFiat);
    const partnerMarkupFeeFiatPromise = convertUSDtoTargetFiat(partnerMarkupFee, targetFiat);
    const totalFeeFiatPromise = convertUSDtoTargetFiat(totalFeeUSD, targetFiat);

    // Await all conversions
    const [networkFeeFiat, vortexFeeFiat, anchorFeeFiat, partnerMarkupFeeFiat, totalFeeFiat] = await Promise.all([
      networkFeeFiatPromise,
      vortexFeeFiatPromise,
      anchorFeeFiatPromise,
      partnerMarkupFeeFiatPromise,
      totalFeeFiatPromise,
    ]);

    // Convert total fee to output currency - KEEP THIS CALCULATION AS IS
    // Still use the original USD total here for the final output amount calculation
    const totalFeeInOutputCurrency = await convertFeeToOutputCurrency(
      totalFeeUSD,
      request.outputCurrency
    );

    // Calculate final output amount by subtracting the converted total fee from gross output
    const finalOutputAmount = new Big(grossOutputAmount).minus(totalFeeInOutputCurrency);
    if (finalOutputAmount.lte(0)) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Input amount too low to cover calculated fees',
      });
    }
    // Format final output amount to 6 decimal places for onramps, 2 for offramps
    const finalOutputAmountStr =
      request.rampType === 'on' ? finalOutputAmount.toFixed(6, 0) : finalOutputAmount.toFixed(2, 0);

    // Calculate distributable fees (sum of network, vortex, and partner markup fees)
    const distributableFeesFiat = new Big(networkFeeFiat).plus(vortexFeeFiat).plus(partnerMarkupFeeFiat).toString();

    // Store the complete detailed fee structure in target fiat currency
    const feeToStore: QuoteEndpoints.FeeStructure = {
      network: networkFeeFiat,
      vortex: vortexFeeFiat,
      anchor: anchorFeeFiat,
      partnerMarkup: partnerMarkupFeeFiat,
      total: totalFeeFiat,
      currency: targetFiat,
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
        anchorFeeFiat, // Store the anchor fee component
        distributableFeesFiat, // Store the sum of distributable fees
        targetFiat, // Store the target fiat currency
      } as QuoteTicketMetadata,
    });

    const responseFeeStructure: QuoteEndpoints.FeeStructure = {
      network: trimTrailingZeros(networkFeeFiat),
      vortex: trimTrailingZeros(vortexFeeFiat),
      anchor: trimTrailingZeros(anchorFeeFiat),
      partnerMarkup: trimTrailingZeros(partnerMarkupFeeFiat),
      total: trimTrailingZeros(totalFeeFiat),
      currency: targetFiat,
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
      if (rampType === 'on' && from === 'pix') {
        anchorIdentifier = 'moonbeam_brla';
      } else if (rampType === 'off' && to === 'pix') {
        anchorIdentifier = 'moonbeam_brla';
      } else if (rampType === 'off' && from === 'sepa') {
        anchorIdentifier = 'stellar_eurc';
      } else if (rampType === 'off' && from === 'cbu') {
        anchorIdentifier = 'stellar_ars';
      }

      const anchorFeeConfigs = await FeeConfiguration.findAll({
        where: {
          feeType: 'anchor_base',
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
            const relativeFee = new Big(inputAmount).mul(feeConfig.value).div(100);
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
        vortexFee = new Big(inputAmount).mul(vortexFoundationPartner.markupValue).div(100).toFixed(2);
      }

      // 3. Calculate partner markup fee if applicable
      let partnerMarkupFee = '0';
      if (partner && partner.markupType !== 'none') {
        if (partner.markupType === 'absolute') {
          partnerMarkupFee = partner.markupValue.toFixed(2);
        } else {
          partnerMarkupFee = new Big(inputAmount).mul(partner.markupValue).div(100).toFixed(2);
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
        try {
          // Get current GLMR price in USD from price feed service
          const glmrPriceUSD = await priceFeedService.getCryptoPrice('moonbeam', 'usd');
          const squidFeeUSD = squidrouterSwapValue.mul(glmrPriceUSD).toFixed(2);
          networkFeeUSD = squidFeeUSD;
          logger.debug(`Network fee calculated using GLMR price: $${glmrPriceUSD}, fee: $${squidFeeUSD}`);
        } catch (error) {
          // If price feed fails, log the error and use a fallback price
          logger.error(`Failed to get GLMR price, using fallback: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
