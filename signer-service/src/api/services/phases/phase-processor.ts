import httpStatus from 'http-status';
import RampState from '../../../models/rampState.model';
import PhaseMetadata from '../../../models/phaseMetadata.model';
import phaseRegistry from './phase-registry';
import logger from '../../../config/logger';
import { APIError } from '../../errors/api-error';

/**
 * Process phases for a ramping process
 */
export class PhaseProcessor {
  private static instance: PhaseProcessor;

  /**
   * Get the singleton instance
   */
  public static getInstance(): PhaseProcessor {
    if (!PhaseProcessor.instance) {
      PhaseProcessor.instance = new PhaseProcessor();
    }
    return PhaseProcessor.instance;
  }

  /**
   * Process a ramping process
   * @param rampId The ID of the ramping process
   */
  public async processRamp(rampId: string): Promise<void> {
    const state = await RampState.findByPk(rampId);
    if (!state) {
      throw new APIError({
        status: httpStatus.NOT_FOUND,
        message: `Ramp with ID ${rampId} not found`,
      });
    }

    await this.processPhase(state);
  }

  /**
   * Process a phase
   * @param state The current ramp state
   */
  private async processPhase(state: RampState): Promise<void> {
    try {
      const {currentPhase} = state;
      logger.info(`Processing phase ${currentPhase} for ramp ${state.id}`);

      // Get the phase handler
      const handler = phaseRegistry.getHandler(currentPhase);
      if (!handler) {
        logger.warn(`No handler found for phase ${currentPhase}`);
        return;
      }

      // Execute the phase
      const updatedState = await handler.execute(state);

      // If the phase has changed, process the next phase
      if (updatedState.currentPhase !== currentPhase) {
        logger.info(`Phase changed from ${currentPhase} to ${updatedState.currentPhase} for ramp ${state.id}`);

        // Process the next phase
        await this.processPhase(updatedState);
      } else {
        logger.info(`Phase ${currentPhase} completed for ramp ${state.id}`);
      }
    } catch (error: any) {
      logger.error(`Error processing phase ${state.currentPhase} for ramp ${state.id}:`, error);

      // Add error to the state
      const errorLogs = [
        ...state.errorLogs,
        {
          phase: state.currentPhase,
          timestamp: new Date(),
          error: error.message || 'Unknown error',
          details: error.stack || {},
        },
      ];

      await state.update({ errorLogs });

      // Throw the error to be handled by the caller
      throw error;
    }
  }

  /**
   * Get the valid next phases for a phase
   * @param phaseName The name of the phase
   * @returns The valid next phases
   */
  public async getValidNextPhases(phaseName: string): Promise<string[]> {
    const phaseMetadata = await PhaseMetadata.findOne({
      where: { phaseName },
    });

    if (!phaseMetadata) {
      return [];
    }

    return phaseMetadata.validTransitions;
  }
}

export default PhaseProcessor.getInstance();
