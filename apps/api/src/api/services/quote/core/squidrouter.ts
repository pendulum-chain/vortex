import {
  createGenericRouteParams,
  createRouteParamsWithMoonbeamPostHook,
  DestinationType,
  EvmToken,
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
  SquidrouterCachedRoute,
  SquidrouterRoute,
  stringifyBigWithSignificantDecimals
} from "@vortexfi/shared";
import { Big } from "big.js";
import httpStatus from "http-status";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
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
 * Returns the token details that SquidRouter should deliver on the destination
 * chain for a given (outputCurrency, toNetwork).
 */
export function getBridgeTargetTokenDetails(outputCurrency: OnChainToken, toNetwork: Networks): EvmTokenDetails {
  return getTokenDetailsForEvmDestination(outputCurrency, toNetwork);
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

  const placeholderAddress = privateKeyToAddress(generatePrivateKey());
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

// Squid swap gas is paid in the source chain's native token. The CoinGecko ID
// depends on the source network — using GLMR for everything would severely
// under-report the fee for non-Moonbeam routes (e.g. ETH on Base is ~30,000x
// more expensive than GLMR).
function getNativeTokenCoingeckoId(network: Networks): string {
  switch (network) {
    case Networks.Base:
    case Networks.Arbitrum:
    case Networks.Ethereum:
    case Networks.BaseSepolia:
      return "ethereum";
    case Networks.Polygon:
    case Networks.PolygonAmoy:
      return "polygon-ecosystem-token";
    case Networks.Avalanche:
      return "avalanche-2";
    case Networks.BSC:
      return "binancecoin";
    case Networks.Moonbeam:
      return "moonbeam";
    default:
      return "moonbeam";
  }
}

async function calculateSquidrouterNetworkFee(
  route: SquidrouterRoute | SquidrouterCachedRoute,
  fromNetwork: Networks
): Promise<string> {
  const squidRouterSwapValue = multiplyByPowerOfTen(Big(route.transactionRequest.value), -18);
  const nativeTokenId = getNativeTokenCoingeckoId(fromNetwork);

  try {
    const nativePriceUSD = await priceFeedService.getCryptoPrice(nativeTokenId, "usd");
    const squidFeeUSD = squidRouterSwapValue.mul(nativePriceUSD).toFixed(6);
    logger.debug(`Network fee calculated using ${nativeTokenId} price: $${nativePriceUSD}, fee: $${squidFeeUSD}`);
    return squidFeeUSD;
  } catch (error) {
    logger.error(
      `Failed to get ${nativeTokenId} price, using fallback: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    // Conservative per-chain fallback so we never silently report ~$0 for ETH-priced chains.
    const fallbackPriceUSD = nativeTokenId === "ethereum" ? 2500 : nativeTokenId === "polygon-ecosystem-token" ? 0.5 : 0.08;
    const squidFeeUSD = squidRouterSwapValue.mul(fallbackPriceUSD).toFixed(6);
    logger.warn(`Using fallback ${nativeTokenId} price: $${fallbackPriceUSD}, fee: $${squidFeeUSD}`);
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
  const outputTokenDetails = getBridgeTargetTokenDetails(request.outputCurrency, request.toNetwork);
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

async function getSquidrouterRouteData(routeParams: RouteParams, fromNetwork: Networks) {
  const routeResult = await getRoute(routeParams, { useCache: true });

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
  const networkFeeUSD = await calculateSquidrouterNetworkFee(routeData.route, fromNetwork);

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
    const { networkFeeUSD, routeData, outputTokenDecimals } = await getSquidrouterRouteData(routeParams, fromNetwork);

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error calculating EVM bridge and network fee: ${errorMessage}`);

    // Check for specific SquidRouter error types
    if (errorMessage.toLowerCase().includes("low liquidity") || errorMessage.toLowerCase().includes("reduce swap amount")) {
      throw new APIError({
        message: QuoteError.LowLiquidity,
        status: httpStatus.BAD_REQUEST
      });
    }

    // Default to generic error for other cases
    throw new APIError({
      message: QuoteError.InputAmountTooLow,
      status: httpStatus.BAD_REQUEST
    });
  }
}

export async function getEvmBridgeQuote(request: EvmBridgeQuoteRequest) {
  const routeParams = buildRouteRequest(request);
  return getSquidrouterRouteData(routeParams, request.fromNetwork);
}
