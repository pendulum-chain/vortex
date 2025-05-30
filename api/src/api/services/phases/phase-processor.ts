import httpStatus from 'http-status';
import RampState from '../../../models/rampState.model';
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
  private lockedRamps = new Set<string>();

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
   * Acquire a lock for a ramp.
   * Returns false if the ramp is already locked either by this process
   * or by another.
   */
  private async acquireLock(state: RampState): Promise<boolean> {
    if (this.lockedRamps.has(state.id) || state.processingLock.locked) {
      return false;
    }

    this.lockedRamps.add(state.id);
    await RampState.update(
      {
        processingLock: {
          locked: true,
          lockedAt: new Date(),
        },
      },
      { where: { id: state.id } },
    );

    return true;
  }

  /**
   * Release lock for a ramp.
   */
  private async releaseLock(state: RampState): Promise<void> {
    try {
      // Remove in-memory lock
      this.lockedRamps.delete(state.id);
      // Release db lock
      await RampState.update(
        {
          processingLock: {
            locked: false,
            lockedAt: null,
          },
        },
        { where: { id: state.id } },
      );
    } catch (error) {
      logger.error(`Error releasing lock for ramp ${state.id}: ${error}`);
    }
  }

  /**
   * Check if the lock has expired. We do this to avoid stale locks that can happen when the service crashes or restarts.
   * @param state The current ramp state
   * @private
   */
  private isLockExpired(state: RampState): boolean {
    const lockDuration = 15 * 60 * 1000; // 15 minutes

    // If no lock data exists, it's not actually locked
    if (!state.processingLock || !state.processingLock.locked) {
      return false;
    }

    // If locked but missing timestamp, consider it expired
    if (!state.processingLock.lockedAt) {
      return true;
    }

    const lockTime = new Date(state.processingLock.lockedAt);
    // Check if lockTime is valid
    if (isNaN(lockTime.getTime())) {
      logger.warn(`Invalid lock time for ramp ${state.id}`);
      return true; // Consider invalid timestamps as expired
    }

    const now = new Date();
    return now.getTime() - lockTime.getTime() > lockDuration;
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

    // Try to acquire the lock
    let lockAcquired = await this.acquireLock(state);
    if (!lockAcquired) {
      if (this.isLockExpired(state)) {
        logger.info(`Lock for ramp ${rampId} has expired. Ignoring previous lock and continue processing...`);
        // Force release the expired lock and try to acquire it again
        await this.releaseLock(state);
        lockAcquired = await this.acquireLock(state);
        if (!lockAcquired) {
          logger.warn(`Failed to acquire lock for ramp ${rampId} even after clearing expired lock`);
          return;
        }
      } else {
        logger.info(`Skipping processing for ramp ${rampId} as it's already being processed`);
        return;
      }
    }

    try {
      await this.processPhase(state);
      // We just return, since the error management should be handled in the processPhase method.
      // We do not want to crash the whole process if one ramp fails.
    } catch (error) {
      logger.error(`Error processing ramp ${rampId}: ${error}`);
    } finally {
      await this.releaseLock(state);
    }
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
      if (
        updatedState.currentPhase !== currentPhase &&
        updatedState.currentPhase !== 'complete' &&
        updatedState.currentPhase !== 'failed'
      ) {
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
      const isPhaseError = error instanceof PhaseError;
      const isRecoverable = isPhaseError && error.isRecoverable;

      if (isRecoverable) {
        const currentRetries = this.retriesMap.get(state.id) || 0;

        if (currentRetries < this.MAX_RETRIES) {
          const nextRetry = currentRetries + 1;
          this.retriesMap.set(state.id, nextRetry);
          const delayMs = Math.pow(2, currentRetries) * 1000;

          logger.info(`Scheduling retry ${nextRetry}/${this.MAX_RETRIES} for ramp ${state.id} in ${delayMs}ms`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
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

      throw error;
    }
  }
}

export default PhaseProcessor.getInstance();
