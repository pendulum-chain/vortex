import {
  AlfredpayApiService,
  AlfredpayOnrampStatus,
  BalanceCheckError,
  BalanceCheckErrorType,
  checkEvmBalancePeriodically,
  ERC20_USDC_POLYGON,
  ERC20_USDC_POLYGON_DECIMALS,
  Networks,
  RampPhase
} from "@vortexfi/shared";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

const ALFREDPAY_ONRAMP_MINT_TIMEOUT_MS = 5 * 60 * 1000;
const BALANCE_POLL_INTERVAL_MS = 3000;
const ALFREDPAY_POLL_INTERVAL_MS = 5000;

export class AlfredpayOnrampMintHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "alfredpayOnrampMint";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { evmEphemeralAddress, alfredpayTransactionId } = state.state as StateMetadata;

    if (!evmEphemeralAddress) {
      throw new Error("AlfredpayOnrampMintHandler: Missing evmEphemeralAddress in state. This is a bug.");
    }

    if (!alfredpayTransactionId) {
      throw new Error("AlfredpayOnrampMintHandler: Missing alfredpayTransactionId in state. This is a bug.");
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("AlfredpayOnrampMintHandler: Quote not found for the given state.");
    }

    if (!quote.metadata.alfredpayMint?.outputAmountRaw) {
      throw new Error("AlfredpayOnrampMintHandler: Missing 'alfredpayMint.outputAmountRaw' in quote metadata.");
    }

    const expectedAmountRaw = quote.metadata.alfredpayMint.outputAmountRaw;

    logger.info(
      `AlfredpayOnrampMintHandler: Waiting for ${expectedAmountRaw} USDC (raw, ${ERC20_USDC_POLYGON_DECIMALS} decimals) ` +
        `on Polygon at ephemeral address ${evmEphemeralAddress}. Alfredpay transactionId: ${alfredpayTransactionId}`
    );

    const balanceCheckPromise = checkEvmBalancePeriodically(
      ERC20_USDC_POLYGON,
      evmEphemeralAddress,
      expectedAmountRaw,
      BALANCE_POLL_INTERVAL_MS,
      ALFREDPAY_ONRAMP_MINT_TIMEOUT_MS,
      Networks.Polygon
    );

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`AlfredpayOnrampMintHandler: Timed out after ${ALFREDPAY_ONRAMP_MINT_TIMEOUT_MS}ms`)),
        ALFREDPAY_ONRAMP_MINT_TIMEOUT_MS
      );
    });

    const alfredpayPollingPromise = this.pollAlfredpayOnrampStatus(alfredpayTransactionId, state, ALFREDPAY_POLL_INTERVAL_MS);

    // - balanceCheckPromise resolves when the USDC balance is met → proceed.
    // - timeoutPromise rejects after 5 min → recoverable error, but potentially user did not send funds.
    // - alfredpayPollingPromise rejects if FAILED → transition to failed. Not recoverable
    //   (it does NOT resolve on ON_CHAIN_COMPLETED, because we trust the balance check)
    try {
      await Promise.race([balanceCheckPromise, timeoutPromise, alfredpayPollingPromise]);
    } catch (error: any) {
      if (error?.kind === "failed") {
        logger.error(`AlfredpayOnrampMintHandler: Alfredpay onramp FAILED. Reason: ${error.failureReason ?? "unknown"}`);
        return this.transitionToNextPhase(state, "failed");
      }

      if (error instanceof BalanceCheckError && error.type === BalanceCheckErrorType.Timeout) {
        throw this.createRecoverableError(
          `AlfredpayOnrampMintHandler: Balance check timed out after ${ALFREDPAY_ONRAMP_MINT_TIMEOUT_MS}ms`
        );
      }

      const isTimeout = error instanceof Error && error.message.includes("Timed out");
      if (isTimeout) {
        throw this.createRecoverableError(
          `AlfredpayOnrampMintHandler: Phase timed out after ${ALFREDPAY_ONRAMP_MINT_TIMEOUT_MS}ms`
        );
      }

      throw error;
    }

    logger.info(
      `AlfredpayOnrampMintHandler: USDC balance reached on Polygon ephemeral ${evmEphemeralAddress}. Proceeding to fundEphemeral.`
    );

    return this.transitionToNextPhase(state, "fundEphemeral");
  }

  private async pollAlfredpayOnrampStatus(transactionId: string, state: RampState, intervalMs: number): Promise<never> {
    const alfredpayApiService = AlfredpayApiService.getInstance();

    return new Promise<never>((_, reject) => {
      const poll = async () => {
        try {
          const response = await alfredpayApiService.getOnrampTransaction(transactionId);
          const { status, metadata } = response;

          if (status === AlfredpayOnrampStatus.FAILED) {
            reject({ failureReason: metadata?.failureReason, kind: "failed" as const });
            return;
          }

          if (status === AlfredpayOnrampStatus.ON_CHAIN_COMPLETED) {
            // Save the txHash into ramp state, but do NOT resolve.
            // We trust the balance check as ground truth for proceeding.
            const txHash = metadata?.txHash;
            if (txHash) {
              const currentState = state.state as StateMetadata;
              if (!currentState.alfredpayOnrampMintTxHash) {
                await state.update({
                  state: {
                    ...currentState,
                    alfredpayOnrampMintTxHash: txHash
                  }
                });
                logger.info(`AlfredpayOnrampMintHandler: Saved alfredpayOnrampMintTxHash=${txHash} for ramp ${state.id}`);
              }
            }
            return;
          }
        } catch (error: any) {
          if (error?.kind === "failed") {
            reject(error);
            return;
          }

          logger.warn(`AlfredpayOnrampMintHandler: Error polling Alfredpay status for ${transactionId}: ${error}`);
        }

        setTimeout(poll, intervalMs);
      };

      poll();
    });
  }
}

export default new AlfredpayOnrampMintHandler();
