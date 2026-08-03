import { resolveAveniaAccountForRamp } from "../../../../avenia-account";
import { createAveniaOnrampTicket } from "../../core/avenia-registration";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import type { AveniaMintMetadata } from "./simulation";

export interface AveniaMintRegistrationInput extends Record<string, unknown> {
  taxId?: string;
}

export interface AveniaMintRegistrationFacts {
  aveniaTicketId: string;
  taxId: string;
}

export interface AveniaMintResponseArtifacts extends Record<string, unknown> {
  depositQrCode: string;
}

interface AveniaMintRegistrationDependencies {
  createTicket: typeof createAveniaOnrampTicket;
  resolveAccount: typeof resolveAveniaAccountForRamp;
}

export function createRegisterAveniaMint(
  dependencies: AveniaMintRegistrationDependencies = {
    createTicket: createAveniaOnrampTicket,
    resolveAccount: resolveAveniaAccountForRamp
  }
) {
  return async function registerAveniaMint(
    ctx: RegisterCtx<AveniaMintMetadata, AveniaMintRegistrationInput>
  ): Promise<RegistrationResult<AveniaMintRegistrationFacts, AveniaMintMetadata>> {
    const aveniaAccount = await dependencies.resolveAccount(ctx.authenticatedUser.id, ctx.input.taxId);
    const ticket = await dependencies.createTicket(aveniaAccount.taxId, ctx.quote, ctx.quote.inputAmount);
    return {
      facts: { aveniaTicketId: ticket.aveniaTicketId, taxId: aveniaAccount.taxId },
      responseArtifacts: { depositQrCode: ticket.brCode } satisfies AveniaMintResponseArtifacts
    };
  };
}

export const registerAveniaMint = createRegisterAveniaMint();
