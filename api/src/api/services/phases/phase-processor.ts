import httpStatus from 'http-status';
import RampState from '../../../models/rampState.model';
import PhaseMetadata from '../../../models/phaseMetadata.model';
import phaseRegistry from './phase-registry';
import logger from '../../../config/logger';
import { APIError } from '../../errors/api-error';
import { PhaseError } from '../../errors/phase-error';

/**
 * Process phases for a ramping process
 */
export class PhaseProcessor {
  private static instance: PhaseProcessor;
  private retriesMap = new Map<string, number>();
  private readonly MAX_RETRIES = 8;

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
      const { currentPhase } = state;
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
      // except for complete or fail phases which are terminal.
      if (updatedState.currentPhase !== currentPhase && updatedState.currentPhase !== 'complete' && updatedState.currentPhase !== 'failed') {
        logger.info(`Phase changed from ${currentPhase} to ${updatedState.currentPhase} for ramp ${state.id}`);
        
        this.retriesMap.delete(state.id);
        
        // Process the next phase
        await this.processPhase(updatedState);
      } else if (updatedState.currentPhase === 'complete') {
        logger.info(`Ramp ${state.id} completed successfully`);
        this.retriesMap.delete(state.id);
      } else if (updatedState.currentPhase === 'failed') {
        logger.error(`Ramp ${state.id} failed unrecoverably, giving up.`);
        this.retriesMap.delete(state.id);
      } else {
        logger.info(`Current phase must be different to updated phase for non-terminal states. This is a bug.`);
        this.retriesMap.delete(state.id);
      }
    } catch (error: any) {
      logger.error(`Error processing phase ${state.currentPhase} for ramp ${state.id}:`, error);

      const isPhaseError = error instanceof PhaseError;
      const isRecoverable = isPhaseError && error.isRecoverable === true;

      if (isRecoverable) {
        const currentRetries = this.retriesMap.get(state.id) || 0;
        
        if (currentRetries < this.MAX_RETRIES) {
          const nextRetry = currentRetries + 1;
          this.retriesMap.set(state.id, nextRetry);
          const delayMs = Math.pow(2, currentRetries) * 1000; 
          
          logger.info(`Scheduling retry ${nextRetry}/${this.MAX_RETRIES} for ramp ${state.id} in ${delayMs}ms`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return this.processPhase(state);
        }
        
        logger.error(`Max retries (${this.MAX_RETRIES}) reached for ramp ${state.id}`);
        this.retriesMap.delete(state.id);
      }

      // Add error to the state
      const errorLogs = [
        ...state.errorLogs,
        {
          phase: state.currentPhase,
          timestamp: new Date().toISOString(),
          error: error.message || 'Unknown error',
          details: error.stack || {},
          recoverable: isRecoverable,
          isPhaseError,
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
