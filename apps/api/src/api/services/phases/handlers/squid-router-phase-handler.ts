import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import logger from '../../../../config/logger';
import { getNetworkFromDestination, getNetworkId, RampPhase } from 'shared';
import { createPublicClient, http } from 'viem';
import { moonbeam } from 'viem/chains';

/**
 * Handler for the squidRouter phase
 * Only used for the onramp flow. For the offramp, the UI can send the transactions to better confirm outputs.
 */
export class SquidRouterPhaseHandler extends BasePhaseHandler {
  private publicClient: ReturnType<typeof createPublicClient>;

  constructor() {
    super();
    this.publicClient = createPublicClient({
      chain: moonbeam,
      transport: http(),
    });
  }

  /**
   * Get the phase name
   */
  public getPhaseName(): RampPhase {
    return 'squidrouterSwap';
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing squidRouter phase for ramp ${state.id}`);

    if (state.type === 'off') {
      logger.info(`SquidRouter phase is not supported for off-ramp`);
      return state;
    }

    try {
      // Get the presigned transactions for this phase
      const approveTransaction = this.getPresignedTransaction(state, 'squidrouterApprove');
      const swapTransaction = this.getPresignedTransaction(state, 'squidrouterSwap');

      if (!approveTransaction || !swapTransaction) {
        throw new Error('Missing presigned transactions for squidRouter phase');
      }

      const accountNonce = await this.getNonce(approveTransaction.signer as `0x${string}`);
      if (approveTransaction.nonce && approveTransaction.nonce !== accountNonce) {
        logger.warn(
          `Nonce mismatch for approve transaction of account ${approveTransaction.signer}: expected ${accountNonce}, got ${approveTransaction.nonce}`,
        );
      }

      const destinationNetwork = getNetworkFromDestination(state.to);
      const chainId = destinationNetwork ? getNetworkId(destinationNetwork) : null;
      if (!chainId) {
        throw new Error('Invalid destination network');
      }

      // Execute the approve transaction
      const approveHash = await this.executeTransaction(approveTransaction.txData as string);
      logger.info(`Approve transaction executed with hash: ${approveHash}`);

      // Wait for the approve transaction to be confirmed
      await this.waitForTransactionConfirmation(approveHash, chainId);
      logger.info(`Approve transaction confirmed: ${approveHash}`);

      // Execute the swap transaction
      const swapHash = await this.executeTransaction(swapTransaction.txData as string);
      logger.info(`Swap transaction executed with hash: ${swapHash}`);

      // Wait for the swap transaction to be confirmed
      await this.waitForTransactionConfirmation(swapHash, chainId);
      logger.info(`Swap transaction confirmed: ${swapHash}`);

      // Update the state with the transaction hashes
      const updatedState = await state.update({
        state: {
          ...state.state,
          squidRouterApproveHash: approveHash,
          squidRouterSwapHash: swapHash,
        },
      });

      // Transition to the next phase
      // FIXME we are in onramp here, so we should transition to a different phase
      return this.transitionToNextPhase(updatedState, 'complete');
    } catch (error: any) {
      logger.error(`Error in squidRouter phase for ramp ${state.id}:`, error);
      throw error;
    }
  }

  /**
   * Execute a transaction
   * @param txData The transaction data
   * @returns The transaction hash
   */
  private async executeTransaction(txData: string): Promise<string> {
    try {
      const txHash = await this.publicClient.sendRawTransaction({ serializedTransaction: txData as `0x${string}` });
      return txHash;
    } catch (error) {
      logger.error('Error sending raw transaction', error);
      throw new Error('Failed to send transaction');
    }
  }

  /**
   * Wait for a transaction to be confirmed
   * @param txHash The transaction hash
   * @param chainId The chain ID
   */
  private async waitForTransactionConfirmation(txHash: string, chainId: number): Promise<void> {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      if (!receipt || receipt.status !== 'success') {
        throw new Error(`SquidRouterPhaseHandler: Transaction ${txHash} failed or was not found`);
      }
    } catch (error) {
      throw new Error(`SquidRouterPhaseHandler: Error waiting for transaction confirmation: ${error}`);
    }
  }

  private async getNonce(address: `0x${string}`): Promise<number> {
    try {
      // List all transactions for the address to get the nonce
      return await this.publicClient.getTransactionCount({ address });
    } catch (error) {
      logger.error('Error getting nonce', error);
      throw new Error('Failed to get transaction nonce');
    }
  }
}

export default new SquidRouterPhaseHandler();
