import { EvmClientManager, MykoboApiService, MykoboTransactionStatus, Networks, type RampPhase } from "@vortexfi/shared";
import logger from "../../../../../../config/logger";
import RampState from "../../../../../../models/rampState.model";
import { PhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { ensurePresignedTransferFunded } from "../../../../phases/handlers/helpers";
import { getBlockState } from "../../core/metadata";
import type { MykoboOfframpPayoutRegistrationFacts } from "./registration";
import { MykoboOfframpPayoutContext } from "./simulation";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1_000;

export class MykoboOfframpPayoutExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "mykoboPayoutOnBase";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const facts = state.state.blockState?.[MykoboOfframpPayoutContext.key]
      ? getBlockState<MykoboOfframpPayoutRegistrationFacts>(state.state, MykoboOfframpPayoutContext)
      : this.legacyFacts(state);
    await this.sendPayout(state);
    await this.pollUntilCompleted(facts.mykoboTransactionId);
    return state;
  }

  private legacyFacts(state: RampState): MykoboOfframpPayoutRegistrationFacts {
    const { mykoboEmail, mykoboReceivablesAddress, mykoboTransactionId, mykoboTransactionReference } = state.state;
    if (!mykoboEmail || !mykoboReceivablesAddress || !mykoboTransactionId || !mykoboTransactionReference) {
      throw new Error("MykoboOfframpPayoutExecutor: Missing payout registration facts");
    }
    return { mykoboEmail, mykoboReceivablesAddress, mykoboTransactionId, mykoboTransactionReference };
  }

  private async sendPayout(state: RampState): Promise<void> {
    try {
      const manager = EvmClientManager.getInstance();
      const client = manager.getClient(Networks.Base);
      const transaction = this.getPresignedTransaction(state, "mykoboPayoutOnBase");
      if (!transaction || typeof transaction.txData !== "string") {
        throw new Error("MykoboOfframpPayoutExecutor: Missing presigned payout transaction");
      }
      if (state.state.mykoboPayoutTxHash) {
        const receipt = await client.waitForTransactionReceipt({ hash: state.state.mykoboPayoutTxHash });
        if (receipt.status === "success") return;
      } else {
        await ensurePresignedTransferFunded(transaction.txData as `0x${string}`, Networks.Base, this.getPhaseName());
      }
      const hash = (await manager.sendRawTransactionWithRetry(
        Networks.Base,
        transaction.txData as `0x${string}`
      )) as `0x${string}`;
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Mykobo payout transfer ${hash} failed`);
      await state.update({ state: { ...state.state, mykoboPayoutTxHash: hash } });
    } catch (error) {
      if (error instanceof PhaseError) throw error;
      logger.error("MykoboOfframpPayoutExecutor: Failed to send Mykobo payout transaction", error);
      throw this.createRecoverableError("Failed to send Mykobo payout transaction");
    }
  }

  private async pollUntilCompleted(transactionId: string): Promise<void> {
    const api = MykoboApiService.getInstance();
    const start = Date.now();
    let lastError: unknown;
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      try {
        const { transaction } = await api.getTransaction(transactionId);
        if (transaction.status === MykoboTransactionStatus.COMPLETED) return;
        if (
          transaction.status === MykoboTransactionStatus.FAILED ||
          transaction.status === MykoboTransactionStatus.CANCELLED ||
          transaction.status === MykoboTransactionStatus.EXPIRED
        ) {
          throw this.createUnrecoverableError(
            `MykoboOfframpPayoutExecutor: Mykobo transaction ${transactionId} ended with status ${transaction.status}`
          );
        }
      } catch (error) {
        if (error instanceof PhaseError) throw error;
        lastError = error;
        logger.warn("MykoboOfframpPayoutExecutor: Polling Mykobo transaction failed; retrying", error);
      }
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    if (lastError) {
      throw this.createRecoverableError(
        `MykoboOfframpPayoutExecutor: Polling timed out with transient error: ${(lastError as Error).message}`
      );
    }
    throw this.createRecoverableError("MykoboOfframpPayoutExecutor: Polling for Mykobo transaction status timed out");
  }
}
