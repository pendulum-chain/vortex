import { Big } from 'big.js';
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
  EvmTokenDetails,
} from 'shared';
import { APIError } from '../../../errors/api-error';
import { ApiManager } from '../../pendulum/apiManager';
import { getTokenOutAmount, TokenOutData } from '../../nablaReads/outAmount';
import { createOnrampRouteParams, getRoute, RouteParams } from '../../transactions/squidrouter/route';
import { parseContractBalanceResponse, stringifyBigWithSignificantDecimals } from '../../../helpers/contracts';
import {
  MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS,
  MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS_ETHEREUM,
} from '../../../../constants/constants';
import { multiplyByPowerOfTen } from '../../pendulum/helpers';
import { priceFeedService } from '../../priceFeed.service';
import logger from '../../../../config/logger';

export interface NablaSwapRequest {
  inputAmountForSwap: string;
  inputCurrency: RampCurrency;
  nablaOutputCurrency: RampCurrency;
  rampType: 'on' | 'off';
  fromPolkadotDestination: DestinationType;
  toPolkadotDestination: DestinationType;
}

export interface NablaSwapResult {
  nablaOutputAmountRaw: string;
  nablaOutputAmountDecimal: Big;
  effectiveExchangeRate?: string;
}

export interface EvmBridgeRequest {
  intermediateAmountRaw: string; // Raw output from Nabla swap (e.g. axlUSDC on Moonbeam)
  intermediateCurrencyOnEvm: OnChainToken; // e.g. EvmToken.axlUSDC
  finalOutputCurrency: OnChainToken; // Target token on final EVM chain
  finalEvmDestination: DestinationType; // Target EVM chain
  originalInputAmountForRateCalc: string; // The inputAmountForSwap that went into Nabla, for final rate calculation
}

export interface EvmBridgeResult {
  finalGrossOutputAmountDecimal: Big; // Final amount after Squidrouter
  networkFeeUSD: string; // Squidrouter specific fee
  finalEffectiveExchangeRate?: string;
}

