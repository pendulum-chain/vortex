import httpStatus from 'http-status';
import {BasePhaseHandler} from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import logger from '../../../../config/logger';
import {APIError} from '../../../errors/api-error';
import {getNetworkFromDestination, getNetworkId, RampPhase} from "shared";

/**
 * Handler for the squidRouter phase
 * Only used for the onramp flow. For the offramp, the UI can send the transactions to better confirm outputs.
 */
export class SquidRouterPhaseHandler extends BasePhaseHandler {
  /**
   * Get the phase name
   */
  public getPhaseName(): RampPhase{
    return 'squidrouterSwap';
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing squidRouter phase for ramp ${state.id}`);

    if (state.type === "off") {
      logger.info(`SquidRouter phase is not supported for off-ramp`);
      return state;
    }

    try {
      // Get the presigned transactions for this phase
      const approveTransaction = this.getPresignedTransaction(state, 'nablaApprove');
      const swapTransaction = this.getPresignedTransaction(state, 'nablaSwap');

      if (!approveTransaction || !swapTransaction) {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: 'Missing presigned transactions for squidRouter phase',
        });
      }

      const destinationNetwork = getNetworkFromDestination(state.from);
      const chainId = destinationNetwork ? getNetworkId(destinationNetwork) : null;
      if (!chainId) {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: 'Invalid source network',
        });
      }

      // Execute the approve transaction
      const approveHash = await this.executeTransaction(approveTransaction.tx_data);
      logger.info(`Approve transaction executed with hash: ${approveHash}`);

      // Wait for the approve transaction to be confirmed
      await this.waitForTransactionConfirmation(approveHash, chainId);
      logger.info(`Approve transaction confirmed: ${approveHash}`);

      // Execute the swap transaction
      const swapHash = await this.executeTransaction(swapTransaction.tx_data);
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
      return this.transitionToNextPhase(updatedState, 'fundEphemeral');
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
    // In a real implementation, this would send the transaction to the blockchain
    // For now, we'll just return a mock hash
    return `0x${Math.random().toString(16).substring(2, 42)}`;
  }

  /**
   * Wait for a transaction to be confirmed
   * @param txHash The transaction hash
   * @param chainId The chain ID
   */
  private async waitForTransactionConfirmation(txHash: string, chainId: number): Promise<void> {
    // In a real implementation, this would wait for the transaction to be confirmed
    // For now, we'll just wait a short time
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export default new SquidRouterPhaseHandler();
