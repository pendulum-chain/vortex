import type { RegisterCtx, RegistrationResult } from "../../core/types";
import type { AveniaMintMetadata } from "../avenia-mint/simulation";

export interface AveniaMoonbeamRegistrationInput extends Record<string, unknown> {
  taxId?: string;
}

export interface AveniaMoonbeamRegistrationFacts {
  aveniaTicketId: string;
  taxId: string;
}

export interface AveniaMoonbeamResponseArtifacts extends Record<string, unknown> {
  depositQrCode: string;
}

export async function registerAveniaMoonbeamMint(
  ctx: RegisterCtx<AveniaMintMetadata, AveniaMoonbeamRegistrationInput>
): Promise<RegistrationResult<AveniaMoonbeamRegistrationFacts, AveniaMintMetadata>> {
  const { resolveAveniaAccountForRamp } = await import("../../../../avenia-account");
  const aveniaAccount = await resolveAveniaAccountForRamp(ctx.authenticatedUser.id, ctx.input.taxId);
  const { default: rampService } = await import("../../../../ramp/ramp.service");
  const ticket = await rampService.validateBrlaOnrampRequest(aveniaAccount.taxId, ctx.quote as never, ctx.quote.inputAmount);
  return {
    facts: { aveniaTicketId: ticket.aveniaTicketId, taxId: aveniaAccount.taxId },
    responseArtifacts: { depositQrCode: ticket.brCode } satisfies AveniaMoonbeamResponseArtifacts
  };
}
