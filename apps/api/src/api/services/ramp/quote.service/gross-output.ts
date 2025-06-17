import {
  DestinationType,
  EvmTokenDetails,
  Networks,
  OnChainToken,
  PendulumDetails,
  RampCurrency,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  getPendulumDetails,
  isEvmTokenDetails,
} from '@packages/shared';
import { ApiPromise } from '@polkadot/api';
import { Big } from 'big.js';
import httpStatus from 'http-status';
import logger from '../../../../config/logger';
import { APIError } from '../../../errors/api-error';
import { parseContractBalanceResponse, stringifyBigWithSignificantDecimals } from '../../../helpers/contracts';
import { TokenOutData, getTokenOutAmount } from '../../nablaReads/outAmount';
import { ApiManager } from '../../pendulum/apiManager';
import { multiplyByPowerOfTen } from '../../pendulum/helpers';
import { priceFeedService } from '../../priceFeed.service';
import { RouteParams, SquidrouterRoute, createOnrampRouteParams, getRoute } from '../../transactions/squidrouter/route';

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
  apiInstance: { api: ApiPromise },
  fromAmountString: string,
  inputTokenDetails: PendulumDetails,
  outputTokenDetails: PendulumDetails,
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
export function getTokenDetailsForEvmDestination(
  finalOutputCurrency: OnChainToken,
  finalEvmDestination: DestinationType,
): EvmTokenDetails {
  const network = getNetworkFromDestination(finalEvmDestination);
  if (!network) {
    throw new APIError({
      status: httpStatus.BAD_REQUEST,
      message: 'Invalid EVM destination network',
    });
  }

  const tokenDetails = getOnChainTokenDetails(network, finalOutputCurrency);

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
  finalEvmDestination: DestinationType,
): RouteParams {
  const network = getNetworkFromDestination(finalEvmDestination);
  if (!network) {
    throw new APIError({
      status: httpStatus.BAD_REQUEST,
      message: 'Invalid EVM destination network',
    });
  }

  return createOnrampRouteParams(
    '0x30a300612ab372cc73e53ffe87fb73d62ed68da3', // Placeholder address
    intermediateAmountRaw,
    tokenDetails,
    network,
    '0x30a300612ab372cc73e53ffe87fb73d62ed68da3', // Placeholder address
  );
}

/**
 * Helper to execute Squidrouter route and validate response
 */
async function getSquidrouterRouteData(routeParams: RouteParams): Promise<SquidrouterRoute> {
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
 * Helper to calculate Squidrouter network fee including GLMR price fetching and fallback
 */
async function calculateSquidrouterNetworkFee(routeResult: SquidrouterRoute): Promise<string> {
  const squidRouterSwapValue = multiplyByPowerOfTen(Big(routeResult.route.transactionRequest.value), -18);

  try {
    // Get current GLMR price in USD from price feed service
    const glmrPriceUSD = await priceFeedService.getCryptoPrice('moonbeam', 'usd');
    const squidFeeUSD = squidRouterSwapValue.mul(glmrPriceUSD).toFixed(6);
    logger.debug(`Network fee calculated using GLMR price: $${glmrPriceUSD}, fee: $${squidFeeUSD}`);
    return squidFeeUSD;
  } catch (error) {
    // If price feed fails, log the error and use a fallback price
    logger.error(
      `Failed to get GLMR price, using fallback: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    // Fallback to previous hardcoded value as safety measure
    const fallbackGlmrPrice = 0.08;
    const squidFeeUSD = squidRouterSwapValue.mul(fallbackGlmrPrice).toFixed(6);
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
  tokenDetails: EvmTokenDetails,
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
export async function calculateNablaSwapOutput(request: NablaSwapRequest): Promise<NablaSwapResult> {
  const {
    inputAmountForSwap,
    inputCurrency,
    nablaOutputCurrency,
    rampType,
    fromPolkadotDestination,
    toPolkadotDestination,
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
    const inputTokenPendulumDetails =
      rampType === 'on'
        ? getPendulumDetails(inputCurrency)
        : getPendulumDetails(inputCurrency, getNetworkFromDestination(fromPolkadotDestination));

    const outputTokenPendulumDetails =
      rampType === 'on'
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
      outputTokenPendulumDetails,
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
      message: 'Failed to calculate the quote. Please try a lower amount.',
    });
  }
}

/**
 * Handles EVM bridging/swapping via Squidrouter and calculates its specific network fee
 */
export async function calculateEvmBridgeAndNetworkFee(request: EvmBridgeRequest): Promise<EvmBridgeResult> {
  const { intermediateAmountRaw, finalOutputCurrency, finalEvmDestination, originalInputAmountForRateCalc } = request;

  try {
    // Get token details for final output currency
    const tokenDetails = getTokenDetailsForEvmDestination(finalOutputCurrency, finalEvmDestination);

    // Prepare route parameters for Squidrouter
    const routeParams = prepareSquidrouterRouteParams(intermediateAmountRaw, tokenDetails, finalEvmDestination);

    // Execute Squidrouter route and validate response
    const routeResult = await getSquidrouterRouteData(routeParams);

    // Calculate network fee (Squidrouter fee)
    const networkFeeUSD = await calculateSquidrouterNetworkFee(routeResult);

    // Parse final gross output amount
    const finalGrossOutputAmount = routeResult.route.estimate.toAmountMin;
    const finalGrossOutputAmountDecimal = parseContractBalanceResponse(
      tokenDetails.decimals,
      BigInt(finalGrossOutputAmount),
    ).preciseBigDecimal;

    // Calculate final effective exchange rate
    const finalEffectiveExchangeRate = calculateFinalExchangeRate(
      finalGrossOutputAmount,
      originalInputAmountForRateCalc,
      tokenDetails,
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
      message: 'Failed to calculate the quote. Please try a higher amount.',
    });
  }
}
