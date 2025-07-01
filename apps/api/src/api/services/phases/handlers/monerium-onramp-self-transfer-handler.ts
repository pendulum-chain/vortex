import { getNetworkFromDestination, getNetworkId, Networks, RampPhase } from "@packages/shared";
import { getChainId } from "@wagmi/core";
import Big from "big.js";
import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import logger from "../../../../config/logger";
import { ALCHEMY_API_KEY } from "../../../../constants/constants";
import RampState from "../../../../models/rampState.model";
import { getEvmTokenBalance } from "../../moonbeam/balance";
import { ERC20_EURE_POLYGON } from "../../transactions/moneriumEvmOnrampTransactions";
import { BasePhaseHandler } from "../base-phase-handler";

/**
 * Handler for the squidRouter phase
 */
export class MonenriumOnrampSelfTransferHandler extends BasePhaseHandler {
  private publicClient: ReturnType<typeof createPublicClient>;

  constructor() {
    super();
    this.publicClient = createPublicClient({
      chain: polygon,
      transport: http(`https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`)
    });
  }

  /**
   * Get the phase name
   */
  public getPhaseName(): RampPhase {
    return "moneriumOnrampSelfTransfer";
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing moneriumOnrampSelfTransfer phase for ramp ${state.id}`);

    if (state.type === "off") {
      logger.info(`MoneriumOnrampSelfTransfer phase is not supported for off-ramp`);
      return state;
    }

    const { polygonEphemeralAddress, inputAmountBeforeSwapRaw } = state.state;
    if (!polygonEphemeralAddress) {
      throw new Error("MoneriumOnrampSelfTransfer: Polygon ephemeral address not defined in the state. This is a bug.");
    }

    const didTokensArriveOnEvm = async () => {
      const balance = await getEvmTokenBalance({
        chain: polygon,
        ownerAddress: polygonEphemeralAddress as `0x${string}`,
        tokenAddress: ERC20_EURE_POLYGON
      });
      return balance.gte(Big(inputAmountBeforeSwapRaw));
    };

    try {
      if (await didTokensArriveOnEvm()) {
        logger.info(`Tokens have arrived on Polygon ephemeral address: ${polygonEphemeralAddress}. Skipping self-transfer.`);
        return this.transitionToNextPhase(state, "squidRouterSwap");
      }
    } catch (error) {
      // inability to check balance is not a critical error and should be temporal, we can proceed throw a recoverable.
      throw this.createRecoverableError(`MoneriumOnrampSelfTransferHandler: Error checking Polygon balance: ${error}`);
    }

    try {
      const transferTransaction = this.getPresignedTransaction(state, "moneriumOnrampSelfTransfer");

      if (!transferTransaction) {
        throw new Error("Missing presigned transactions for moneriumOnrampSelfTransfer phase");
      }

      // Under our current implementation, funds are transferred to an Ephemeral also on Polygon.
      const chainId = getNetworkId(Networks.Polygon);

      // Execute the transfer transaction
      const transferHash = await this.executeTransaction(transferTransaction.txData as string);
      logger.info(`Transfer transaction executed with hash: ${transferHash}`);

      // Wait for the transfer transaction to be confirmed
      await this.waitForTransactionConfirmation(transferHash, chainId);
      logger.info(`Transfer transaction confirmed: ${transferHash}`);

      // Transition to the next phase
      return this.transitionToNextPhase(state, "squidRouterSwap");
    } catch (error: any) {
      logger.error(`Error in squidRouter phase for ramp ${state.id}:`, error);
      throw this.createRecoverableError(
        `MoneriumOnrampSelfTransferHandler: Error while sending self-transfer transaction: ${error}`
      );
    }
  }

  /**
   * Execute a transaction
   * @param txData The transaction data
   * @returns The transaction hash
   */
  private async executeTransaction(txData: string): Promise<string> {
    try {
      const txHash = await this.publicClient.sendRawTransaction({
        serializedTransaction: txData as `0x${string}`
      });
      return txHash;
    } catch (error) {
      logger.error("Error sending raw transaction", error);
      throw new Error("Failed to send transaction");
    }
  }

  /**
   * Wait for a transaction to be confirmed
   * @param txHash The transaction hash
   * @param chainId The chain ID
   */
  private async waitForTransactionConfirmation(txHash: string, _chainId: number): Promise<void> {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`
      });
      if (!receipt || receipt.status !== "success") {
        throw new Error(`moneriumOnrampSelfTransferHandler: Transaction ${txHash} failed or was not found`);
      }
    } catch (error) {
      throw new Error(`moneriumOnrampSelfTransferHandler: Error waiting for transaction confirmation: ${error}`);
    }
  }
}

export default new MonenriumOnrampSelfTransferHandler();
