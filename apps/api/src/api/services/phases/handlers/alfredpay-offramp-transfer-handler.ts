import {
  ALFREDPAY_ONCHAIN_CURRENCY,
  AlfredpayApiService,
  AlfredpayChain,
  AlfredpayFiatCurrency,
  AlfredpayOfframpStatus,
  AlfredpayPaymentMethodType,
  EvmClientManager,
  EvmNetworks,
  Networks,
  RampPhase
} from "@vortexfi/shared";
import logger from "../../../../config/logger";
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

    let alfredpayTx = await alfredpayApiService.getOfframpTransaction(alfredpayTransactionId);
    if (!alfredpayTx) {
      throw new Error(`AlfredpayOfframpTransferHandler: Transaction ${alfredpayTransactionId} not found in Alfredpay.`);
    }

    // Only attempt expiration recovery if we haven't sent the final transfer yet.
    if (!alfredpayOfframpTransferTxHash && new Date(alfredpayTx.expiration) < new Date()) {
      logger.warn(
        `AlfredpayOfframpTransferHandler: Alfredpay transaction ${alfredpayTransactionId} expired before transfer. Attempting recovery.`
      );

      const recovered = await this.recreateAlfredpayOfframp(state, alfredpayTx);
      if (!recovered) {
        logger.error(
          `AlfredpayOfframpTransferHandler: Recovery failed for ${alfredpayTransactionId} (deposit address changed or API error).`
        );
        return this.transitionToNextPhase(state, "failed");
      }

      alfredpayTx = recovered.alfredpayTx;
      state = recovered.state;
    }

    if (!alfredpayOfframpTransferTxHash) {
      logger.info(
        `AlfredpayOfframpTransferHandler: Executing final transfer for Alfredpay offramp ${alfredpayTx.transactionId}`
      );

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
      await this.pollAlfredpayOfframpStatus(alfredpayTx.transactionId, ALFREDPAY_POLL_INTERVAL_MS);
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

  private async recreateAlfredpayOfframp(
    state: RampState,
    expiredTx: Awaited<ReturnType<AlfredpayApiService["getOfframpTransaction"]>>
  ): Promise<{ state: RampState; alfredpayTx: Awaited<ReturnType<AlfredpayApiService["getOfframpTransaction"]>> } | null> {
    const { alfredpayUserId, fiatAccountId, walletAddress } = state.state as StateMetadata;

    if (!alfredpayUserId || !fiatAccountId || !walletAddress) {
      logger.error("AlfredpayOfframpTransferHandler: Missing fields required for recovery of expired offramp order.");
      return null;
    }

    const alfredpayApiService = AlfredpayApiService.getInstance();

    try {
      const toCurrency = expiredTx.toCurrency as AlfredpayFiatCurrency;

      const freshQuote = await alfredpayApiService.createOfframpQuote({
        chain: AlfredpayChain.MATIC,
        fromAmount: expiredTx.fromAmount,
        fromCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
        metadata: { businessId: "vortex", customerId: alfredpayUserId },
        paymentMethodType: AlfredpayPaymentMethodType.BANK,
        toCurrency
      });

      const newOrder = await alfredpayApiService.createOfframp({
        amount: expiredTx.fromAmount,
        chain: AlfredpayChain.MATIC,
        customerId: alfredpayUserId,
        fiatAccountId,
        fromCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
        originAddress: walletAddress,
        quoteId: freshQuote.quoteId,
        toCurrency
      });

      if (newOrder.depositAddress.toLowerCase() !== expiredTx.depositAddress.toLowerCase()) {
        logger.error(
          `AlfredpayOfframpTransferHandler: New deposit address ${newOrder.depositAddress} does not match expired ${expiredTx.depositAddress}. Cannot reuse presigned final transfer.`
        );
        return null;
      }

      await state.update({
        state: {
          ...state.state,
          alfredpayTransactionId: newOrder.transactionId
        }
      });

      logger.info(
        `AlfredpayOfframpTransferHandler: Recovery successful. New Alfredpay transactionId: ${newOrder.transactionId}`
      );

      const refreshedTx = await alfredpayApiService.getOfframpTransaction(newOrder.transactionId);
      return { alfredpayTx: refreshedTx, state };
    } catch (error) {
      logger.error(
        `AlfredpayOfframpTransferHandler: Error during recovery: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
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

          if (status === AlfredpayOfframpStatus.FIAT_TRANSFER_COMPLETED) {
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
