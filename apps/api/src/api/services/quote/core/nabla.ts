import { ApiManager, getTokenOutAmount, PendulumTokenDetails, QuoteError, RampDirection, TokenOutData } from "@packages/shared";
import { ApiPromise } from "@polkadot/api";
import { Big } from "big.js";
import httpStatus from "http-status";
import logger from "../../../../config/logger";
import { APIError } from "../../../errors/api-error";

export interface NablaSwapRequest {
  inputAmountForSwap: string;
  rampType: RampDirection;
  inputTokenPendulumDetails: PendulumTokenDetails;
  outputTokenPendulumDetails: PendulumTokenDetails;
}

export interface NablaSwapResult {
  inputTokenPendulumDetails: PendulumTokenDetails;
  outputTokenPendulumDetails: PendulumTokenDetails;
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
  const { inputAmountForSwap, inputTokenPendulumDetails, outputTokenPendulumDetails } = request;
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
      inputTokenPendulumDetails,
      nablaOutputAmountDecimal: swapResult.preciseQuotedAmountOut.preciseBigDecimal,
      nablaOutputAmountRaw: swapResult.preciseQuotedAmountOut.rawBalance.toFixed(),
      outputTokenPendulumDetails
    };
  } catch (error) {
    logger.error("Error calculating Nabla swap output:", error);
    throw new APIError({
      message: QuoteError.FailedToCalculateQuote,
      status: httpStatus.INTERNAL_SERVER_ERROR
    });
  }
}
