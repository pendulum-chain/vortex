import {
  ApiManager,
  EvmClientManager,
  EvmTokenDetails,
  getNablaBasePool,
  getTokenOutAmount,
  multiplyByPowerOfTen,
  Networks,
  PendulumTokenDetails,
  parseContractBalanceResponse,
  QuoteError,
  RampDirection,
  stringifyBigWithSignificantDecimals
} from "@vortexfi/shared";
import { Big } from "big.js";
import httpStatus from "http-status";
import logger from "../../../../config/logger";
import { APIError } from "../../../errors/api-error";
import { createLowLiquidityQuoteError, isLowLiquidityQuoteError } from "./errors";

export interface NablaSwapRequest {
  inputAmountForSwap: string;
  rampType: RampDirection;
  inputTokenPendulumDetails: PendulumTokenDetails;
  outputTokenPendulumDetails: PendulumTokenDetails;
}

export interface NablaSwapResult {
  nablaOutputAmountRaw: string;
  nablaOutputAmountDecimal: Big;
  effectiveExchangeRate?: string;
}

export interface NablaSwapEvmRequest {
  inputAmountForSwap: string;
  rampType: RampDirection;
  inputTokenDetails: EvmTokenDetails;
  outputTokenDetails: EvmTokenDetails;
}

export async function calculateNablaSwapOutput(request: NablaSwapRequest): Promise<NablaSwapResult> {
  const { inputAmountForSwap, inputTokenPendulumDetails, outputTokenPendulumDetails } = request;
  // Validate input amount
  if (!inputAmountForSwap || Big(inputAmountForSwap).lte(0)) {
    throw new APIError({
      message: QuoteError.InputAmountForSwapMustBeGreaterThanZero,
      status: httpStatus.BAD_REQUEST
    });
  }

  if (!inputTokenPendulumDetails || !outputTokenPendulumDetails) {
    throw new APIError({
      message: QuoteError.UnableToGetPendulumTokenDetails,
      status: httpStatus.BAD_REQUEST
    });
  }

  const isEVM = inputTokenPendulumDetails.erc20WrapperAddress.startsWith("0x");

  try {
    if (isEVM) {
      const evmClientManager = EvmClientManager.getInstance();
      const amountIn = multiplyByPowerOfTen(new Big(inputAmountForSwap), inputTokenPendulumDetails.decimals).toFixed(0, 0);

      const swapAbi = [
        {
          inputs: [
            { name: "_amountIn", type: "uint256" },
            { name: "_tokenInOut", type: "address[]" }
          ],
          name: "getAmountOut",
          outputs: [
            { name: "amountOut", type: "uint256" },
            { name: "feeAmount", type: "uint256" }
          ],
          stateMutability: "view",
          type: "function"
        }
      ];

      const inputAddr = inputTokenPendulumDetails.erc20WrapperAddress as `0x${string}`;
      const outputAddr = outputTokenPendulumDetails.erc20WrapperAddress as `0x${string}`;
      const { router } = getNablaBasePool(inputAddr, outputAddr);

      const result = await evmClientManager.readContractWithRetry<[bigint, bigint]>(Networks.Base, {
        abi: swapAbi,
        address: router,
        args: [BigInt(amountIn), [inputAddr, outputAddr]],
        functionName: "getAmountOut"
      });

      const preciseQuotedAmountOut = parseContractBalanceResponse(outputTokenPendulumDetails.decimals, result[0]);
      if (!preciseQuotedAmountOut) {
        throw new Error("Failed to parse quoted amount out");
      }

      return {
        effectiveExchangeRate: stringifyBigWithSignificantDecimals(
          preciseQuotedAmountOut.preciseBigDecimal.div(new Big(inputAmountForSwap)),
          4
        ),
        nablaOutputAmountDecimal: preciseQuotedAmountOut.preciseBigDecimal,
        nablaOutputAmountRaw: preciseQuotedAmountOut.rawBalance.toFixed()
      };
    } else {
      // Get API manager and Pendulum API
      const apiManager = ApiManager.getInstance();
      const pendulumApi = await apiManager.getApi("pendulum");

      // Perform the Nabla swap
      const swapResult = await getTokenOutAmount({
        api: pendulumApi.api,
        fromAmountString: inputAmountForSwap,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails
      });

      return {
        effectiveExchangeRate: swapResult.effectiveExchangeRate,
        nablaOutputAmountDecimal: swapResult.preciseQuotedAmountOut.preciseBigDecimal,
        nablaOutputAmountRaw: swapResult.preciseQuotedAmountOut.rawBalance.toFixed()
      };
    }
  } catch (error) {
    logger.error("Error calculating Nabla swap output:", error);
    if (isLowLiquidityQuoteError(error)) {
      throw createLowLiquidityQuoteError();
    }

    throw new APIError({
      message: QuoteError.FailedToCalculateQuote,
      status: httpStatus.INTERNAL_SERVER_ERROR
    });
  }
}

