import {
  createGenericRouteParams,
  createRouteParamsWithMoonbeamPostHook,
  DestinationType,
  EvmTokenDetails,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  getRoute,
  isEvmTokenDetails,
  Networks,
  OnChainToken,
  parseContractBalanceResponse,
  QuoteError,
  RampDirection,
  RouteParams,
  SquidrouterRoute,
  stringifyBigWithSignificantDecimals
} from "@vortexfi/shared";
import { Big } from "big.js";
import httpStatus from "http-status";
import logger from "../../../../config/logger";
import { APIError } from "../../../errors/api-error";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";
import { priceFeedService } from "../../priceFeed.service";

export interface EvmBridgeRequest {
  amountRaw: string; // Raw amount to bridge/swap via Squidrouter
  fromToken: `0x${string}`; // EVM token address on source chain
  toToken: `0x${string}`; // EVM token address on destination chain
  fromNetwork: Networks;
  toNetwork: Networks;
  originalInputAmountForRateCalc: string; // The inputAmountForSwap that went into Nabla, for final rate calculation
  rampType: RampDirection; // Whether this is an onramp or offramp
}

export interface EvmBridgeQuoteRequest {
  rampType: RampDirection; // Whether this is an onramp or offramp
  amountDecimal: string; // Raw amount
  inputCurrency: OnChainToken;
  outputCurrency: OnChainToken;
  fromNetwork: Networks;
  toNetwork: Networks;
}

export interface EvmBridgeResult {
  finalGrossOutputAmountDecimal: Big; // Final amount after Squidrouter
  networkFeeUSD: string; // Squidrouter specific fee
  finalEffectiveExchangeRate?: string;
  outputTokenDecimals: number;
}

/**
 * Helper to get token details for final output currency on EVM destination
 */
export function getTokenDetailsForEvmDestination(
  finalOutputCurrency: OnChainToken,
  finalEvmDestination: DestinationType
): EvmTokenDetails {
  const network = getNetworkFromDestination(finalEvmDestination);
  if (!network) {
    throw new APIError({
      message: "Invalid EVM destination network",
      status: httpStatus.BAD_REQUEST
    });
  }

  const tokenDetails = getOnChainTokenDetails(network, finalOutputCurrency);

  if (!tokenDetails || !isEvmTokenDetails(tokenDetails)) {
    throw new APIError({
      message: "Invalid token details for EVM bridge",
      status: httpStatus.BAD_REQUEST
    });
  }

  return tokenDetails;
}

/**
 * Helper to prepare route parameters for Squidrouter
 */
function prepareSquidrouterRouteParams(params: {
  rampType: RampDirection;
  amountRaw: string;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  fromNetwork: Networks;
  toNetwork: Networks;
}): RouteParams {
  const { rampType, amountRaw, fromToken, toToken, fromNetwork, toNetwork } = params;

  const placeholderAddress = "0x30a300612ab372cc73e53ffe87fb73d62ed68da3";
  const placeholderHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  return rampType === RampDirection.BUY
    ? createGenericRouteParams({
        amount: amountRaw,
        destinationAddress: placeholderAddress,
        fromAddress: placeholderAddress,
        fromNetwork,
        fromToken,
        toNetwork,
        toToken
      })
    : createRouteParamsWithMoonbeamPostHook({
        amount: amountRaw,
        fromAddress: placeholderAddress,
        fromNetwork,
        fromToken,
        receivingContractAddress: placeholderAddress,
        squidRouterReceiverHash: placeholderHash
      });
}

/**
 * Helper to calculate Squidrouter network fee including GLMR price fetching and fallback
 */
