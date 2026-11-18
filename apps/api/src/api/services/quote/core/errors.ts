import { QuoteError } from "@vortexfi/shared";
import httpStatus from "http-status";
import { APIError } from "../../../errors/api-error";

const LOW_LIQUIDITY_ERROR_PATTERNS = [
  "low liquidity",
  "reduce swap amount",
  "insufficientliquidity",
  "exceeds_max_coverage_ratio",
  // A Nabla swap pool asked to pay out more than its reserve reverts with an arithmetic panic (0x11).
  "underflow or overflow"
];

export function isLowLiquidityQuoteError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const normalizedMessage = errorMessage.toLowerCase().replace(/\s+/g, "");

  return LOW_LIQUIDITY_ERROR_PATTERNS.some(pattern => normalizedMessage.includes(pattern.replace(/\s+/g, "")));
}

export function createLowLiquidityQuoteError(): APIError {
  return new APIError({
    isPublic: true,
    message: QuoteError.LowLiquidity,
    status: httpStatus.INTERNAL_SERVER_ERROR
  });
}
