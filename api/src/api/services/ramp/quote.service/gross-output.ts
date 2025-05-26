import Big from 'big.js';
import httpStatus from 'http-status';
import {
  DestinationType,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  getPendulumDetails,
  isEvmTokenDetails,
  Networks,
  OnChainToken,
  RampCurrency,
} from 'shared';
import { APIError } from '../../../errors/api-error';
import { ApiManager } from '../../pendulum/apiManager';
import { getTokenOutAmount, TokenOutData } from '../../nablaReads/outAmount';
import { createOnrampRouteParams, getRoute } from '../../transactions/squidrouter/route';
import { parseContractBalanceResponse, stringifyBigWithSignificantDecimals } from '../../../helpers/contracts';
import {
  MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS,
  MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS_ETHEREUM,
} from '../../../../constants/constants';
import { multiplyByPowerOfTen } from '../../pendulum/helpers';
import { priceFeedService } from '../../priceFeed.service';
import logger from '../../../../config/logger';
import { validateChainSupport } from './helpers';

export interface GrossOutputResult {
  grossOutputAmount: string;
  networkFeeUSD: string;
  outputAmountMoonbeamRaw: string;
  inputAmountUsedForSwap: string;
  effectiveExchangeRate?: string;
}

export interface GrossOutputRequest {
  inputAmount: string;
  inputCurrency: RampCurrency;
  outputCurrency: RampCurrency;
  rampType: 'on' | 'off';
  from: DestinationType;
  to: DestinationType;
}

interface EvmOnRampAdjustmentResult {
  updatedAmountOut: TokenOutData;
  networkFeeUSD: string;
}

/**
 * Performs the initial swap calculation using Nabla
 * @param apiInstance - The Pendulum API instance
 * @param fromAmountString - The input amount as string
 * @param inputTokenDetails - Input token details for Pendulum
 * @param outputTokenDetails - Output token details for Pendulum
 * @returns The amount out object from getTokenOutAmount
 */
async function performInitialSwap(
  apiInstance: any,
  fromAmountString: string,
  inputTokenDetails: any,
  outputTokenDetails: any,
): Promise<TokenOutData> {
  return await getTokenOutAmount({
    api: apiInstance.api,
    fromAmountString,
    inputTokenDetails,
    outputTokenDetails,
  });
}

/**
 * Handles EVM on-ramp specific adjustments including Squidrouter integration
 * @param amountOutSoFar - The initial swap result
 * @param outputCurrency - The output currency
 * @param toDestination - The destination for the on-ramp
 * @param inputAmountUsedForSwap - The input amount used for swap
 * @returns Updated amount out and network fee in USD
 */
