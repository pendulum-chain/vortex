import {
  ALFREDPAY_EVM_TOKEN,
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  evmTokenConfig,
  FiatToken,
  getEvmBalance,
  getOnChainTokenDetails,
  isAlfredpayToken,
  Networks,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import { PublicClient } from "viem";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { isBrlToBrlaBaseDirect, isEurToEurcBaseDirect } from "../../quote/utils";
import { BasePhaseHandler } from "../base-phase-handler";

/**
 * Handler for the squidRouter phase
 */
export class SquidRouterPhaseHandler extends BasePhaseHandler {
  private getClient(network: EvmNetworks): PublicClient {
    return EvmClientManager.getInstance().getClient(network);
  }

  /**
   * Get the phase name
   */
  public getPhaseName(): RampPhase {
    return "squidRouterSwap";
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing squidRouter phase for ramp ${state.id}`);

    if (state.state.isDirectTransfer === true) {
      logger.info(`SquidRouterPhaseHandler: Skipping squidRouter for direct-transfer ramp ${state.id}`);
      return this.transitionToNextPhase(state, "destinationTransfer");
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (
      isEurToEurcBaseDirect(quote.inputCurrency, quote.outputCurrency, quote.network) ||
      isBrlToBrlaBaseDirect(quote.inputCurrency, quote.outputCurrency, quote.network)
    ) {
      logger.info(`SquidRouterPhaseHandler: Skipping squidRouter for Base direct-transfer route (ramp ${state.id})`);
      return this.transitionToNextPhase(state, "destinationTransfer");
    }

    if (state.type === RampDirection.SELL) {
      logger.info("SquidRouter phase is not supported for off-ramp");
      return state;
    }

    // Alfredpay mints USDT directly on Polygon. Skip the swap ONLY when the requested
    // output is that direct token; metadata.to is the destination network, not the output
    // token, so other Polygon outputs (e.g. USDC) still need a real USDT→output swap.
    const isAlfredpayOnramp =
      state.type === RampDirection.BUY && isAlfredpayToken(quote.inputCurrency as FiatToken) && !!quote.metadata.alfredpayMint;

    if (isAlfredpayOnramp && quote.metadata.to === Networks.Polygon && quote.outputCurrency === ALFREDPAY_EVM_TOKEN) {
      logger.info(`SquidRouterPhaseHandler: Skipping squidRouter for Alfredpay direct-token onramp (ramp ${state.id})`);
      return this.transitionToNextPhase(state, "finalSettlementSubsidy");
    }

    const bridgeMeta = quote.metadata.evmToEvm || quote.metadata.moonbeamToEvm;
    if (
      !bridgeMeta?.inputAmountRaw ||
      !bridgeMeta.fromNetwork ||
      !bridgeMeta.fromToken ||
      !bridgeMeta.toNetwork ||
      !bridgeMeta.toToken
    ) {
      throw new Error("Missing bridge metadata required to validate squidRouter input balance");
    }

    const isSameChainSameTokenPassthrough =
      bridgeMeta.fromNetwork === bridgeMeta.toNetwork &&
      bridgeMeta.fromToken.toLowerCase() === bridgeMeta.toToken.toLowerCase();
    if (isSameChainSameTokenPassthrough) {
      logger.info(`SquidRouterPhaseHandler: Skipping squidRouter for same-chain same-token passthrough (ramp ${state.id})`);
      return this.transitionToNextPhase(state, "finalSettlementSubsidy");
    }

    const evmEphemeralAddress = state.state.evmEphemeralAddress;
    if (!evmEphemeralAddress) {
      throw new Error("Missing EVM ephemeral address to validate squidRouter input balance");
    }

    const sourceNetwork = bridgeMeta.fromNetwork as EvmNetworks;
    const sourceTokenDetails = Object.values(evmTokenConfig[sourceNetwork] || {}).find(
      token => token.erc20AddressSourceChain.toLowerCase() === bridgeMeta.fromToken.toLowerCase()
    ) as EvmTokenDetails | undefined;

    if (!sourceTokenDetails) {
      throw new Error(
        `Could not resolve source token details on ${bridgeMeta.fromNetwork} for token ${bridgeMeta.fromToken} in squidRouter phase`
      );
    }

    try {
      try {
        await checkEvmBalanceForToken({
          amountDesiredRaw: bridgeMeta.inputAmountRaw,
          chain: sourceNetwork,
          intervalMs: 1000,
          ownerAddress: evmEphemeralAddress,
          timeoutMs: 15000,
          tokenDetails: sourceTokenDetails
        });
      } catch (_error) {
        throw this.createRecoverableError(
          `Unable to verify squidRouter input balance for ${evmEphemeralAddress} on ${sourceNetwork}; balance may not be settled yet`
        );
      }

      // Get the presigned transactions for this phase
      const approveTransaction = this.getPresignedTransaction(state, "squidRouterApprove");
      const swapTransaction = this.getPresignedTransaction(state, "squidRouterSwap");

      if (!approveTransaction || !swapTransaction) {
        throw new Error("Missing presigned transactions for squidRouter phase");
      }

      let approveHash = state.state.squidRouterApproveHash;
      // Check if the approve transaction has already been sent
      if (!approveHash) {
        const accountNonce = await this.getNonce(sourceNetwork, approveTransaction.signer as `0x${string}`);
        if (approveTransaction.nonce && approveTransaction.nonce !== accountNonce) {
          logger.warn(
            `Nonce mismatch for approve transaction of account ${approveTransaction.signer}: expected ${accountNonce}, got ${approveTransaction.nonce}`
          );
        }

        // Execute the approve transaction
        approveHash = await this.executeTransaction(sourceNetwork, approveTransaction.txData as string);
        logger.info(`Approve transaction executed with hash: ${approveHash}`);

        // Update the state with the approve hash immediately after sending the transaction
        await state.update({
          state: {
            ...state.state,
            squidRouterApproveHash: approveHash
          }
        });
      }

      // Wait for the approve transaction to be confirmed
      await this.waitForTransactionConfirmation(sourceNetwork, approveHash);
      logger.info(`Approve transaction confirmed: ${approveHash}`);

      // Execute the swap transaction
      const swapHash = await this.executeTransaction(sourceNetwork, swapTransaction.txData as string);
      logger.info(`Swap transaction executed with hash: ${swapHash}`);

      // Update the state with the transaction hashes
      let updatedState = await state.update({
        state: {
          ...state.state,
          squidRouterSwapHash: swapHash
        }
      });

      // Wait for the swap transaction to be confirmed
      await this.waitForTransactionConfirmation(sourceNetwork, swapHash);
      logger.info(`Swap transaction confirmed: ${swapHash}`);

      let preSettlementBalance = "0";
      try {
        const destinationNetwork = quote.network as EvmNetworks;
        const outTokenDetails = getOnChainTokenDetails(quote.network, quote.outputCurrency) as EvmTokenDetails;

        if (!outTokenDetails) {
          throw new Error(`Could not resolve destination token details for ${quote.outputCurrency} on ${destinationNetwork}`);
        }

        preSettlementBalance = (
          await getEvmBalance({
            chain: destinationNetwork,
            ownerAddress: state.state.evmEphemeralAddress as `0x${string}`,
            tokenDetails: outTokenDetails
          })
        ).toString();
      } catch (error) {
        logger.warn(
          `SquidRouterPhaseHandler: Failed to snapshot pre-settlement balance for ramp ${state.id}; storing 0. Error: ${error}`
        );
      }

      updatedState = await updatedState.update({
        state: {
          ...updatedState.state,
          preSettlementBalance
        }
      });

      // Transition to the next phase
      return this.transitionToNextPhase(updatedState, "squidRouterPay");
    } catch (error) {
      logger.error(`Error in squidRouter phase for ramp ${state.id}:`, error);
      throw error;
    }
  }

  private async executeTransaction(network: EvmNetworks, txData: string): Promise<string> {
    try {
      const publicClient = this.getClient(network);
      const txHash = await publicClient.sendRawTransaction({
        serializedTransaction: txData as `0x${string}`
      });
      return txHash;
    } catch (error) {
      logger.error("Error sending raw transaction", error);
      throw new Error("Failed to send transaction");
    }
  }

  private async waitForTransactionConfirmation(network: EvmNetworks, txHash: string): Promise<void> {
    const maxRetries = 3;
    const baseDelay = 5000; // 5 seconds
    const maxDelay = 30000; // 30 seconds

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const publicClient = this.getClient(network);
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
          throw this.createRecoverableError(`SquidRouterPhaseHandler: Error waiting for transaction confirmation: ${error}`);
        }
      }
    }
  }

  private async getNonce(network: EvmNetworks, address: `0x${string}`): Promise<number> {
    try {
      const publicClient = this.getClient(network);
      return await publicClient.getTransactionCount({ address });
    } catch (error) {
      logger.error("Error getting nonce", error);
      throw this.createRecoverableError("Failed to get transaction nonce");
    }
  }
}

export default new SquidRouterPhaseHandler();
