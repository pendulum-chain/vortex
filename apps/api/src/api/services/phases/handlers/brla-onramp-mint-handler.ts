import {
  BalanceCheckError,
  BalanceCheckErrorType,
  checkEvmBalancePeriodically,
  FiatToken,
  getAnyFiatTokenDetailsMoonbeam,
  Networks,
  RampPhase
} from "@vortexfi/shared";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

// The rationale for these difference is that it allows for a finer check over the payment timeout in
// case of service restart. A smaller timeout for the balance check loop allows to get out to the outer
// process loop and check for the operation timestamp.
const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EVM_BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Phase description: wait for the tokens to arrive at the Moonbeam ephemeral address.
// If the timeout is reached, we assume the user has NOT made the payment and we cancel the ramp.
export class BrlaOnrampMintHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "brlaOnrampMint";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { evmEphemeralAddress } = state.state as StateMetadata;

    if (!evmEphemeralAddress) {
      throw new Error("BrlaOnrampMintHandler: State metadata corrupted. This is a bug.");
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (!quote.metadata.aveniaMint?.outputAmountRaw) {
      throw new Error("Missing expected amount to be received in Moonbeam in quote metadata");
    }

    const expectedAmountReceived = quote.metadata.aveniaMint?.outputAmountRaw;

    try {
      const pollingTimeMs = 1000;
      const tokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);

      await checkEvmBalancePeriodically(
        tokenDetails.moonbeamErc20Address,
        evmEphemeralAddress,
        expectedAmountReceived,
        pollingTimeMs,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        Networks.Moonbeam
      );
    } catch (error) {
      if (!(error instanceof BalanceCheckError)) throw error;

      const isCheckTimeout = error.type === BalanceCheckErrorType.Timeout;
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error("Payment timeout. Cancelling ramp.");
        return this.transitionToNextPhase(state, "failed");
      }

      throw isCheckTimeout
        ? this.createRecoverableError(`BrlaOnrampMintHandler: phase timeout reached with error: ${error}`)
        : new Error(`Error checking Moonbeam balance: ${error}`);
    }

    return this.transitionToNextPhase(state, "fundEphemeral");
  }

  protected isPaymentTimeoutReached(state: RampState): boolean {
    const thisPhaseEntry = state.phaseHistory.find(phaseHistoryEntry => phaseHistoryEntry.phase === this.getPhaseName());
    if (!thisPhaseEntry) {
      throw new Error("BrlaOnrampMintHandler: Phase not found in history. State corrupted.");
    }

    const initialTimestamp = new Date(thisPhaseEntry.timestamp);
    if (initialTimestamp.getTime() + PAYMENT_TIMEOUT_MS < Date.now()) {
      return true;
    }
    return false;
  }
}

export default new BrlaOnrampMintHandler();
