import {
  ERC20_EURE_POLYGON_V2,
  EvmClientManager,
  getEvmTokenBalance,
  Networks,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../config/logger";
import { MOONBEAM_EXECUTOR_PRIVATE_KEY } from "../../../../constants/constants";
import { permitAbi } from "../../../../contracts/PermitAbi";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";

/**
 * Handler for the monerium self-transfer phase
 */
export class MoneriumOnrampSelfTransferHandler extends BasePhaseHandler {
  private polygonClient: PublicClient;
  private evmClientManager: EvmClientManager;

  constructor() {
    super();
    this.evmClientManager = EvmClientManager.getInstance();
    this.polygonClient = this.evmClientManager.getClient(Networks.Polygon);
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

    if (state.type === RampDirection.SELL) {
      logger.info("MoneriumOnrampSelfTransfer phase is not supported for off-ramp");
      return state;
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (!quote.metadata.moneriumMint?.outputAmountRaw) {
      throw new Error("MoneriumOnrampSelfTransfer: Missing moneriumMint metadata.");
    }

    const { evmEphemeralAddress, moneriumOnrampPermit, moneriumWalletAddress } = state.state;
    if (!evmEphemeralAddress) {
      throw new Error("MoneriumOnrampSelfTransfer: Polygon ephemeral address not defined in the state. This is a bug.");
    }
    if (!moneriumOnrampPermit) {
      throw new Error("MoneriumOnrampSelfTransfer: Missing Monerium permit in state metadata. State corrupted.");
    }
    if (!moneriumWalletAddress) {
      throw new Error("MoneriumOnrampSelfTransfer: Missing Monerium wallet address in state metadata. State corrupted.");
    }

    const mintedAmountRaw = quote.metadata.moneriumMint.outputAmountRaw;

    const didTokensArriveOnEvm = async () => {
      const balance = await getEvmTokenBalance({
        chain: Networks.Polygon,
        ownerAddress: evmEphemeralAddress as `0x${string}`,
        tokenAddress: ERC20_EURE_POLYGON_V2
      });
      return balance.gte(Big(mintedAmountRaw));
    };

    try {
      if (await didTokensArriveOnEvm()) {
        logger.info(`Tokens have arrived on Polygon ephemeral address: ${evmEphemeralAddress}. Skipping self-transfer.`);
        return this.transitionToNextPhase(state, "squidRouterSwap");
      }
    } catch (error) {
      // inability to check balance is not a critical error and should be temporal, we can proceed throw a recoverable.
      throw this.createRecoverableError(`MoneriumOnrampSelfTransferHandler: Error checking Polygon balance: ${error}`);
    }

    try {
      const account = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY as `0x${string}`);
      let permitHash: string;

      if (state.state.permitTxHash) {
        logger.info(`Permit transaction already sent with hash: ${state.state.permitTxHash}. Skipping permit sending.`);
        permitHash = state.state.permitTxHash;
      } else {
        // Send permit transaction
        const permitData = encodeFunctionData({
          abi: permitAbi,
          args: [
            moneriumWalletAddress,
            state.state.evmEphemeralAddress,
            BigInt(mintedAmountRaw),
            moneriumOnrampPermit.deadline,
            moneriumOnrampPermit.v,
            moneriumOnrampPermit.r,
            moneriumOnrampPermit.s
          ],
          functionName: "permit"
        });
        permitHash = await this.evmClientManager.sendTransaction(Networks.Polygon, account, {
          data: permitData,
          to: ERC20_EURE_POLYGON_V2
        });
        logger.info(`Permit transaction executed with hash: ${permitHash}`);

        await this.waitForTransactionConfirmation(permitHash);
        logger.info(`Permit transaction confirmed: ${permitHash}`);

        state.state.permitTxHash = permitHash;
        await state.update({ state: state.state });
      }

      const transferTransaction = this.getPresignedTransaction(state, "moneriumOnrampSelfTransfer");

      if (!transferTransaction) {
        throw new Error("Missing presigned transactions for moneriumOnrampSelfTransfer phase. State corrupted.");
      }

      // Execute the transfer transaction
      const transferHash = await this.executeTransaction(transferTransaction.txData as string);
      logger.info(`Transfer transaction executed with hash: ${transferHash}`);

      await this.waitForTransactionConfirmation(transferHash);
      logger.info(`TransferFrom transaction confirmed: ${transferHash}`);

      // Wait for another 30 seconds to give time for the balance to update (in case other RPC nodes are lagging)
      logger.info("Waiting 30 seconds to ensure balance is updated...");
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Transition to the next phase
      return this.transitionToNextPhase(state, "squidRouterSwap");
    } catch (error: unknown) {
      logger.error(`Error in self-transfer phase for ramp ${state.id}:`, error);
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
      const evmClientManager = EvmClientManager.getInstance();
      const txHash = await evmClientManager.sendRawTransaction(Networks.Polygon, txData as `0x${string}`);
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
  private async waitForTransactionConfirmation(txHash: string): Promise<void> {
    try {
      const receipt = await this.polygonClient.waitForTransactionReceipt({
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

export default new MoneriumOnrampSelfTransferHandler();
