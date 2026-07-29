import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { AveniaMintRegistrationFacts } from "../avenia-mint/registration";
import type { AveniaMintMetadata } from "../avenia-mint/simulation";

export async function prepareAveniaMoonbeamMintTxs(
  ctx: PrepareCtx<AveniaMintMetadata, AveniaMintRegistrationFacts>
): Promise<PreparedPhaseTxs> {
  const taxId = ctx.ownRegistrationFacts?.taxId;
  if (!taxId) throw new Error("AveniaMoonbeamMint requires registered Avenia facts");
  return { intents: [], state: { taxId } };
}
