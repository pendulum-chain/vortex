// PR1 scaffolding: Bridge Engine (Stage)
// Purpose later: wrap calculateEvmBridgeAndNetworkFee and getEvmBridgeQuote from gross-output.ts.
// Current: no-op to avoid behavior changes.

import { QuoteContext, Stage, StageKey } from "../types";

export class BridgeEngine implements Stage {
  readonly key = StageKey.Bridge;

  async execute(ctx: QuoteContext): Promise<void> {
    // PR1: no-op; trace note only.
    ctx.addNote?.("BridgeEngine: skipped (PR1 scaffold)");
    return;
  }
}
