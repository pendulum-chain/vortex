import { FiatToken, getNetworkFromDestination, getNetworkId, Networks, RampPhase } from "@packages/shared";
import { PublicClient } from "viem";
import { moonbeam, polygon } from "viem/chains";

import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { EvmClientManager } from "../../evm/clientManager";
import { BasePhaseHandler } from "../base-phase-handler";

/**
 * Handler for the squidRouter phase
 */
export class SquidRouterPhaseHandler extends BasePhaseHandler {
  private moonbeamClient: PublicClient;
  private polygonClient: PublicClient;

  constructor() {
    super();
    const evmClientManager = EvmClientManager.getInstance();
    this.moonbeamClient = evmClientManager.getClient(Networks.Moonbeam);
    this.polygonClient = evmClientManager.getClient(Networks.Polygon);
  }

  /**
   * Get the phase name
   */
  public getPhaseName(): RampPhase {
    return "squidRouterSwap";
  }

  /**
   * Get the appropriate public client based on the input token
   * Monerium's EUR uses polygon, BRL uses moonbeam
   * @param state The current ramp state
   * @returns The appropriate public client
   */
  private async getPublicClient(state: RampState): Promise<PublicClient> {
    try {
      const quote = await QuoteTicket.findByPk(state.quoteId);
      if (!quote) {
        throw new Error(`Quote not found for ramp ${state.id}`);
      }

      if (quote.inputCurrency === FiatToken.EURC) {
        return this.polygonClient;
      } else if (quote.inputCurrency === FiatToken.BRL) {
        return this.moonbeamClient;
      } else {
        logger.info(
          `SquidRouterPhaseHandler: Using Moonbeam client as default for input currency: ${quote.inputCurrency}. This is a bug.`
        );
        return this.moonbeamClient;
      }
    } catch (error) {
      logger.error("SquidRouterPhaseHandler: Error determining public client, defaulting to moonbeam", error);
      return this.moonbeamClient;
    }
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing squidRouter phase for ramp ${state.id}`);

    if (state.type === "off") {
      logger.info("SquidRouter phase is not supported for off-ramp");
      return state;
    }

    try {
      // Get the presigned transactions for this phase
      const approveTransaction = this.getPresignedTransaction(state, "squidRouterApprove");
      const swapTransaction = this.getPresignedTransaction(state, "squidRouterSwap");

      if (!approveTransaction || !swapTransaction) {
        throw new Error("Missing presigned transactions for squidRouter phase");
      }

      const accountNonce = await this.getNonce(state, approveTransaction.signer as `0x${string}`);
      if (approveTransaction.nonce && approveTransaction.nonce !== accountNonce) {
        logger.warn(
          `Nonce mismatch for approve transaction of account ${approveTransaction.signer}: expected ${accountNonce}, got ${approveTransaction.nonce}`
        );
      }

      const destinationNetwork = getNetworkFromDestination(state.to);
      const chainId = destinationNetwork ? getNetworkId(destinationNetwork) : null;
      if (!chainId) {
        throw new Error("Invalid destination network");
      }

      // Execute the approve transaction
      const approveHash = await this.executeTransaction(state, approveTransaction.txData as string);
      logger.info(`Approve transaction executed with hash: ${approveHash}`);

      // Wait for the approve transaction to be confirmed
      await this.waitForTransactionConfirmation(state, approveHash, chainId);
      logger.info(`Approve transaction confirmed: ${approveHash}`);

      // Execute the swap transaction
      const swapHash = await this.executeTransaction(state, swapTransaction.txData as string);
      logger.info(`Swap transaction executed with hash: ${swapHash}`);

      // Wait for the swap transaction to be confirmed
      await this.waitForTransactionConfirmation(state, swapHash, chainId);
      logger.info(`Swap transaction confirmed: ${swapHash}`);

      // Update the state with the transaction hashes
      const updatedState = await state.update({
        state: {
          ...state.state,
          squidRouterApproveHash: approveHash,
          squidRouterSwapHash: swapHash
        }
      });

      // Transition to the next phase
      return this.transitionToNextPhase(updatedState, "squidRouterPay");
    } catch (error) {
      logger.error(`Error in squidRouter phase for ramp ${state.id}:`, error);
      throw error;
    }
  }

  /**
   * Execute a transaction
   * @param state The current ramp state
   * @param txData The transaction data
   * @returns The transaction hash
   */
  private async executeTransaction(state: RampState, txData: string): Promise<string> {
    try {
      const publicClient = await this.getPublicClient(state);
      const txHash = await publicClient.sendRawTransaction({
        serializedTransaction: txData as `0x${string}`
      });
      return txHash;
    } catch (error) {
      logger.error("Error sending raw transaction", error);
      throw new Error("Failed to send transaction");
    }
  }

  /**
   * Wait for a transaction to be confirmed with exponential backoff
   * @param state The current ramp state
   * @param txHash The transaction hash
   * @param chainId The chain ID
   */
  private async waitForTransactionConfirmation(state: RampState, txHash: string, _chainId: number): Promise<void> {
    const maxRetries = 3;
    const baseDelay = 5000; // 5 seconds
    const maxDelay = 30000; // 30 seconds

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const publicClient = await this.getPublicClient(state);
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`
        });

        if (!receipt || receipt.status !== "success") {
          throw new Error(`SquidRouterPhaseHandler: Transaction ${txHash} failed or was not found`);
        }

        return;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        // Based on error message returned by the client.
        const isTransactionNotFoundError =
          error instanceof Error &&
          (error.message.includes("TransactionReceiptNotFoundError") ||
            error.message.includes("could not be found") ||
            error.message.includes("Transaction may not be processed"));

        if (isLastAttempt) {
          throw new Error(
            `SquidRouterPhaseHandler: Error waiting for transaction confirmation after ${maxRetries + 1} attempts: ${error}`
          );
        }

        if (isTransactionNotFoundError) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

          logger.info(
            `SquidRouterPhaseHandler: Transaction ${txHash} not found on attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${delay}ms...`
          );

          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw new Error(`SquidRouterPhaseHandler: Error waiting for transaction confirmation: ${error}`);
        }
      }
    }
  }

  private async getNonce(state: RampState, address: `0x${string}`): Promise<number> {
    try {
      const publicClient = await this.getPublicClient(state);
      // List all transactions for the address to get the nonce
      return await publicClient.getTransactionCount({ address });
    } catch (error) {
      logger.error("Error getting nonce", error);
      throw new Error("Failed to get transaction nonce");
    }
  }
}

export default new SquidRouterPhaseHandler();
