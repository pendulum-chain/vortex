import { FiatToken, isAlfredpayToken, RampDirection, RampPhase } from "@vortexfi/shared";
import logger from "../../../../config/logger";
import { SANDBOX_ENABLED } from "../../../../constants/constants";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { isBaseEvmNetwork } from "../../mykobo";
import { BasePhaseHandler } from "../base-phase-handler";

const resolveFirstPhase = (state: RampState, quote: QuoteTicket): RampPhase => {
  const isBuy = state.type === RampDirection.BUY;
  const isSell = state.type === RampDirection.SELL;
  const inputFiat = quote.inputCurrency as FiatToken;
  const outputFiat = quote.outputCurrency as FiatToken;

  if (isBuy && inputFiat === FiatToken.BRL) return "brlaOnrampMint";
  if (isBuy && inputFiat === FiatToken.EURC) {
    return isBaseEvmNetwork(quote.to) ? "mykoboOnrampDeposit" : "moneriumOnrampMint";
  }
  if (isBuy && isAlfredpayToken(inputFiat)) return "alfredpayOnrampMint";
  if (isSell && isAlfredpayToken(outputFiat)) return "squidRouterPermitExecute";
  return "fundEphemeral";
};

/**
 * Handler for the initial phase
 */
export class InitialPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "initial";
  }

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

    return this.transitionToNextPhase(state, resolveFirstPhase(state, quote));
  }
}

export default new InitialPhaseHandler();
