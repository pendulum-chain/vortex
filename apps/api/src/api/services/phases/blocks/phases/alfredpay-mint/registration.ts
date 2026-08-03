import { type AlfredpayFiatCurrency } from "@vortexfi/shared";
import { resolveAlfredpayCustomerId } from "../../../../quote/alfredpay-customer";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import type { AlfredpayMintMetadata } from "./simulation";

export type AlfredpayMintRegistrationFacts = { userId: string };

export async function registerAlfredpayMint(
  ctx: RegisterCtx<AlfredpayMintMetadata>,
  dependencies: { resolveCustomerId?: typeof resolveAlfredpayCustomerId } = {}
): Promise<RegistrationResult<AlfredpayMintRegistrationFacts, AlfredpayMintMetadata>> {
  const userId = await (dependencies.resolveCustomerId ?? resolveAlfredpayCustomerId)(
    ctx.metadata.currency as unknown as AlfredpayFiatCurrency,
    ctx.authenticatedUser.id
  );
  return { facts: { userId } };
}
