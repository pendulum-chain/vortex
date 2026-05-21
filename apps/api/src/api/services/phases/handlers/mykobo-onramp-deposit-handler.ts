import {
  BalanceCheckError,
  BalanceCheckErrorType,
  checkEvmBalancePeriodically,
  ERC20_EURC_BASE,
  RampPhase
} from "@vortexfi/shared";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { getMykoboTransaction, MYKOBO_BASE_NETWORK } from "../../mykobo";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;
const EVM_BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000;

// Mykobo transaction statuses that indicate the deposit will not arrive.
// Status strings observed in docs: PENDING_PAYER, PENDING_PAYEE, COMPLETED, REJECTED, EXPIRED, CANCELLED.
const TERMINAL_FAILURE_STATUSES = new Set(["REJECTED", "EXPIRED", "CANCELLED", "FAILED"]);

export class MykoboOnrampDepositPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "mykoboOnrampDeposit";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const meta = state.state as StateMetadata;
    const { mykoboWalletAddress: walletAddress, mykoboTransactionId: transactionId } = meta;
    if (!walletAddress) {
      throw new Error("MykoboOnrampDepositPhaseHandler: missing mykoboWalletAddress in state. This is a bug.");
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (!quote.metadata.mykoboMint?.outputAmountRaw) {
      throw new Error("MykoboOnrampDepositPhaseHandler: Missing mykoboMint metadata.");
    }

    const expectedAmountRaw = quote.metadata.mykoboMint.outputAmountRaw;

    if (transactionId) {
      try {
        const tx = await getMykoboTransaction(transactionId);
        if (TERMINAL_FAILURE_STATUSES.has(tx.status)) {
          logger.error(`Mykobo deposit ${transactionId} terminal status: ${tx.status}. Cancelling ramp.`);
          return this.transitionToNextPhase(state, "failed");
        }
      } catch (err) {
        // Transient Mykobo lookup error — fall through to on-chain balance check, retry next tick.
        logger.warn(`Mykobo transaction status lookup failed: ${err}`);
      }
    }

    try {
      await checkEvmBalancePeriodically(
        ERC20_EURC_BASE,
        walletAddress,
        expectedAmountRaw,
        1000,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        MYKOBO_BASE_NETWORK
      );

      // Settle delay: balance detection can fire before block finality. Wait 30 s so the
      // following permit + transferFrom phase reads a confirmed nonce/balance.
      await new Promise(resolve => setTimeout(resolve, 30000));
    } catch (error) {
      if (!(error instanceof BalanceCheckError)) throw error;

      const isCheckTimeout = error.type === BalanceCheckErrorType.Timeout;
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error("Mykobo payment timeout. Cancelling ramp.");
        return this.transitionToNextPhase(state, "failed");
      }

      throw isCheckTimeout
        ? this.createRecoverableError(`MykoboOnrampDepositPhaseHandler: ${error}`)
        : new Error(`Error checking Base balance: ${error}`);
    }

    return this.transitionToNextPhase(state, "mykoboOnrampTransfer");
  }

  protected isPaymentTimeoutReached(state: RampState): boolean {
    const thisPhaseEntry = state.phaseHistory.find(phaseHistoryEntry => phaseHistoryEntry.phase === this.getPhaseName());
    if (!thisPhaseEntry) {
      throw new Error("MykoboOnrampDepositPhaseHandler: Phase not found in history. State corrupted.");
    }

    const initialTimestamp = new Date(thisPhaseEntry.timestamp);
    return initialTimestamp.getTime() + PAYMENT_TIMEOUT_MS < Date.now();
  }
}

export default new MykoboOnrampDepositPhaseHandler();
