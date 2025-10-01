import {
  ApiManager,
  DestinationType,
  getNetworkFromDestination,
  getPendulumDetails,
  getTokenOutAmount,
  PendulumTokenDetails,
  QuoteError,
  RampCurrency,
  RampDirection,
  TokenOutData
} from "@packages/shared";
import { ApiPromise } from "@polkadot/api";
import { Big } from "big.js";
import httpStatus from "http-status";
import logger from "../../../../config/logger";
import { APIError } from "../../../errors/api-error";

export interface NablaSwapRequest {
  inputAmountForSwap: string;
  inputCurrency: RampCurrency;
  nablaOutputCurrency: RampCurrency;
  rampType: RampDirection;
  fromPolkadotDestination: DestinationType;
  toPolkadotDestination: DestinationType;
}

export interface NablaSwapResult {
  nablaOutputAmountRaw: string;
  nablaOutputAmountDecimal: Big;
  effectiveExchangeRate?: string;
}

async function getNablaSwapOutAmount(
  apiInstance: { api: ApiPromise },
  fromAmountString: string,
  inputTokenPendulumDetails: PendulumTokenDetails,
  outputTokenPendulumDetails: PendulumTokenDetails
): Promise<TokenOutData> {
  return await getTokenOutAmount({
    api: apiInstance.api,
    fromAmountString,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails
  });
}

/**
 * Performs the initial Nabla swap on Pendulum
 */
export async function calculateNablaSwapOutput(request: NablaSwapRequest): Promise<NablaSwapResult> {
  const { inputAmountForSwap, inputCurrency, nablaOutputCurrency, rampType, fromPolkadotDestination, toPolkadotDestination } =
    request;
  // Validate input amount
  if (!inputAmountForSwap || Big(inputAmountForSwap).lte(0)) {
    throw new APIError({
      message: QuoteError.InputAmountForSwapMustBeGreaterThanZero,
      status: httpStatus.BAD_REQUEST
    });
  }

  try {
    // Get API manager and Pendulum API
    const apiManager = ApiManager.getInstance();
    const pendulumApi = await apiManager.getApi("pendulum");

    // Get token details for Pendulum
    const inputTokenPendulumDetails =
      rampType === RampDirection.BUY
        ? getPendulumDetails(inputCurrency)
        : getPendulumDetails(inputCurrency, getNetworkFromDestination(fromPolkadotDestination));

    const outputTokenPendulumDetails =
      rampType === RampDirection.BUY
        ? getPendulumDetails(nablaOutputCurrency, getNetworkFromDestination(toPolkadotDestination))
        : getPendulumDetails(nablaOutputCurrency);

    if (!inputTokenPendulumDetails || !outputTokenPendulumDetails) {
      throw new APIError({
        message: QuoteError.UnableToGetPendulumTokenDetails,
        status: httpStatus.BAD_REQUEST
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
      effectiveExchangeRate: swapResult.effectiveExchangeRate,
      nablaOutputAmountDecimal: swapResult.preciseQuotedAmountOut.preciseBigDecimal,
      nablaOutputAmountRaw: swapResult.preciseQuotedAmountOut.rawBalance.toFixed()
    };
  } catch (error) {
    logger.error("Error calculating Nabla swap output:", error);
    throw new APIError({
      message: QuoteError.FailedToCalculateQuote,
      status: httpStatus.INTERNAL_SERVER_ERROR
    });
  }
}
