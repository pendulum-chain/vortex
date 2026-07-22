import {
  AveniaTicketStatus,
  BrlaApiService,
  EvmClientManager,
  Networks,
  PixOutputTicketPayload,
  RampPhase
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { PhaseError } from "../../../../../errors/phase-error";
import { findAveniaCustomerByTaxId } from "../../../../avenia/avenia-customer.service";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { ensurePresignedTransferFunded } from "../../../../phases/handlers/helpers";
import { getBlockMetadata, getBlockState, getFlowMetadata } from "../../core/metadata";
import { AveniaPendulumOfframpContext } from "../avenia-pendulum-offramp/simulation";
import type { AveniaOfframpPayoutRegistrationFacts } from "./registration";
import { AveniaOfframpPayoutContext } from "./simulation";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1_000;

export class AveniaOfframpPayoutExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "brlaPayoutOnBase";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
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
    const customer = await findAveniaCustomerByTaxId(facts.taxId);
    if (!customer) throw new Error("AveniaOfframpPayoutExecutor: Avenia customer not found");
    const subAccountId = customer.providerSubaccountId ?? "";
    if (state.state.payOutTicketId) {
      await this.waitForPaid(state.state.payOutTicketId, subAccountId);
      return state;
    }
    if (!isPendulumPayout) await this.sendPayoutTransfer(state);
    const api = BrlaApiService.getInstance();
    await this.poll(async () => {
      const balance = await api.getAccountBalance(subAccountId);
      return new Big(balance?.balances?.BRLA ?? 0).gte(new Big(metadata.transferAmountDecimal).round(2, 0));
    }, "Avenia BRLA balance");
    try {
      const payoutQuote = await api.createPayOutQuote({
        outputAmount: new Big(quote.outputAmount).round(2, 0).toString(),
        outputThirdParty: false,
        subAccountId
      });
      const payload: PixOutputTicketPayload = {
        quoteToken: payoutQuote.quoteToken,
        ticketBlockchainInput: { walletAddress: facts.brlaEvmAddress },
        ticketBrlPixOutput: { pixKey: facts.pixDestination }
      };
      const ticket = await api.createPixOutputTicket(payload, subAccountId);
      await state.update({ state: { ...state.state, payOutTicketId: ticket.id } });
      await this.waitForPaid(ticket.id, subAccountId);
      return state;
    } catch (error) {
      if (error instanceof PhaseError) throw error;
      logger.error("AveniaOfframpPayoutExecutor: Failed to trigger PIX payout", error);
      throw this.createUnrecoverableError("AveniaOfframpPayoutExecutor: Failed to trigger BRLA offramp");
    }
  }

  private async sendPayoutTransfer(state: RampState): Promise<void> {
    const client = EvmClientManager.getInstance();
    const base = client.getClient(Networks.Base);
    const transaction = this.getPresignedTransaction(state, "brlaPayoutOnBase");
    if (!transaction || typeof transaction.txData !== "string") {
      throw new Error("AveniaOfframpPayoutExecutor: Missing presigned payout transaction");
    }
    try {
      if (state.state.brlaPayoutTxHash) {
        const receipt = await base.waitForTransactionReceipt({ hash: state.state.brlaPayoutTxHash });
        if (receipt.status === "success") return;
      } else {
        await ensurePresignedTransferFunded(transaction.txData as `0x${string}`, Networks.Base, this.getPhaseName());
      }
      const hash = await client.sendRawTransactionWithRetry(Networks.Base, transaction.txData as `0x${string}`);
      const receipt = await base.waitForTransactionReceipt({ hash: hash as `0x${string}` });
      if (receipt.status !== "success") throw new Error(`Payout transfer ${hash} failed`);
      await state.update({ state: { ...state.state, brlaPayoutTxHash: hash as `0x${string}` } });
    } catch (error) {
      if (error instanceof PhaseError) throw error;
      logger.error("AveniaOfframpPayoutExecutor: Failed to send BRLA payout transaction", error);
      throw this.createRecoverableError("Failed to send BRLA payout transaction");
    }
  }

  private async waitForPaid(ticketId: string, subAccountId: string): Promise<void> {
    const api = BrlaApiService.getInstance();
    await this.poll(async () => {
      const ticket = await api.getAveniaPayoutTicket(ticketId, subAccountId);
      if (ticket.status === AveniaTicketStatus.FAILED) {
        throw this.createUnrecoverableError("AveniaOfframpPayoutExecutor: Ticket status is FAILED");
      }
      return ticket.status === AveniaTicketStatus.PAID;
    }, `Avenia payout ticket ${ticketId}`);
  }

  private async poll(check: () => Promise<boolean>, label: string): Promise<void> {
    const start = Date.now();
    let lastError: unknown;
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      try {
        if (await check()) return;
      } catch (error) {
        if (error instanceof PhaseError) throw error;
        lastError = error;
      }
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    if (lastError) throw this.createUnrecoverableError(`${label} polling failed: ${lastError}`);
    throw this.createRecoverableError(`${label} polling timed out`);
  }
}
