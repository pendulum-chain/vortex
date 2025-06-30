import { FiatToken, getAnyFiatTokenDetailsMoonbeam, RampPhase } from "@packages/shared";

import { polygon } from "viem/chains";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { BalanceCheckError, BalanceCheckErrorType, checkEvmBalancePeriodically } from "../../moonbeam/balance";
import { ERC20_EURE_POLYGON } from "../../transactions/moneriumEvmOnrampTransactions";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

// Same rationale as in brla-teleport-handler.ts
const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EVM_BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class MoneriumOnrampMintPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "moneriumOnrampMint";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { inputAmountUnits, walletAddress, inputAmountBeforeSwapRaw } = state.state as StateMetadata;

    if (!inputAmountUnits || !walletAddress || !inputAmountBeforeSwapRaw) {
      throw new Error("MoneriumOnrampMintPhaseHandler: State metadata corrupted. This is a bug.");
    }
    try {
      const pollingTimeMs = 1000;

      await checkEvmBalancePeriodically(
        ERC20_EURE_POLYGON,
        walletAddress,
        inputAmountBeforeSwapRaw,
        pollingTimeMs,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        polygon
      );

      // Add delay to ensure the transaction is settled
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds.
    } catch (error) {
      if (!(error instanceof BalanceCheckError)) throw error;

      const isCheckTimeout = error.type === BalanceCheckErrorType.Timeout;
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error("Payment timeout. Cancelling ramp.");

        return this.transitionToNextPhase(state, "failed");
      }

      throw isCheckTimeout
        ? this.createRecoverableError(`MoneriumOnrampMintPhaseHandler: ${error}`)
        : new Error(`Error checking Moonbeam balance: ${error}`);
    }

    return this.transitionToNextPhase(state, "fundEphemeral");
  }

  protected isPaymentTimeoutReached(state: RampState): boolean {
    const thisPhaseEntry = state.phaseHistory.find(phaseHistoryEntry => phaseHistoryEntry.phase === this.getPhaseName());
    if (!thisPhaseEntry) {
      throw new Error("MoneriumOnrampMintPhaseHandler: Phase not found in history. State corrupted.");
    }

    const initialTimestamp = new Date(thisPhaseEntry.timestamp);
    if (initialTimestamp.getTime() + PAYMENT_TIMEOUT_MS < Date.now()) {
      return true;
    }
    return false;
  }
}

export default new MoneriumOnrampMintPhaseHandler();
