import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { AveniaMintMetadata } from "../avenia-mint/simulation";
import type { AveniaMoonbeamRegistrationFacts } from "./registration";

export async function prepareAveniaMoonbeamMintTxs(
  ctx: PrepareCtx<AveniaMintMetadata, AveniaMoonbeamRegistrationFacts>
): Promise<PreparedPhaseTxs> {
  const taxId = ctx.ownRegistrationFacts?.taxId;
  if (!taxId) throw new Error("AveniaMoonbeamMint requires registered Avenia facts");
  return { intents: [], state: { taxId } };
}
