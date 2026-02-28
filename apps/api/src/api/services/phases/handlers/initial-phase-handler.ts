import { FiatToken, RampDirection, RampPhase } from "@vortexfi/shared";
import logger from "../../../../config/logger";
import { SANDBOX_ENABLED } from "../../../../constants/constants";
import QuoteTicket from "../../../../models/quoteTicket.model";
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
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    logger.info(`Executing initial phase for ramp ${state.id}`);

    if (SANDBOX_ENABLED) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      return this.transitionToNextPhase(state, "complete");
    }

    if (state.type === RampDirection.BUY && quote.inputCurrency === FiatToken.BRL) {
      return this.transitionToNextPhase(state, "brlaOnrampMint");
    } else if (state.type === RampDirection.BUY && quote.inputCurrency === FiatToken.EURC) {
      return this.transitionToNextPhase(state, "moneriumOnrampMint");
    } else if (state.type === RampDirection.BUY && quote.inputCurrency === FiatToken.USD) {
      return this.transitionToNextPhase(state, "alfredpayOnrampMint");
    } else if (state.type === RampDirection.SELL && quote.outputCurrency === FiatToken.USD) {
      return this.transitionToNextPhase(state, "squidrouterPermitExecute");
    }

    return this.transitionToNextPhase(state, "fundEphemeral");
  }
}

export default new InitialPhaseHandler();
