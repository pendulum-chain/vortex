import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import logger from '../../../../config/logger';
import { APIError } from '../../../errors/api-error';
import httpStatus from 'http-status';

/**
 * Handler for the prepareTransactions phase
 */
export class PrepareTransactionsPhaseHandler extends BasePhaseHandler {
  /**
   * Get the phase name
   */
  public getPhaseName(): string {
    return 'prepareTransactions';
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing prepareTransactions phase for ramp ${state.id}`);

    try {
      // Validate that we have the necessary presigned transactions
      this.validatePresignedTransactions(state);

      // Determine the next phase based on the ramp type and state
      const nextPhase = this.determineNextPhase(state);

      // Transition to the next phase
      return this.transitionToNextPhase(state, nextPhase);
    } catch (error: any) {
      logger.error(`Error in prepareTransactions phase for ramp ${state.id}:`, error);
      throw error;
    }
  }

  /**
   * Validate that we have the necessary presigned transactions
   * @param state The current ramp state
   */
  private validatePresignedTransactions(state: RampState): void {
    // Check if we have any presigned transactions
    if (!state.presignedTxs || state.presignedTxs.length === 0) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'No presigned transactions found',
      });
    }

    // Check if we have the necessary presigned transactions for the ramp type
    if (state.type === 'off') {
      // For offramping, we need transactions for specific phases
      const requiredPhases = this.getRequiredPhasesForOfframp(state);

      for (const phase of requiredPhases) {
        const hasTx = state.presignedTxs.some((tx) => tx.phase === phase);
        if (!hasTx) {
          throw new APIError({
            status: httpStatus.BAD_REQUEST,
            message: `Missing presigned transaction for phase ${phase}`,
          });
        }
      }
    } else if (state.type === 'on') {
      // For onramping, we need transactions for specific phases
      const requiredPhases = this.getRequiredPhasesForOnramp(state);

      for (const phase of requiredPhases) {
        const hasTx = state.presignedTxs.some((tx) => tx.phase === phase);
        if (!hasTx) {
          throw new APIError({
            status: httpStatus.BAD_REQUEST,
            message: `Missing presigned transaction for phase ${phase}`,
          });
        }
      }
    }
  }

  /**
   * Get the required phases for offramping
   * @param state The current ramp state
   * @returns The required phases
   */
  private getRequiredPhasesForOfframp(state: RampState): string[] {
    // The required phases depend on the input and output currencies
    const inputCurrency = state.state.inputCurrency;
    const outputCurrency = state.state.outputCurrency;

    // For now, return a basic set of required phases
    // This should be expanded based on the specific requirements
    return ['nablaApprove', 'nablaSwap'];
  }

  /**
   * Get the required phases for onramping
   * @param state The current ramp state
   * @returns The required phases
   */
  private getRequiredPhasesForOnramp(state: RampState): string[] {
    // The required phases depend on the input and output currencies
    const inputCurrency = state.state.inputCurrency;
    const outputCurrency = state.state.outputCurrency;

    // For now, return a basic set of required phases
    // This should be expanded based on the specific requirements
    return ['nablaApprove', 'nablaSwap'];
  }

  /**
   * Determine the next phase based on the ramp type and state
   * @param state The current ramp state
   * @returns The next phase
   */
  private determineNextPhase(state: RampState): string {
    // The next phase depends on the ramp type and the network
    if (state.type === 'off') {
      // For offramping, the next phase depends on the network
      const network = state.state.network;

      if (network === 'moonbeam' || network === 'moonbase') {
        return 'squidRouter';
      } else {
        return 'pendulumFundEphemeral';
      }
    } else {
      // For onramping, the next phase is always createPayInRequest
      return 'createPayInRequest';
    }
  }
}

export default new PrepareTransactionsPhaseHandler();
