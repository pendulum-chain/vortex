// PR1 scaffolding: Swap Engine (Stage)
// Purpose later: wrap calculateNablaSwapOutput from gross-output.ts.
// Current: no-op to avoid behavior changes.

import { QuoteContext, Stage, StageKey } from "../types";

export class SwapEngine implements Stage {
  readonly key = StageKey.Swap;

  async execute(ctx: QuoteContext): Promise<void> {
    // PR1: no-op; trace note only.
    ctx.addNote?.("SwapEngine: skipped (PR1 scaffold)");
    return;
  }
}
