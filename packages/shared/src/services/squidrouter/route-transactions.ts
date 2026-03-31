import { encodeFunctionData, PublicClient } from "viem";
import erc20ABI from "../../contracts/ERC20";
import { EvmTransactionData } from "../../index";
import logger from "../../logger";
import type { SquidrouterRoute } from "./route";

/**
 * Normalizes a numeric string to a format that BigInt can parse.
 * Handles scientific notation (e.g., "1.5e18") and decimal strings (e.g., "123.456")
 * by converting them to integer strings, truncating any fractional part.
 */
function normalizeBigIntString(value: string): string {
  if (!value || value === "") {
    return "0";
  }

  // If it's already a valid integer string (decimal or hex), return as-is
  if (/^-?\d+$/.test(value) || /^0x[0-9a-fA-F]+$/i.test(value)) {
    return value;
  }

  // Handle scientific notation and decimals by parsing as Number first, then converting
  // This will truncate any fractional part
  try {
    const num = Number(value);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
      logger.current.warn(`Invalid numeric value for BigInt conversion: ${value}, defaulting to 0`);
      return "0";
    }
    // Use BigInt on the truncated integer value to avoid precision issues with large numbers
    // For very large numbers, we need to handle them specially
    if (Math.abs(num) > Number.MAX_SAFE_INTEGER) {
      // For scientific notation with large exponents, parse manually
      const match = value.match(/^(-?\d+\.?\d*)[eE]([+-]?\d+)$/);
      if (match) {
        const [, mantissa, exponent] = match;
        const exp = parseInt(exponent, 10);
        const [intPart, decPart = ""] = mantissa.replace("-", "").split(".");
        const sign = mantissa.startsWith("-") ? "-" : "";
        const totalDigits = intPart + decPart;
        const zerosNeeded = exp - decPart.length;
        if (zerosNeeded >= 0) {
          return sign + totalDigits + "0".repeat(zerosNeeded);
        } else {
          // Truncate decimal part
          return sign + totalDigits.slice(0, totalDigits.length + zerosNeeded) || "0";
        }
      }
    }
    // For smaller numbers, Math.trunc works fine
    return BigInt(Math.trunc(num)).toString();
  } catch (e) {
    logger.current.warn(`Failed to normalize BigInt string: ${value}, error: ${e}`);
    return "0";
  }
}

export async function createTransactionDataFromRoute({
  route,
  rawAmount,
  inputTokenErc20Address,
  publicClient,
  swapValue,
  nonce
}: {
  route: SquidrouterRoute;
  rawAmount: string;
  inputTokenErc20Address: string;
  publicClient: PublicClient;
  swapValue?: string;
  nonce?: number;
}): Promise<{ approveData: EvmTransactionData; swapData: EvmTransactionData; squidRouterQuoteId?: string }> {
  const { transactionRequest } = route;

  const approveTransactionData = encodeFunctionData({
    abi: erc20ABI,
    args: [transactionRequest?.target, rawAmount],
    functionName: "approve"
  });

  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

  const approveData: EvmTransactionData = {
    data: approveTransactionData as `0x${string}`,
    gas: "150000",
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: (maxPriorityFeePerGas ?? maxFeePerGas).toString(),
    to: inputTokenErc20Address as `0x${string}`,
    value: "0"
  };

  if (nonce !== undefined) {
    approveData.nonce = nonce;
  }

  const swapData: EvmTransactionData = {
    data: transactionRequest.data as `0x${string}`,
    gas: normalizeBigIntString(transactionRequest.gasLimit),
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: (maxPriorityFeePerGas ?? maxFeePerGas).toString(),
    to: transactionRequest.target as `0x${string}`,
    value: normalizeBigIntString(swapValue ?? transactionRequest.value)
  };

  if (nonce !== undefined) {
    swapData.nonce = nonce + 1;
  }

  return {
    approveData,
    squidRouterQuoteId: route.quoteId,
    swapData
  };
}
