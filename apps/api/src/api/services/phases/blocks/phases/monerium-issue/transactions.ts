import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { MoneriumIssueRegistrationFacts } from "./registration";
import type { MoneriumIssueMetadata } from "./simulation";

export async function prepareMoneriumIssueTxs(
  ctx: PrepareCtx<MoneriumIssueMetadata, MoneriumIssueRegistrationFacts>
): Promise<PreparedPhaseTxs> {
  if (!ctx.ownRegistrationFacts) {
    throw new Error("prepareMoneriumIssueTxs: Missing Monerium registration facts");
  }
  return { intents: [], state: { ...ctx.ownRegistrationFacts } };
}