async function calculateSquidrouterNetworkFee(routeResult: SquidrouterRoute): Promise<string> {
  const squidRouterSwapValue = multiplyByPowerOfTen(Big(routeResult.transactionRequest.value), -18);

  try {
    // Get current GLMR price in USD from price feed service
    const glmrPriceUSD = await priceFeedService.getCryptoPrice("moonbeam", "usd");
    const squidFeeUSD = squidRouterSwapValue.mul(glmrPriceUSD).toFixed(6);
    logger.debug(`Network fee calculated using GLMR price: $${glmrPriceUSD}, fee: $${squidFeeUSD}`);
    return squidFeeUSD;
  } catch (error) {
    // If price feed fails, log the error and use a fallback price
    logger.error(`Failed to get GLMR price, using fallback: ${error instanceof Error ? error.message : "Unknown error"}`);
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
  outputTokenDecimals: number
): string {
  const finalOutputDecimal = parseContractBalanceResponse(outputTokenDecimals, BigInt(finalGrossOutputAmount));
  return stringifyBigWithSignificantDecimals(
    finalOutputDecimal.preciseBigDecimal.div(new Big(originalInputAmountForRateCalc)),
    4
  );
}

// ===== EXPORTED FUNCTIONS =====

function buildRouteRequest(request: EvmBridgeQuoteRequest) {
  const inputTokenDetails = getTokenDetailsForEvmDestination(request.inputCurrency, request.fromNetwork);
  const outputTokenDetails = getTokenDetailsForEvmDestination(request.outputCurrency, request.toNetwork);
  const amountRaw = multiplyByPowerOfTen(request.amountDecimal, inputTokenDetails.decimals).toFixed(0, 0);

  return prepareSquidrouterRouteParams({
    amountRaw,
    fromNetwork: request.fromNetwork,
    fromToken: inputTokenDetails.erc20AddressSourceChain,
    rampType: request.rampType,
    toNetwork: request.toNetwork,
    toToken: outputTokenDetails.erc20AddressSourceChain
  });
}

async function getSquidrouterRouteData(routeParams: RouteParams) {
  const routeResult = await getRoute(routeParams);

  if (!routeResult?.data?.route?.estimate) {
    throw new APIError({
      message: "Invalid Squidrouter response",
      status: httpStatus.SERVICE_UNAVAILABLE
    });
  }

  const routeData = routeResult.data;
  const outputTokenDecimals = routeData.route.estimate.toToken.decimals;
  const outputAmountRaw = routeData.route.estimate.toAmount;
  const outputAmountDecimal = parseContractBalanceResponse(outputTokenDecimals, BigInt(outputAmountRaw)).preciseBigDecimal;
  const networkFeeUSD = await calculateSquidrouterNetworkFee(routeData.route);

  return {
    fromToken: routeParams.fromToken,
    inputAmountRaw: routeParams.fromAmount,
    networkFeeUSD,
    outputAmountDecimal,
    outputAmountRaw,
    outputTokenDecimals,
    routeData,
    toToken: routeParams.toToken
  };
}

/**
 * Handles EVM bridging/swapping via Squidrouter and calculates its specific network fee
 */
export async function calculateEvmBridgeAndNetworkFee(request: EvmBridgeRequest): Promise<EvmBridgeResult> {
  const { amountRaw, fromNetwork, toNetwork, fromToken, toToken, originalInputAmountForRateCalc, rampType } = request;

  try {
    // Prepare route parameters for Squidrouter
    const routeParams = prepareSquidrouterRouteParams({
      amountRaw: amountRaw,
      fromNetwork,
      fromToken,
      rampType,
      toNetwork,
      toToken
    });

    // Execute Squidrouter route and validate response
    const { networkFeeUSD, routeData, outputTokenDecimals } = await getSquidrouterRouteData(routeParams);

    // Calculate network fee (Squidrouter fee)
    // Parse final gross output amount
    const finalGrossOutputAmount = routeData.route.estimate.toAmount;
    const finalGrossOutputAmountDecimal = parseContractBalanceResponse(
      outputTokenDecimals,
      BigInt(finalGrossOutputAmount)
    ).preciseBigDecimal;

    // Calculate final effective exchange rate
    const finalEffectiveExchangeRate = calculateFinalExchangeRate(
      finalGrossOutputAmount,
      originalInputAmountForRateCalc,
      outputTokenDecimals
    );

    return {
      finalEffectiveExchangeRate,
      finalGrossOutputAmountDecimal,
      networkFeeUSD,
      outputTokenDecimals
    };
  } catch (error) {
    logger.error(`Error calculating EVM bridge and network fee: ${error instanceof Error ? error.message : String(error)}`);
    // We assume that the error is due to a low input amount
    throw new APIError({
      message: QuoteError.InputAmountTooLow,
      status: httpStatus.INTERNAL_SERVER_ERROR
    });
  }
}

export async function getEvmBridgeQuote(request: EvmBridgeQuoteRequest) {
  const routeParams = buildRouteRequest(request);
  return getSquidrouterRouteData(routeParams);
}
