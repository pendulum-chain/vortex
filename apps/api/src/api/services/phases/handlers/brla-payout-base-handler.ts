import {
  AveniaTicketStatus,
  BrlaApiService,
  EvmClientManager,
  isFiatTokenEnum,
  Networks,
  PixOutputTicketPayload,
  RampPhase
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import TaxId from "../../../../models/taxId.model";
import { PhaseError } from "../../../errors/phase-error";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class BrlaPayoutOnBasePhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "brlaPayoutOnBase";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { taxId, pixDestination, payOutTicketId, brlaPayoutTxHash } = state.state as StateMetadata;

    if (!taxId || !pixDestination) {
      throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: State metadata corrupted. This is a bug.");
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const outputAmount = quote.outputAmount;
    const outputCurrency = quote.outputCurrency;

    const taxIdRecord = await TaxId.findByPk(taxId);
    if (!taxIdRecord) {
      throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: SubaccountId must exist at this stage. This is a bug.");
    }

    if (!isFiatTokenEnum(outputCurrency)) {
      throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: Invalid token type.");
    }

    if (!quote.metadata.nablaSwapEvm?.outputAmountDecimal) {
      throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: Missing nablaSwapEvm metadata.");
    }

    const amountForPayout = quote.metadata.nablaSwapEvm.outputAmountDecimal;

    const brlaApiService = BrlaApiService.getInstance();

    // We need to check for existing ticket, recovery scenario
    if (payOutTicketId) {
      await this.checkTicketStatusPaid({ subAccountId: taxIdRecord.subAccountId, ticketId: payOutTicketId });
      return this.transitionToNextPhase(state, "complete");
    }

    // send the "final destination"
    await this.sendBrlaPayoutTransaction(state, brlaPayoutTxHash);

    const pollForSufficientBalance = async () => {
      const pollInterval = 5000; // 5 seconds
      const timeout = 5 * 60 * 1000; // 5 minutes
      const startTime = Date.now();
      let lastError: any;

      while (Date.now() - startTime < timeout) {
        try {
          const balanceResponse = await brlaApiService.getAccountBalance(taxIdRecord.subAccountId);
          if (balanceResponse && balanceResponse.balances && balanceResponse.balances.BRLA !== undefined) {
            if (new Big(balanceResponse.balances.BRLA).gte(Big(amountForPayout).round(2, 0))) {
              // compare with rounded down amount.
              logger.info(`Sufficient BRLA balance found: ${balanceResponse.balances.BRLA}`);
              return balanceResponse;
            }
            logger.info(
              `Insufficient BRLA balance. Needed units: ${
                amountForPayout
              }, have (in units): ${new Big(balanceResponse.balances.BRLA).toString()}. Retrying in 5s...`
            );
          }
        } catch (error) {
          lastError = error;
          logger.warn("Polling for balance failed with error. Retrying...", lastError);
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      if (lastError) {
        logger.error("BrlaPayoutOnMoonbeamPhaseHandler: Polling for balance failed: ", lastError);
        throw lastError;
      }
      throw new Error(
        `BrlaPayoutOnMoonbeamPhaseHandler: Balance check timed out after 5 minutes. Needed ${amountForPayout} units.`
      );
    };

    await pollForSufficientBalance();

    try {
      const amount = new Big(outputAmount);
      const subaccount = await brlaApiService.subaccountInfo(taxIdRecord.subAccountId);
      if (!subaccount) {
        throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: Subaccount must exist.");
      }
      const subaccountEvmAddress = subaccount.wallets.filter(wallet => wallet.chain === "EVM")[0];

      const amountForQuote = amount.round(2, 0); // Round down to 2 decimal places
      const payOutQuote = await brlaApiService.createPayOutQuote({
        outputAmount: amountForQuote.toString(),
        outputThirdParty: false,
        subAccountId: taxIdRecord.subAccountId
      });

      const payOutTicketParams: PixOutputTicketPayload = {
        quoteToken: payOutQuote.quoteToken,
        ticketBlockchainInput: {
          walletAddress: subaccountEvmAddress.walletAddress
        },
        ticketBrlPixOutput: {
          pixKey: pixDestination
        }
      };
      console.log("payOutTicketParams: ", payOutTicketParams);
      const payOutTicketId = "mocked-ticket-id-for-now";

      //const { id: payOutTicketId } = await brlaApiService.createPixOutputTicket(payOutTicketParams, taxIdRecord.subAccountId);
      logger.debug("Debug: payOutTicketId", payOutTicketId);
      // Update the state with the transaction hashes
      await state.update({
        state: {
          ...state.state,
          payOutTicketId
        }
      });

      await this.checkTicketStatusPaid({ subAccountId: taxIdRecord.subAccountId, ticketId: payOutTicketId });
      return this.transitionToNextPhase(state, "complete");
    } catch (e) {
      logger.error("Error in brlaPayoutOnMoonbeam", e);
      throw this.createUnrecoverableError("BrlaPayoutOnMoonbeamPhaseHandler: Failed to trigger BRLA offramp.");
    }
  }

  private async sendBrlaPayoutTransaction(state: RampState, brlaPayoutTxHash?: `0x${string}`): Promise<void> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const baseClient = evmClientManager.getClient(Networks.Base);
      const { txData: brlaPayoutTx } = this.getPresignedTransaction(state, "brlaPayoutOnBase");

      if (!brlaPayoutTx) {
        throw new Error("Missing presigned transaction for brlaPayoutOnBase");
      }

      let txHash: `0x${string}`;

      if (brlaPayoutTxHash) {
        // Check existing transaction status
        logger.info(
          `BrlaPayoutOnBasePhaseHandler: Found existing transaction hash ${brlaPayoutTxHash}. Waiting for receipt...`
        );
        const receipt = await baseClient.waitForTransactionReceipt({ hash: brlaPayoutTxHash });

        if (receipt.status !== "success") {
          logger.warn(
            `BrlaPayoutOnBasePhaseHandler: Existing transaction ${brlaPayoutTxHash} failed. Sending new transaction...`
          );

          txHash = (await evmClientManager.sendRawTransactionWithRetry(
            Networks.Base,
            brlaPayoutTx as `0x${string}`
          )) as `0x${string}`;

          const newReceipt = await baseClient.waitForTransactionReceipt({ hash: txHash });

          if (newReceipt.status !== "success") {
            throw new Error(`Transaction ${txHash} failed on chain`);
          }
          logger.info(`BrlaPayoutOnBasePhaseHandler: New transaction ${txHash} succeeded.`);

          await state.update({
            state: {
              ...state.state,
              brlaPayoutTxHash: txHash
            }
          });
        } else {
          logger.info(`BrlaPayoutOnBasePhaseHandler: Existing transaction ${brlaPayoutTxHash} succeeded.`);
        }
      } else {
        txHash = (await evmClientManager.sendRawTransactionWithRetry(
          Networks.Base,
          brlaPayoutTx as `0x${string}`
        )) as `0x${string}`;
        logger.info(`BrlaPayoutOnBasePhaseHandler: Transaction sent with hash ${txHash}. Waiting for receipt...`);
        const receipt = await baseClient.waitForTransactionReceipt({ hash: txHash });

        if (receipt.status !== "success") {
          throw new Error(`Transaction ${txHash} failed on chain`);
        }
        logger.info(`BrlaPayoutOnBasePhaseHandler: Transaction ${txHash} succeeded.`);

        // Store hash in state
        await state.update({
          state: {
            ...state.state,
            brlaPayoutTxHash: txHash
          }
        });
      }
    } catch (error) {
      logger.error("BrlaPayoutOnBasePhaseHandler: Failed to send BRLA payout transaction.", error);
      throw this.createRecoverableError("Failed to send BRLA payout transaction");
    }
  }

  protected async checkTicketStatusPaid({
    ticketId,
    subAccountId
  }: {
    ticketId: string;
    subAccountId: string;
  }): Promise<AveniaTicketStatus> {
    const brlaApiService = BrlaApiService.getInstance();
    const pollInterval = 5000; // 5 seconds
    const timeout = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();
    let lastError: any;

    while (Date.now() - startTime < timeout) {
      try {
        const ticket = await brlaApiService.getAveniaPayoutTicket(ticketId, subAccountId);
        if (ticket && ticket.status) {
          logger.info("Debug: fetched ticket", ticket);
          if (ticket.status === AveniaTicketStatus.PAID) {
            return AveniaTicketStatus.PAID;
          }
          if (ticket.status === AveniaTicketStatus.FAILED) {
            throw this.createUnrecoverableError("BrlaPayoutOnMoonbeamPhaseHandler: Ticket status is FAILED");
          }
        }
      } catch (error) {
        if (error instanceof PhaseError) {
          throw error;
        }
        lastError = error;
        logger.warn(`Polling for ticket ${ticketId} status failed with error. Retrying...`, lastError);
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    if (lastError) {
      logger.error("BrlaPayoutOnMoonbeamPhaseHandler: Polling for ticket status timed out with an error: ", lastError);
      throw this.createUnrecoverableError(
        `BrlaPayoutOnMoonbeamPhaseHandler: Polling for ticket status timed out with an error: ${lastError.message}`
      );
    }

    throw this.createRecoverableError("BrlaPayoutOnMoonbeamPhaseHandler: Polling for ticket status timed out.");
  }
}

export default new BrlaPayoutOnBasePhaseHandler();
