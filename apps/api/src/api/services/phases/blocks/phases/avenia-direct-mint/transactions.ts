import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { AveniaMintRegistrationFacts } from "../avenia-mint/registration";
import type { AveniaMintMetadata } from "../avenia-mint/simulation";

export async function prepareAveniaDirectMintTxs(
  ctx: PrepareCtx<AveniaMintMetadata, AveniaMintRegistrationFacts>
): Promise<PreparedPhaseTxs> {
  if (!ctx.ownRegistrationFacts) throw new Error("AveniaDirectMint requires registered Avenia facts");
  return { intents: [], state: { ...ctx.ownRegistrationFacts } };
}
