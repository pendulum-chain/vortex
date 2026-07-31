import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ERC20_TOKEN,
  AlfredpayApiService,
  AlfredpayOnrampStatus,
  BalanceCheckError,
  BalanceCheckErrorType,
  checkEvmBalancePeriodically,
  Networks,
  RampPhase,
  sleep
} from "@vortexfi/shared";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { getBlockMetadata } from "../../core/metadata";
import { isAnchorMockingEnabled } from "../anchor-test-mode";
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

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const { evmEphemeralAddress, alfredpayTransactionId } = state.state as StateMetadata;
    if (!evmEphemeralAddress || !alfredpayTransactionId) {
      throw new Error("AlfredpayOnrampMintExecutor: Missing ephemeral address or Alfredpay transaction ID");
    }
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("AlfredpayOnrampMintExecutor: Quote not found");
    }
    const metadata = getBlockMetadata(quote.metadata, AlfredpayMintContext);
    if (isAnchorMockingEnabled()) {
      logger.warn(
        `AlfredpayOnrampMintExecutor: Mocking AlfredPay mint; send ${metadata.outputAmountRaw} raw tokens on ${Networks.Polygon} to ${evmEphemeralAddress}`
      );
      try {
        await checkEvmBalancePeriodically(
          ALFREDPAY_ERC20_TOKEN,
          evmEphemeralAddress,
          metadata.outputAmountRaw,
          POLL_INTERVAL_MS,
          MINT_TIMEOUT_MS,
          Networks.Polygon,
          signal
        );
      } catch (error) {
        if (error instanceof BalanceCheckError && error.type === BalanceCheckErrorType.Timeout) {
          throw this.createRecoverableError(`AlfredpayOnrampMintExecutor: Mock mint balance check timed out: ${error}`);
        }
        throw error;
      }
      return state;
    }

    const abortController = new AbortController();
    const pollingSignal = signal ? AbortSignal.any([signal, abortController.signal]) : abortController.signal;
    try {
      await Promise.race([
        checkEvmBalancePeriodically(
          ALFREDPAY_ERC20_TOKEN,
          evmEphemeralAddress,
          metadata.outputAmountRaw,
          POLL_INTERVAL_MS,
          MINT_TIMEOUT_MS,
          Networks.Polygon,
          pollingSignal
        ),
        this.pollStatus(alfredpayTransactionId, state, POLL_INTERVAL_MS, pollingSignal)
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

  private async pollStatus(transactionId: string, state: RampState, intervalMs: number, signal: AbortSignal): Promise<never> {
    while (true) {
      throwIfAborted(signal);
      try {
        const { status, metadata } = await abortableCall(signal, () =>
          AlfredpayApiService.getInstance().getOnrampTransaction(transactionId)
        );
        if (status === AlfredpayOnrampStatus.FAILED) {
          throw { failureReason: metadata?.failureReason, kind: "failed" as const };
        }
        if (status === AlfredpayOnrampStatus.ON_CHAIN_COMPLETED) {
          const currentState = state.state as StateMetadata;
          if (metadata?.txHash && !currentState.alfredpayOnrampMintTxHash) {
            await state.update({ state: { ...currentState, alfredpayOnrampMintTxHash: metadata.txHash } });
          }
        }
      } catch (error) {
        if (isAlfredpayFailedStatusError(error)) throw error;
        throwIfAborted(signal);
        logger.warn(`AlfredpayOnrampMintExecutor: Error polling Alfredpay status: ${error}`);
      }
      await sleep(intervalMs, signal);
    }
  }
}
