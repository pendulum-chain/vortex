// PR1 scaffolding: Fee Engine (Stage)
// Purpose later: wrap calculateFeeComponents and normalize fee currency conversions.
// Current: no-op to avoid behavior changes.

import { QuoteContext, Stage, StageKey } from "../types";

export class FeeEngine implements Stage {
  readonly key = StageKey.Fee;

  async execute(ctx: QuoteContext): Promise<void> {
    // PR1: no-op; trace note only.
    ctx.addNote?.("FeeEngine: skipped (PR1 scaffold)");
    return;
  }
}
