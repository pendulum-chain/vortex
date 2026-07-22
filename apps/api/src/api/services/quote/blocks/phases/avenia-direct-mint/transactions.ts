import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { AveniaMintMetadata } from "../avenia-mint/simulation";

export async function prepareAveniaDirectMintTxs(ctx: PrepareCtx<AveniaMintMetadata>): Promise<PreparedPhaseTxs> {
  return { intents: [], state: { taxId: ctx.taxId } };
}
