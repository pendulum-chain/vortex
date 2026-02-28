import {
  AlfredpayApiService,
  AlfredpayOfframpStatus,
  EvmClientManager,
  EvmNetworks,
  Networks,
  RampPhase
} from "@vortexfi/shared";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

const ALFREDPAY_POLL_INTERVAL_MS = 5000;
const ALFREDPAY_OFFRAMP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export class AlfredpayOfframpTransferHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "alfredpayOfframpTransfer";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { alfredpayTransactionId, alfredpayOfframpTransferTxHash } = state.state as StateMetadata;

    if (!alfredpayTransactionId) {
      throw new Error("AlfredpayOfframpTransferHandler: Missing alfredpayTransactionId in state.");
    }

    const alfredpayApiService = AlfredpayApiService.getInstance();
    const evmClientManager = EvmClientManager.getInstance();

    const alfredpayTx = await alfredpayApiService.getOfframpTransaction(alfredpayTransactionId);
    if (!alfredpayTx) {
      throw new Error(`AlfredpayOfframpTransferHandler: Transaction ${alfredpayTransactionId} not found in Alfredpay.`);
    }

    const expirationDate = new Date(alfredpayTx.expiration);
    if (expirationDate < new Date()) {
      logger.error(`AlfredpayOfframpTransferHandler: Alfredpay transaction ${alfredpayTransactionId} has expired.`);
      return this.transitionToNextPhase(state, "failed");
    }

    if (!alfredpayOfframpTransferTxHash) {
      logger.info(`AlfredpayOfframpTransferHandler: Executing final transfer for Alfredpay offramp ${alfredpayTransactionId}`);

      const { txData: offrampTransfer } = this.getPresignedTransaction(state, "alfredpayOfframpTransfer");

      const txHash = await evmClientManager.sendRawTransactionWithRetry(
        Networks.Polygon as EvmNetworks,
        offrampTransfer as `0x${string}`
      );

      await state.update({
        state: {
          ...state.state,
          alfredpayOfframpTransferTxHash: txHash
        }
      });

      logger.info(`AlfredpayOfframpTransferHandler: Final transfer sent. Hash: ${txHash}`);
    } else {
      try {
        const client = evmClientManager.getClient(Networks.Polygon as EvmNetworks);
        const receipt = await client.getTransactionReceipt({ hash: alfredpayOfframpTransferTxHash as `0x${string}` });
        if (receipt.status !== "success") {
          throw new Error(
            `AlfredpayOfframpTransferHandler: Final transfer transaction ${alfredpayOfframpTransferTxHash} failed on chain.`
          );
        }
      } catch (error: any) {
        if (error?.name !== "TransactionReceiptNotFoundError") {
          throw error;
        }
      }
    }

    try {
      await this.pollAlfredpayOfframpStatus(alfredpayTransactionId, ALFREDPAY_POLL_INTERVAL_MS);
    } catch (error: any) {
      if (error?.kind === "failed") {
        logger.error(`AlfredpayOfframpTransferHandler: Alfredpay offramp FAILED. Reason: ${error.failureReason ?? "unknown"}`);
        return this.transitionToNextPhase(state, "failed");
      }

      throw this.createRecoverableError(
        `AlfredpayOfframpTransferHandler: Error polling Alfredpay status: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return this.transitionToNextPhase(state, "complete");
  }

  private async pollAlfredpayOfframpStatus(transactionId: string, intervalMs: number): Promise<void> {
    const alfredpayApiService = AlfredpayApiService.getInstance();
    const startTime = Date.now();

    return new Promise<void>((resolve, reject) => {
      const poll = async () => {
        if (Date.now() - startTime > ALFREDPAY_OFFRAMP_TIMEOUT_MS) {
          reject(new Error(`AlfredpayOfframpTransferHandler: Polling timed out after ${ALFREDPAY_OFFRAMP_TIMEOUT_MS}ms`));
          return;
        }

        try {
          const response = await alfredpayApiService.getOfframpTransaction(transactionId);
          const { status } = response;

          if (status === AlfredpayOfframpStatus.COMPLETED) {
            resolve();
            return;
          }

          if (status === AlfredpayOfframpStatus.FAILED) {
            reject({ failureReason: "Alfredpay reported FAILED status", kind: "failed" as const });
            return;
          }

          logger.debug(`AlfredpayOfframpTransferHandler: Alfredpay offramp ${transactionId} status: ${status}`);
        } catch (error: any) {
          logger.warn(`AlfredpayOfframpTransferHandler: Error polling Alfredpay status for ${transactionId}: ${error}`);
        }

        setTimeout(poll, intervalMs);
      };

      poll();
    });
  }
}

export default new AlfredpayOfframpTransferHandler();
