import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ERC20_TOKEN,
  AlfredpayApiService,
  AlfredpayOnrampStatus,
  BalanceCheckError,
  BalanceCheckErrorType,
  checkEvmBalancePeriodically,
  Networks,
  RampPhase
} from "@vortexfi/shared";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { getBlockMetadata } from "../../core/metadata";
import { AlfredpayMintContext } from "./simulation";

const MINT_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

type AlfredpayFailedStatusError = { failureReason?: string; kind: "failed" };

function isAlfredpayFailedStatusError(error: unknown): error is AlfredpayFailedStatusError {
  return !!error && typeof error === "object" && "kind" in error && error.kind === "failed";
}

export class AlfredpayOnrampMintExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "alfredpayOnrampMint";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { evmEphemeralAddress, alfredpayTransactionId } = state.state as StateMetadata;
    if (!evmEphemeralAddress || !alfredpayTransactionId) {
      throw new Error("AlfredpayOnrampMintExecutor: Missing ephemeral address or Alfredpay transaction ID");
    }
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("AlfredpayOnrampMintExecutor: Quote not found");
    }
    const metadata = getBlockMetadata(quote.metadata, AlfredpayMintContext);
    const abortController = new AbortController();
    try {
      await Promise.race([
        checkEvmBalancePeriodically(
          ALFREDPAY_ERC20_TOKEN,
          evmEphemeralAddress,
          metadata.outputAmountRaw,
          POLL_INTERVAL_MS,
          MINT_TIMEOUT_MS,
          Networks.Polygon
        ),
        this.pollStatus(alfredpayTransactionId, state, abortController.signal)
      ]);
    } catch (error) {
      if (isAlfredpayFailedStatusError(error)) {
        logger.error(`AlfredpayOnrampMintExecutor: Alfredpay onramp failed: ${error.failureReason ?? "unknown"}`);
        return this.transitionToNextPhase(state, "failed");
      }
      if (error instanceof BalanceCheckError && error.type === BalanceCheckErrorType.Timeout) {
        throw this.createRecoverableError(`AlfredpayOnrampMintExecutor: Balance check timed out after ${MINT_TIMEOUT_MS}ms`);
      }
      throw this.createRecoverableError(
        `AlfredpayOnrampMintExecutor: Failed to check ${ALFREDPAY_ERC20_DECIMALS}-decimal mint balance or status: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      abortController.abort();
    }
    return state;
  }

  private pollStatus(transactionId: string, state: RampState, signal: AbortSignal): Promise<never> {
    return new Promise<never>((_, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      signal.addEventListener("abort", () => timeoutId && clearTimeout(timeoutId), { once: true });
      const poll = async () => {
        if (signal.aborted) return;
        try {
          const { status, metadata } = await AlfredpayApiService.getInstance().getOnrampTransaction(transactionId);
          if (status === AlfredpayOnrampStatus.FAILED) {
            reject({ failureReason: metadata?.failureReason, kind: "failed" as const });
            return;
          }
          if (status === AlfredpayOnrampStatus.ON_CHAIN_COMPLETED && metadata?.txHash) {
            const currentState = state.state as StateMetadata;
            if (!currentState.alfredpayOnrampMintTxHash) {
              await state.update({ state: { ...currentState, alfredpayOnrampMintTxHash: metadata.txHash } });
            }
          }
        } catch (error) {
          logger.warn(`AlfredpayOnrampMintExecutor: Error polling Alfredpay status: ${error}`);
        }
        timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
      };
      void poll();
    });
  }
}
