import { RampPhase } from "@vortexfi/shared";
import logger from "../../../../config/logger";
import { config } from "../../../../config/vars";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";

/**
 * Handler for the initial phase.
 * Routing is handled by the PhaseProcessor via phaseFlow.
 * This handler only performs setup and sandbox short-circuiting.
 */
export class InitialPhaseHandler extends BasePhaseHandler {
  /**
   * Get the phase name
   */
  public getPhaseName(): RampPhase {
    return "initial";
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    logger.info(`Executing initial phase for ramp ${state.id}`);

    if (config.sandboxEnabled) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      return this.transitionToNextPhase(state, "complete");
    }

    return state;
  }
}

export default new InitialPhaseHandler();
