import RampState from '../../../models/rampState.model';
import logger from '../../../config/logger';
import { APIError } from '../../errors/api-error';
import httpStatus from 'http-status';
import { getNextPhase } from './next-phase-selector';

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
    } catch (error) {
      logger.error(`Error executing phase ${this.getPhaseName()} for ramp ${state.id}:`, error);

      // Add error to the state
      await this.logError(state, error);

      throw error;
    }
  }

  /**
   * Log an error
   * @param state The current ramp state
   * @param error The error to log
   */
  private async logError(state: RampState, error: any): Promise<void> {
    const errorLogs = [
      ...state.errorLogs,
      {
        phase: this.getPhaseName(),
        timestamp: new Date(),
        error: error.message || 'Unknown error',
        details: error.stack || {},
      },
    ];

    await state.update({ errorLogs });
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
  public abstract getPhaseName(): string;

  /**
   * Transition to the next phase
   * @param state The current ramp state
   * @param nextPhase The next phase
   * @param metadata Additional metadata for the transition
   * @returns The updated ramp state
   */
  protected async transitionToNextPhase(state: RampState, metadata?: any): Promise<RampState> {
    const nextPhase = getNextPhase(state.type, state.currentPhase);
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
}