async function handleEvmOnRampAdjustments(
  amountOutSoFar: TokenOutData,
  outputCurrency: RampCurrency,
  toDestination: DestinationType,
  inputAmountUsedForSwap: string,
): Promise<EvmOnRampAdjustmentResult> {
  const tokenDetails = getOnChainTokenDetails(
    getNetworkFromDestination(toDestination)!,
    outputCurrency as OnChainToken,
  );
  if (!tokenDetails || !isEvmTokenDetails(tokenDetails)) {
    throw new APIError({
      status: httpStatus.BAD_REQUEST,
      message: 'Invalid token details for onramp',
    });
  }

  const routeParams = createOnrampRouteParams(
    '0x30a300612ab372cc73e53ffe87fb73d62ed68da3', // It does not matter.
    amountOutSoFar.preciseQuotedAmountOut.rawBalance.toFixed(),
    tokenDetails,
    getNetworkFromDestination(toDestination)!,
    '0x30a300612ab372cc73e53ffe87fb73d62ed68da3',
  );

  const routeResult = await getRoute(routeParams);
  const { route } = routeResult.data;
  const { toAmountMin } = route.estimate;

  // Check against our moonbeam funding amounts.
  const squidrouterSwapValue = multiplyByPowerOfTen(Big(route.transactionRequest.value), -18);

  const fundingAmountUnits =
    getNetworkFromDestination(toDestination) === Networks.Ethereum
      ? Big(MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS_ETHEREUM)
      : Big(MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS);

  const squidrouterSwapValueBuffer = getNetworkFromDestination(toDestination) === Networks.Ethereum ? 10 : 2;

  // Leave buffer for other operations of the ephemeral, and as buffer for potential price changes.
  if (squidrouterSwapValue.gte(fundingAmountUnits.minus(squidrouterSwapValueBuffer))) {
    throw new APIError({
      status: httpStatus.SERVICE_UNAVAILABLE,
      message: 'Cannot service this route at the moment. Please try again later.',
    });
  }

  // Calculate network fee in USD for EVM on-ramp via Squidrouter
  let networkFeeUSD: string;
  try {
    // Get current GLMR price in USD from price feed service
    const glmrPriceUSD = await priceFeedService.getCryptoPrice('moonbeam', 'usd');
    const squidFeeUSD = squidrouterSwapValue.mul(glmrPriceUSD).toFixed(6);
    networkFeeUSD = squidFeeUSD;
    logger.debug(`Network fee calculated using GLMR price: $${glmrPriceUSD}, fee: $${squidFeeUSD}`);
  } catch (error) {
    // If price feed fails, log the error and use a fallback price
    logger.error(
      `Failed to get GLMR price, using fallback: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    // Fallback to previous hardcoded value as safety measure
    const fallbackGlmrPrice = 0.08;
    const squidFeeUSD = squidrouterSwapValue.mul(fallbackGlmrPrice).toFixed(6);
    networkFeeUSD = squidFeeUSD;
    logger.warn(`Using fallback GLMR price: $${fallbackGlmrPrice}, fee: $${squidFeeUSD}`);
  }

  // Update the amount out with Squidrouter results
  const updatedAmountOut = { ...amountOutSoFar };
  updatedAmountOut.preciseQuotedAmountOut = parseContractBalanceResponse(tokenDetails.decimals, BigInt(toAmountMin));
  updatedAmountOut.roundedDownQuotedAmountOut = updatedAmountOut.preciseQuotedAmountOut.preciseBigDecimal.round(2, 0);
  updatedAmountOut.effectiveExchangeRate = stringifyBigWithSignificantDecimals(
    updatedAmountOut.preciseQuotedAmountOut.preciseBigDecimal.div(new Big(inputAmountUsedForSwap)),
    4,
  );

  return {
    updatedAmountOut,
    networkFeeUSD,
  };
}

/**
 * Calculates the gross output amount and network fee for a ramp operation
 * @param request - The gross output calculation request parameters
 * @returns Promise resolving to the gross output result
 */
export async function calculateGrossOutputAndNetworkFee(request: GrossOutputRequest): Promise<GrossOutputResult> {
  const { inputAmount, inputCurrency, outputCurrency, rampType, from, to } = request;

  // Perform initial validations
  validateChainSupport(rampType, from, to);

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
    // Determine token details for Pendulum
    const inputTokenPendulumDetails =
      rampType === 'on' ? getPendulumDetails(inputCurrency) : getPendulumDetails(inputCurrency, fromNetwork);
    const outputTokenPendulumDetails =
      rampType === 'on' ? getPendulumDetails(outputCurrency, toNetwork) : getPendulumDetails(outputCurrency);

    // Initialize networkFeeUSD with '0'
    let networkFeeUSD = '0';

    // Use the original input amount directly for the swap
    const inputAmountUsedForSwap = inputAmount;

    // Perform initial swap
    let amountOut = await performInitialSwap(
      apiInstance,
      inputAmountUsedForSwap,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails,
    );

    // Store the value before any adjustments
    const outputAmountMoonbeamRaw: string = amountOut.preciseQuotedAmountOut.rawBalance.toFixed();

    // Handle EVM on-ramp specific adjustments if needed
    if (rampType === 'on' && to !== 'assethub') {
      const evmAdjustmentResult = await handleEvmOnRampAdjustments(
        amountOut,
        outputCurrency,
        to,
        inputAmountUsedForSwap,
      );
      amountOut = evmAdjustmentResult.updatedAmountOut;
      networkFeeUSD = evmAdjustmentResult.networkFeeUSD;
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
