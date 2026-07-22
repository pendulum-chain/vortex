import httpStatus from "http-status";
import { APIError } from "../../../../../errors/api-error";
import { validateOfframpQuote } from "../../../../transactions/offramp/common/validation";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import type { EvmOfframpSourceMetadata } from "./simulation";

export interface EvmOfframpSourceRegistrationInput extends Record<string, unknown> {
  walletAddress?: string;
}

export interface EvmOfframpSourceRegistrationFacts {
  userAddress: string;
}

export async function registerEvmOfframpSource(
  ctx: RegisterCtx<EvmOfframpSourceMetadata, EvmOfframpSourceRegistrationInput>
): Promise<RegistrationResult<EvmOfframpSourceRegistrationFacts, EvmOfframpSourceMetadata>> {
  if (!ctx.input.walletAddress) {
    throw new APIError({ message: "walletAddress is required for offramping", status: httpStatus.BAD_REQUEST });
  }
  validateOfframpQuote(ctx.quote as Parameters<typeof validateOfframpQuote>[0], [...ctx.signingAccounts], {
    requireSubstrateEphemeral: false
  });
  return { facts: { userAddress: ctx.input.walletAddress } };
}
