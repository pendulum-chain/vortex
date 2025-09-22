// PR1 scaffolding: Input Planner Engine (Stage)
// Purpose: in later PRs, compute pre-Nabla deductible fees and inputAmountForSwap.
// Current: no-op to avoid behavior changes.

import { QuoteContext, Stage, StageKey } from "../types";

export class InputPlannerEngine implements Stage {
  readonly key = StageKey.InputPlanner;

  async execute(ctx: QuoteContext): Promise<void> {
    // PR1: no-op; add a trace note for future debugging.
    ctx.addNote?.("InputPlannerEngine: skipped (PR1 scaffold)");
    return;
  }
}
