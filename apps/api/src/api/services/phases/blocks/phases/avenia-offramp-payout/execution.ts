import {
  AveniaTicketStatus,
  BrlaApiService,
  EvmClientManager,
  Networks,
  PixOutputTicketPayload,
  RampPhase,
  sleep
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { PhaseError } from "../../../../../errors/phase-error";
import { findAveniaCustomerByTaxId } from "../../../../avenia/avenia-customer.service";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { ensurePresignedTransferFunded } from "../../core/destination-funding";
import { getBlockMetadata, getBlockState, getFlowMetadata } from "../../core/metadata";
import { getAnchorPayoutMaxRetries, isAnchorMockingEnabled } from "../anchor-test-mode";
import { AveniaPendulumOfframpContext } from "../avenia-pendulum-offramp/simulation";
import type { AveniaOfframpPayoutRegistrationFacts } from "./registration";
import { AveniaOfframpPayoutContext } from "./simulation";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1_000;

export class AveniaOfframpPayoutExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "brlaPayoutOnBase";
  }

  public getMaxRetries(): number {
    return getAnchorPayoutMaxRetries();
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    if (isAnchorMockingEnabled()) {
      logger.warn(`AveniaOfframpPayoutExecutor: Pausing test ramp ${state.id} before the anchor payout`);
      throw this.createRecoverableError("Avenia payout paused by MOCK_ANCHOR_OPERATIONS");
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) throw new Error("AveniaOfframpPayoutExecutor: Quote not found");
    const isPendulumPayout = Boolean(getFlowMetadata(quote.metadata).blocks[AveniaPendulumOfframpContext.key]);
    const metadata = isPendulumPayout
      ? getBlockMetadata(quote.metadata, AveniaPendulumOfframpContext)
      : getBlockMetadata(quote.metadata, AveniaOfframpPayoutContext);
    const facts = getBlockState<AveniaOfframpPayoutRegistrationFacts>(
      state.state,
      isPendulumPayout ? AveniaPendulumOfframpContext : AveniaOfframpPayoutContext
    );
    let subAccountId = facts.subAccountId;
    if (!subAccountId) {
      // Compatibility fallback for ramps registered before subaccount identity was snapshotted.
      const customer = await findAveniaCustomerByTaxId(facts.taxId);
      if (!customer) throw new Error("AveniaOfframpPayoutExecutor: Avenia customer not found");
      subAccountId = customer.providerSubaccountId ?? "";
    }
    if (state.state.payOutTicketId) {
      await this.waitForPaid(state.state.payOutTicketId, subAccountId, signal);
      return state;
    }
    if (!isPendulumPayout) await this.sendPayoutTransfer(state, signal);
    const api = BrlaApiService.getInstance();
    await this.poll(
      async () => {
        const balance = await abortableCall(signal, () => api.getAccountBalance(subAccountId));
        return new Big(balance?.balances?.BRLA ?? 0).gte(new Big(metadata.transferAmountDecimal).round(2, 0));
      },
      "Avenia BRLA balance",
      signal
    );
    try {
      const ticket = await this.runFinancialOperation(state, {
        attemptClass: "provider-payout-ticket",
        externalId: result => result.id,
        perform: async () => {
          const payoutQuote = await abortableCall(signal, () =>
            api.createPayOutQuote({
              outputAmount: new Big(quote.outputAmount).round(2, 0).toString(),
              outputThirdParty: false,
              subAccountId
            })
          );
          throwIfAborted(signal);
          const payload: PixOutputTicketPayload = {
            quoteToken: payoutQuote.quoteToken,
            ticketBlockchainInput: { walletAddress: facts.brlaEvmAddress },
            ticketBrlPixOutput: { pixKey: facts.pixDestination }
          };
          const created = await abortableCall(signal, () => api.createPixOutputTicket(payload, subAccountId));
          return { id: created.id };
        },
        provider: "avenia",
        request: {
          brlaEvmAddress: facts.brlaEvmAddress,
          outputAmount: new Big(quote.outputAmount).round(2, 0).toString(),
          pixDestination: facts.pixDestination,
          subAccountId
        },
        signal
      });
      await state.update({ state: { ...state.state, payOutTicketId: ticket.id } });
      await this.waitForPaid(ticket.id, subAccountId, signal);
      return state;
    } catch (error) {
      if (error instanceof PhaseError) throw error;
      logger.error("AveniaOfframpPayoutExecutor: Failed to trigger PIX payout", error);
      throw this.createUnrecoverableError("AveniaOfframpPayoutExecutor: Failed to trigger BRLA offramp");
    }
  }

  private async sendPayoutTransfer(state: RampState, signal?: AbortSignal): Promise<void> {
    try {
      const client = EvmClientManager.getInstance();
      const base = client.getClient(Networks.Base);
      const transaction = this.getPresignedTransaction(state, "brlaPayoutOnBase");
      if (!transaction || typeof transaction.txData !== "string") {
        throw new Error("AveniaOfframpPayoutExecutor: Missing presigned payout transaction");
      }
      if (state.state.brlaPayoutTxHash) {
        const receipt = await abortableCall(signal, () =>
          base.waitForTransactionReceipt({ hash: state.state.brlaPayoutTxHash as `0x${string}` })
        );
        if (receipt.status === "success") return;
        throw this.createUnrecoverableError(`Payout transfer ${state.state.brlaPayoutTxHash} failed`);
      } else {
        await ensurePresignedTransferFunded(transaction.txData as `0x${string}`, Networks.Base, this.getPhaseName(), signal);
      }
      const { hash } = await this.runFinancialOperation(state, {
        attemptClass: "presigned-payout-broadcast",
        externalId: result => result.hash,
        perform: async () => {
          throwIfAborted(signal);
          const hash = await client.sendRawTransactionWithRetry(Networks.Base, transaction.txData as `0x${string}`);
          const receipt = await abortableCall(signal, () => base.waitForTransactionReceipt({ hash: hash as `0x${string}` }));
          if (receipt.status !== "success") throw new Error(`Payout transfer ${hash} failed`);
          return { hash: hash as `0x${string}` };
        },
        provider: Networks.Base,
        request: { network: Networks.Base, signedTransaction: transaction.txData },
        signal
      });
      await state.update({ state: { ...state.state, brlaPayoutTxHash: hash as `0x${string}` } });
    } catch (error) {
      if (error instanceof PhaseError) throw error;
      logger.error("AveniaOfframpPayoutExecutor: Failed to send BRLA payout transaction", error);
      throw this.createRecoverableError("Failed to send BRLA payout transaction");
    }
  }

  private async waitForPaid(ticketId: string, subAccountId: string, signal?: AbortSignal): Promise<void> {
    const api = BrlaApiService.getInstance();
    await this.poll(
      async () => {
        const ticket = await abortableCall(signal, () => api.getAveniaPayoutTicket(ticketId, subAccountId));
        if (ticket.status === AveniaTicketStatus.FAILED) {
          throw this.createUnrecoverableError("AveniaOfframpPayoutExecutor: Ticket status is FAILED");
        }
        return ticket.status === AveniaTicketStatus.PAID;
      },
      `Avenia payout ticket ${ticketId}`,
      signal
    );
  }

  private async poll(check: () => Promise<boolean>, label: string, signal?: AbortSignal): Promise<void> {
    const start = Date.now();
    let lastError: unknown;
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      throwIfAborted(signal);
      try {
        if (await check()) return;
      } catch (error) {
        if (error instanceof PhaseError) throw error;
        lastError = error;
      }
      await sleep(POLL_INTERVAL_MS, signal);
    }
    if (lastError) throw this.createUnrecoverableError(`${label} polling failed: ${lastError}`);
    throw this.createRecoverableError(`${label} polling timed out`);
  }
}
