import httpStatus from "http-status";
import { isAddress } from "viem";
import { APIError } from "../../../../../errors/api-error";
import { validateOfframpQuote } from "../../core/offramp-validation";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import type { StockPermitSourceMetadata } from "./simulation";

export interface StockPermitSourceRegistrationInput extends Record<string, unknown> {
  walletAddress?: string;
}

export interface StockPermitSourceRegistrationFacts {
  owner: string;
}

export async function registerStockPermitSource(
  ctx: RegisterCtx<StockPermitSourceMetadata, StockPermitSourceRegistrationInput>
): Promise<RegistrationResult<StockPermitSourceRegistrationFacts, StockPermitSourceMetadata>> {
  const { walletAddress } = ctx.input;
  if (!walletAddress) {
    throw new APIError({ message: "walletAddress is required for offramping", status: httpStatus.BAD_REQUEST });
  }
  if (!isAddress(walletAddress, { strict: false })) {
    throw new APIError({ message: "walletAddress is not a valid EVM address", status: httpStatus.BAD_REQUEST });
  }
  validateOfframpQuote(ctx.quote as Parameters<typeof validateOfframpQuote>[0], [...ctx.signingAccounts], {
    requireSubstrateEphemeral: false
  });
  return { facts: { owner: walletAddress } };
}