async function getNablaSwapOutAmount(
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
 * Helper to get token details for final output currency on EVM destination
 */
function getTokenDetailsForEvmDestination(
  finalOutputCurrency: OnChainToken,
  finalEvmDestination: DestinationType
): EvmTokenDetails {
  const tokenDetails = getOnChainTokenDetails(
    getNetworkFromDestination(finalEvmDestination)!,
    finalOutputCurrency,
  );
  
  if (!tokenDetails || !isEvmTokenDetails(tokenDetails)) {
    throw new APIError({
      status: httpStatus.BAD_REQUEST,
      message: 'Invalid token details for EVM bridge',
    });
  }

  return tokenDetails;
}

/**
 * Helper to prepare route parameters for Squidrouter
 */
function prepareSquidrouterRouteParams(
  intermediateAmountRaw: string,
  tokenDetails: EvmTokenDetails,
  finalEvmDestination: DestinationType
): RouteParams {
  return createOnrampRouteParams(
    '0x30a300612ab372cc73e53ffe87fb73d62ed68da3', // Placeholder address
    intermediateAmountRaw,
    tokenDetails,
    getNetworkFromDestination(finalEvmDestination)!,
    '0x30a300612ab372cc73e53ffe87fb73d62ed68da3', // Placeholder address
  );
}

/**
 * Helper to execute Squidrouter route and validate response
 */
async function getSquidrouterRouteData(routeParams: RouteParams): Promise<any> {
  const routeResult = await getRoute(routeParams);
  
  if (!routeResult?.data?.route?.estimate) {
    throw new APIError({
      status: httpStatus.SERVICE_UNAVAILABLE,
      message: 'Invalid Squidrouter response',
    });
  }

  return routeResult.data;
}

/**
 * Helper to check Squidrouter swap value against funding limits
 */
function validateSquidrouterSwapValue(
  routeResult: any,
  finalEvmDestination: DestinationType
): void {
  const squidrouterSwapValue = multiplyByPowerOfTen(Big(routeResult.route.transactionRequest.value), -18);

  const fundingAmountUnits =
    getNetworkFromDestination(finalEvmDestination) === Networks.Ethereum
      ? Big(MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS_ETHEREUM)
      : Big(MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS);

  const squidrouterSwapValueBuffer = getNetworkFromDestination(finalEvmDestination) === Networks.Ethereum ? 10 : 2;

  // Leave buffer for other operations of the ephemeral, and as buffer for potential price changes.
  if (squidrouterSwapValue.gte(fundingAmountUnits.minus(squidrouterSwapValueBuffer))) {
    throw new APIError({
      status: httpStatus.SERVICE_UNAVAILABLE,
      message: 'Cannot service this route at the moment. Please try again later.',
    });
  }
}

/**
 * Helper to calculate Squidrouter network fee including GLMR price fetching and fallback
 */
async function calculateSquidrouterNetworkFee(
  routeResult: any
): Promise<string> {
  const squidrouterSwapValue = multiplyByPowerOfTen(Big(routeResult.route.transactionRequest.value), -18);

  try {
    // Get current GLMR price in USD from price feed service
    const glmrPriceUSD = await priceFeedService.getCryptoPrice('moonbeam', 'usd');
    const squidFeeUSD = squidrouterSwapValue.mul(glmrPriceUSD).toFixed(6);
    logger.debug(`Network fee calculated using GLMR price: $${glmrPriceUSD}, fee: $${squidFeeUSD}`);
    return squidFeeUSD;
  } catch (error) {
    // If price feed fails, log the error and use a fallback price
    logger.error(
      `Failed to get GLMR price, using fallback: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    // Fallback to previous hardcoded value as safety measure
    const fallbackGlmrPrice = 0.08;
    const squidFeeUSD = squidrouterSwapValue.mul(fallbackGlmrPrice).toFixed(6);
    logger.warn(`Using fallback GLMR price: $${fallbackGlmrPrice}, fee: $${squidFeeUSD}`);
    return squidFeeUSD;
  }
}

/**
 * Helper to calculate final effective exchange rate
 */
function calculateFinalExchangeRate(
  finalGrossOutputAmount: string,
  originalInputAmountForRateCalc: string,
  tokenDetails: EvmTokenDetails
): string {
  const finalOutputDecimal = parseContractBalanceResponse(tokenDetails.decimals, BigInt(finalGrossOutputAmount));
  return stringifyBigWithSignificantDecimals(
    finalOutputDecimal.preciseBigDecimal.div(new Big(originalInputAmountForRateCalc)),
    4,
  );
}

// ===== EXPORTED FUNCTIONS =====

/**
 * Performs the initial Nabla swap on Pendulum
 */
export async function calculateNablaSwapOutput(
  request: NablaSwapRequest
): Promise<NablaSwapResult> {
  const {
    inputAmountForSwap,
    inputCurrency,
    nablaOutputCurrency,
    rampType,
    fromPolkadotDestination,
    toPolkadotDestination
  } = request;

  // Validate input amount
  if (!inputAmountForSwap || Big(inputAmountForSwap).lte(0)) {
    throw new APIError({
      status: httpStatus.BAD_REQUEST,
      message: 'Input amount for swap must be greater than 0',
    });
  }

  try {
    // Get API manager and Pendulum API
    const apiManager = ApiManager.getInstance();
    const pendulumApi = await apiManager.getApi('pendulum');

    // Get token details for Pendulum
    const inputTokenPendulumDetails = rampType === 'on' 
      ? getPendulumDetails(inputCurrency) 
      : getPendulumDetails(inputCurrency, getNetworkFromDestination(fromPolkadotDestination));
    
    const outputTokenPendulumDetails = rampType === 'on' 
      ? getPendulumDetails(nablaOutputCurrency, getNetworkFromDestination(toPolkadotDestination)) 
      : getPendulumDetails(nablaOutputCurrency);

    if (!inputTokenPendulumDetails || !outputTokenPendulumDetails) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Unable to get Pendulum token details',
      });
    }

    // Perform the Nabla swap
    const swapResult = await getNablaSwapOutAmount(
      pendulumApi,
      inputAmountForSwap,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails
    );

    return {
      nablaOutputAmountRaw: swapResult.preciseQuotedAmountOut.rawBalance.toFixed(),
      nablaOutputAmountDecimal: swapResult.preciseQuotedAmountOut.preciseBigDecimal,
      effectiveExchangeRate: swapResult.effectiveExchangeRate,
    };
  } catch (error) {
    logger.error('Error calculating Nabla swap output:', error);
    throw new APIError({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: 'Failed to calculate Nabla swap output',
    });
  }
}

/**
 * Handles EVM bridging/swapping via Squidrouter and calculates its specific network fee
 */
export async function calculateEvmBridgeAndNetworkFee(
  request: EvmBridgeRequest
): Promise<EvmBridgeResult> {
  const {
    intermediateAmountRaw,
    finalOutputCurrency,
    finalEvmDestination,
    originalInputAmountForRateCalc
  } = request;

  try {
    // Get token details for final output currency
    const tokenDetails = getTokenDetailsForEvmDestination(finalOutputCurrency, finalEvmDestination);

    // Prepare route parameters for Squidrouter
    const routeParams = prepareSquidrouterRouteParams(
      intermediateAmountRaw,
      tokenDetails,
      finalEvmDestination
    );

    // Execute Squidrouter route and validate response
    const routeResult = await getSquidrouterRouteData(routeParams);

    // Check Squidrouter swap value against funding limits
    validateSquidrouterSwapValue(routeResult, finalEvmDestination);

    // Calculate network fee (Squidrouter fee)
    const networkFeeUSD = await calculateSquidrouterNetworkFee(routeResult);

    // Parse final gross output amount
    const finalGrossOutputAmount = routeResult.route.estimate.toAmountMin;
    const finalGrossOutputAmountDecimal = parseContractBalanceResponse(
      tokenDetails.decimals,
      BigInt(finalGrossOutputAmount)
    ).preciseBigDecimal;

    // Calculate final effective exchange rate
    const finalEffectiveExchangeRate = calculateFinalExchangeRate(
      finalGrossOutputAmount,
      originalInputAmountForRateCalc,
      tokenDetails
    );

    return {
      finalGrossOutputAmountDecimal,
      networkFeeUSD,
      finalEffectiveExchangeRate,
    };
  } catch (error) {
    logger.error('Error calculating EVM bridge and network fee:', error);
    throw new APIError({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: 'Failed to calculate EVM bridge and network fee',
    });
  }
}
