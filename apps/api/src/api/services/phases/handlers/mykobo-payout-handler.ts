import { EvmClientManager, MykoboApiService, MykoboTransactionStatus, Networks, RampPhase } from "@vortexfi/shared";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { PhaseError } from "../../../errors/phase-error";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";
import { ensurePresignedTransferFunded } from "./helpers";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export class MykoboPayoutOnBasePhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "mykoboPayoutOnBase";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { mykoboTransactionId, mykoboPayoutTxHash } = state.state as StateMetadata;

    if (!mykoboTransactionId) {
      throw new Error("MykoboPayoutOnBasePhaseHandler: mykoboTransactionId missing in state. This is a bug.");
    }

    await this.sendMykoboPayoutTransaction(state, mykoboPayoutTxHash);
    await this.pollMykoboUntilCompleted(mykoboTransactionId);

    return state;
  }

  private async sendMykoboPayoutTransaction(state: RampState, mykoboPayoutTxHash?: `0x${string}`): Promise<void> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const baseClient = evmClientManager.getClient(Networks.Base);
      const { txData: payoutTx } = this.getPresignedTransaction(state, "mykoboPayoutOnBase");

      if (!payoutTx) {
        throw new Error("Missing presigned transaction for mykoboPayoutOnBase");
      }

      if (mykoboPayoutTxHash) {
        logger.info(`MykoboPayoutOnBasePhaseHandler: Found existing tx ${mykoboPayoutTxHash}. Waiting for receipt...`);
        const receipt = await baseClient.waitForTransactionReceipt({ hash: mykoboPayoutTxHash });
        if (receipt.status === "success") {
          logger.info(`MykoboPayoutOnBasePhaseHandler: Existing tx ${mykoboPayoutTxHash} succeeded.`);
          return;
        }
        logger.warn(`MykoboPayoutOnBasePhaseHandler: Existing tx ${mykoboPayoutTxHash} failed. Re-sending.`);
      }

      // The presigned payout is single-use (fixed nonce, consumed even on revert); confirm the
      // ephemeral can cover it before broadcasting.
      try {
        await ensurePresignedTransferFunded(payoutTx as `0x${string}`, Networks.Base, this.getPhaseName());
      } catch (error) {
        throw this.createRecoverableError(
          `MykoboPayoutOnBasePhaseHandler: ephemeral balance does not cover the presigned payout: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const txHash = (await evmClientManager.sendRawTransactionWithRetry(
        Networks.Base,
        payoutTx as `0x${string}`
      )) as `0x${string}`;
      logger.info(`MykoboPayoutOnBasePhaseHandler: Sent EURC transfer tx ${txHash}. Waiting for receipt...`);

      const receipt = await baseClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new Error(`Transaction ${txHash} failed on chain`);
      }

      await state.update({
        state: {
          ...state.state,
          mykoboPayoutTxHash: txHash
        }
      });
      logger.info(`MykoboPayoutOnBasePhaseHandler: Transaction ${txHash} confirmed.`);
    } catch (error) {
      if (error instanceof PhaseError) throw error;
      logger.error("MykoboPayoutOnBasePhaseHandler: Failed to send Mykobo payout tx.", error);
      throw this.createRecoverableError("Failed to send Mykobo payout transaction");
    }
  }

  private async pollMykoboUntilCompleted(transactionId: string): Promise<void> {
    const mykobo = MykoboApiService.getInstance();
    const startTime = Date.now();
    let lastError: unknown;

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      try {
        const { transaction } = await mykobo.getTransaction(transactionId);
        logger.debug(`MykoboPayoutOnBasePhaseHandler: tx ${transactionId} status=${transaction.status}`);

        if (transaction.status === MykoboTransactionStatus.COMPLETED) {
          return;
        }
        if (
          transaction.status === MykoboTransactionStatus.FAILED ||
          transaction.status === MykoboTransactionStatus.CANCELLED ||
          transaction.status === MykoboTransactionStatus.EXPIRED
        ) {
          throw this.createUnrecoverableError(
            `MykoboPayoutOnBasePhaseHandler: Mykobo transaction ${transactionId} ended with status ${transaction.status}`
          );
        }
      } catch (error) {
        if (error instanceof PhaseError) throw error;
        lastError = error;
        logger.warn("MykoboPayoutOnBasePhaseHandler: Polling Mykobo transaction failed. Retrying...", error);
      }
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    if (lastError) {
      throw this.createRecoverableError(
        `MykoboPayoutOnBasePhaseHandler: Polling timed out with transient error: ${(lastError as Error).message}`
      );
    }
    throw this.createRecoverableError("MykoboPayoutOnBasePhaseHandler: Polling for Mykobo transaction status timed out.");
  }
}

export default new MykoboPayoutOnBasePhaseHandler();