export async function calculateNablaSwapOutputEvm(request: NablaSwapEvmRequest): Promise<NablaSwapResult> {
  const { inputAmountForSwap, inputTokenDetails, outputTokenDetails } = request;
  // Validate input amount
  if (!inputAmountForSwap || Big(inputAmountForSwap).lte(0)) {
    throw new APIError({
      message: QuoteError.InputAmountForSwapMustBeGreaterThanZero,
      status: httpStatus.BAD_REQUEST
    });
  }

  if (!inputTokenDetails || !outputTokenDetails) {
    throw new APIError({
      message: QuoteError.UnableToGetPendulumTokenDetails,
      status: httpStatus.BAD_REQUEST
    });
  }

  try {
    const evmClientManager = EvmClientManager.getInstance();
    const amountIn = multiplyByPowerOfTen(new Big(inputAmountForSwap), inputTokenDetails.decimals).toFixed(0, 0);

    const swapAbi = [
      {
        inputs: [
          { name: "_amountIn", type: "uint256" },
          { name: "_tokenPath", type: "address[]" },
          { name: "_routerPath", type: "address[]" }
        ],
        name: "quoteSwapExactTokensForTokens",
        outputs: [{ name: "amountOut_", type: "uint256" }],
        stateMutability: "view",
        type: "function"
      }
    ];

    const inputAddr = inputTokenDetails.erc20AddressSourceChain as `0x${string}`;
    const outputAddr = outputTokenDetails.erc20AddressSourceChain as `0x${string}`;
    const { router, quoter } = getNablaBasePool(inputAddr, outputAddr);

    const result = await evmClientManager.readContractWithRetry<bigint>(Networks.Base, {
      abi: swapAbi,
      address: quoter,
      args: [BigInt(amountIn), [inputAddr, outputAddr], [router]],
      functionName: "quoteSwapExactTokensForTokens"
    });

    const preciseQuotedAmountOut = parseContractBalanceResponse(outputTokenDetails.decimals, result);
    if (!preciseQuotedAmountOut) {
      throw new Error("Failed to parse quoted amount out");
    }

    return {
      effectiveExchangeRate: stringifyBigWithSignificantDecimals(
        preciseQuotedAmountOut.preciseBigDecimal.div(new Big(inputAmountForSwap)),
        4
      ),
      nablaOutputAmountDecimal: preciseQuotedAmountOut.preciseBigDecimal,
      nablaOutputAmountRaw: preciseQuotedAmountOut.rawBalance.toFixed()
    };
  } catch (error) {
    logger.error("Error calculating EVM Nabla swap output:", error);
    if (isLowLiquidityQuoteError(error)) {
      throw createLowLiquidityQuoteError();
    }

    throw new APIError({
      message: QuoteError.FailedToCalculateQuote,
      status: httpStatus.INTERNAL_SERVER_ERROR
    });
  }
}
