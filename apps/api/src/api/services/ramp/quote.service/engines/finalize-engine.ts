// PR1 scaffolding: Finalize Engine (Stage)
// Purpose later: compute final net output, run min/max checks, and prepare amounts for persistence.
// Current: no-op to avoid behavior changes.

import { QuoteContext, Stage, StageKey } from "../types";

export class FinalizeEngine implements Stage {
  readonly key = StageKey.Finalize;

  async execute(ctx: QuoteContext): Promise<void> {
    // PR1: no-op; trace note only.
    ctx.addNote?.("FinalizeEngine: skipped (PR1 scaffold)");
    return;
  }
}
