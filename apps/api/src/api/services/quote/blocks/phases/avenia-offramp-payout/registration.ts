import { normalizeTaxId } from "@vortexfi/shared";
import httpStatus from "http-status";
import { APIError } from "../../../../../errors/api-error";
import { resolveAveniaAccountForRamp } from "../../../../avenia-account";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import type { AveniaOfframpPayoutMetadata } from "./simulation";

export interface AveniaOfframpPayoutRegistrationInput extends Record<string, unknown> {
  pixDestination?: string;
  receiverTaxId?: string;
  taxId?: string;
}

export interface AveniaOfframpPayoutRegistrationFacts {
  brlaEvmAddress: string;
  pixDestination: string;
  receiverTaxId: string;
  taxId: string;
}

export interface AveniaOfframpPayoutResponseArtifacts extends Record<string, unknown> {
  depositQrCode: string;
}

export async function registerAveniaOfframpPayout(
  ctx: RegisterCtx<AveniaOfframpPayoutMetadata, AveniaOfframpPayoutRegistrationInput>
): Promise<RegistrationResult<AveniaOfframpPayoutRegistrationFacts, AveniaOfframpPayoutMetadata>> {
  if (!ctx.input.pixDestination) {
    throw new APIError({ message: "pixDestination is required for offramp to BRL", status: httpStatus.BAD_REQUEST });
  }
  const aveniaAccount = await resolveAveniaAccountForRamp(ctx.authenticatedUser.id, ctx.input.taxId);
  const taxId = aveniaAccount.taxId;
  const receiverTaxId = normalizeTaxId(ctx.input.receiverTaxId || taxId);
  const { default: rampService } = await import("../../../../ramp/ramp.service");
  const subaccount = await rampService.validateBrlaOfframpRequest(
    taxId,
    ctx.input.pixDestination,
    receiverTaxId,
    ctx.quote.outputAmount
  );
  return {
    facts: {
      brlaEvmAddress: subaccount.wallets.evm,
      pixDestination: ctx.input.pixDestination,
      receiverTaxId,
      taxId
    },
    responseArtifacts: { depositQrCode: subaccount.brCode } satisfies AveniaOfframpPayoutResponseArtifacts
  };
}
