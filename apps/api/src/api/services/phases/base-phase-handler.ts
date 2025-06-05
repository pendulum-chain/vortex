import { PresignedTx, RampErrorLog, RampPhase } from '@packages/shared';
import { ReadMessageResult } from '@pendulum-chain/api-solang';
import httpStatus from 'http-status';
import logger from '../../../config/logger';
import RampState from '../../../models/rampState.model';
import { APIError } from '../../errors/api-error';
import { PhaseError, RecoverablePhaseError, UnrecoverablePhaseError } from '../../errors/phase-error';
import rampService from '../ramp/ramp.service';

/**
 * Base interface for phase handlers
 */
export interface PhaseHandler {
  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  execute(state: RampState): Promise<RampState>;

  /**
   * Get the phase name
   */
  getPhaseName(): string;
}

/**
 * Base class for phase handlers
 */
export abstract class BasePhaseHandler implements PhaseHandler {
  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  public async execute(state: RampState): Promise<RampState> {
    try {
      logger.info(`Executing phase ${this.getPhaseName()} for ramp ${state.id}`);

      // Validate that the current phase matches the handler
      if (state.currentPhase !== this.getPhaseName()) {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: `Cannot execute phase ${this.getPhaseName()} for ramp in phase ${state.currentPhase}`,
        });
      }

      // Execute the phase
      const updatedState = await this.executePhase(state);

      // Log the phase execution
      logger.info(`Phase ${this.getPhaseName()} executed successfully for ramp ${state.id}`);

      return updatedState;
    } catch (error: any) {
      logger.error(`Error executing phase ${this.getPhaseName()} for ramp ${state.id}:`, error);

      // Add error to the state
      await this.logError(state, error);

      if (error instanceof PhaseError) {
        throw error;
      }

      throw new UnrecoverablePhaseError(error.message || 'Unknown error in phase execution');
    }
  }

  protected createRecoverableError(message: string): RecoverablePhaseError {
    return new RecoverablePhaseError(message);
  }

  protected createUnrecoverableError(message: string): UnrecoverablePhaseError {
    return new UnrecoverablePhaseError(message);
  }

  private async logError(state: RampState, error: any): Promise<void> {
    const isPhaseError = error instanceof PhaseError;
    const isRecoverable = isPhaseError && error.isRecoverable === true;

    const errorLog: RampErrorLog = {
      phase: this.getPhaseName(),
      timestamp: new Date().toISOString(),
      error: error.message || 'Unknown error',
      details: error.stack || {},
      recoverable: isRecoverable,
    };

    await rampService.appendErrorLog(state.id, errorLog);
  }

  /**
   * Execute the phase implementation
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  protected abstract executePhase(state: RampState): Promise<RampState>;

  /**
   * Get the phase name
   */
  public abstract getPhaseName(): RampPhase;

  /**
   * Transition to the next phase
   * @param state The current ramp state
   * @param nextPhase The next phase
   * @param metadata Additional metadata for the transition
   * @returns The updated ramp state
   */
  protected async transitionToNextPhase(state: RampState, nextPhase: RampPhase, metadata?: any): Promise<RampState> {
    const phaseHistory = [
      ...state.phaseHistory,
      {
        phase: nextPhase,
        timestamp: new Date(),
        metadata,
      },
    ];

    await state.update({
      currentPhase: nextPhase,
      phaseHistory,
    });

    return state.reload();
  }

  /**
   * Get a presigned transaction for a specific phase
   * @param state The current ramp state
   * @param phase The phase to get the transaction for
   * @returns The presigned transaction
   */
  protected getPresignedTransaction(state: RampState, phase: RampPhase): PresignedTx {
    return state.presignedTxs?.find((tx) => tx.phase === phase) as PresignedTx;
  }

  protected parseContractMessageResultError(result: ReadMessageResult) {
    if (result.type === 'error') {
      return result.error;
    } else if (result.type === 'panic') {
      return `${result.errorCode}: ${result.explanation}`;
    } else if (result.type === 'reverted') {
      return `${result.description}`;
    }
    return 'Could not extract error message for ReadMessageResult.';
  }
}
