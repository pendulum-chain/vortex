import { HORIZON_URL, RampPhase } from "@packages/shared";
import { Horizon, NetworkError, Networks, Transaction } from "stellar-sdk";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";

/**
 * Handler for the initial phase
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
    logger.info(`Executing initial phase for ramp ${state.id}`);

    // Check if signed_transactions are present for offramps. If they are not, return early.
    if (state.type === "off") {
      if (state.presignedTxs === null || state.presignedTxs.length === 0) {
        throw new Error("InitialPhaseHandler: No signed transactions found. Cannot proceed.");
      } else if (state.from === "assethub" && !state.state.assetHubToPendulumHash) {
        throw new Error("InitialPhaseHandler: Missing required additional data for offramps. Cannot proceed.");
      } else if (state.from !== "assethub" && !state.state.squidRouterSwapHash) {
        throw new Error("InitialPhaseHandler: Missing required additional data for offramps. Cannot proceed.");
      }
    }

    if (state.type === "on") {
      return this.transitionToNextPhase(state, "brlaTeleport");
    }

    return this.transitionToNextPhase(state, "fundEphemeral");
  }
}

export default new InitialPhaseHandler();
