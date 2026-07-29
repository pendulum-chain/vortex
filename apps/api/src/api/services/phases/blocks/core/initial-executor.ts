import type { RampPhase } from "@vortexfi/shared";
import { config } from "../../../../../config/vars";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import type RampState from "../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../phases/base-phase-handler";

export class BlockInitialExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "initial";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }
    if (config.sandboxEnabled) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      return this.transitionToNextPhase(state, "complete");
    }
    return state;
  }
}
