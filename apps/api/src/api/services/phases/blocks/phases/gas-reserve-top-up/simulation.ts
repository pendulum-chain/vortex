import type { Networks } from "@vortexfi/shared";
import httpStatus from "http-status";
import { APIError } from "../../../../../errors/api-error";
import { defineContext } from "../../core/metadata";
import type { StockSymbol } from "../../core/robinhood-stocks";
import type { PhaseCtx, PhaseIO, PhaseResult, RegisterCtx, RegistrationResult } from "../../core/types";

export interface GasReserveTopUpMetadata {
  amountRaw: string;
  quotedFor?: string;
}

export const GasReserveTopUpContext = defineContext<GasReserveTopUpMetadata>()("gasReserveTopUp");

export interface GasReserveTopUpRegistrationInput extends Record<string, unknown> {
  destinationAddress?: string;
}

/** Nothing to carry between `register` and the executor. */
export type GasReserveTopUpRegistrationFacts = Record<string, never>;

/** Pass-through. A `register` hook only sees its own block, so this keeps what `AveniaStockMint` quoted. */
export async function simulateGasReserveTopUp<Token extends StockSymbol>(
  input: PhaseIO<Token, typeof Networks.Robinhood>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<Token, typeof Networks.Robinhood>, GasReserveTopUpMetadata>> {
  const { amountRaw = "0", quotedFor } = ctx.gasReserve ?? {};
  return { metadata: { amountRaw, ...(quotedFor ? { quotedFor } : {}) }, output: input };
}

/** A reserve sized for one wallet's balance is meaningless for another. */
export async function registerGasReserveTopUp(
  ctx: RegisterCtx<GasReserveTopUpMetadata, GasReserveTopUpRegistrationInput>
): Promise<RegistrationResult<GasReserveTopUpRegistrationFacts, GasReserveTopUpMetadata>> {
  const { quotedFor } = ctx.metadata;
  if (quotedFor && quotedFor.toLowerCase() !== ctx.input.destinationAddress?.toLowerCase()) {
    throw new APIError({
      isPublic: true,
      message: "This quote was created for a different destination address. Please request a new quote.",
      status: httpStatus.BAD_REQUEST
    });
  }
  return { facts: {} };
}
