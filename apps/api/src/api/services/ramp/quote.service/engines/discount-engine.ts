// PR1 scaffolding: Discount Engine (Stage)
// Purpose later: compute partner discount subsidy and adjust net outputs accordingly.
// Current: no-op to avoid behavior changes.

import { QuoteContext, Stage, StageKey } from "../types";

export class DiscountEngine implements Stage {
  readonly key = StageKey.Discount;

  async execute(ctx: QuoteContext): Promise<void> {
    // PR1: no-op; trace note only.
    ctx.addNote?.("DiscountEngine: skipped (PR1 scaffold)");
    return;
  }
}
