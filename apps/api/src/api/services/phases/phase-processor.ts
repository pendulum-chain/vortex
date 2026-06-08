import { RampPhase } from "@vortexfi/shared";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import { runWithRampContext } from "../../../config/ramp-context";
import { config } from "../../../config/vars";
import RampState from "../../../models/rampState.model";
import { APIError } from "../../errors/api-error";
import { PhaseError, RecoverablePhaseError } from "../../errors/phase-error";
import { StateMetadata } from "./meta-state-types";
import phaseRegistry from "./phase-registry";

/**
 * Process phases for a ramping process
 */
export class PhaseProcessor {
  private static instance: PhaseProcessor;
  private retriesMap = new Map<string, number>();
  private readonly MAX_RETRIES = 8;
  private readonly MAX_EXECUTION_TIME_MS = 10 * 60 * 1000; // 10 minutes
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
   * Process a ramping process
   * @param rampId The ID of the ramping process
   */
  public async processRamp(rampId: string): Promise<void> {
    return runWithRampContext(rampId, async () => {
      const state = await RampState.findByPk(rampId);
      if (!state) {
        throw new APIError({
          message: `Ramp with ID ${rampId} not found`,
          status: httpStatus.NOT_FOUND
        });
      }

      if (state.flowVariant !== config.flowVariant) {
        logger.warn(
          `Refusing to process ramp ${rampId}: belongs to flow ${state.flowVariant}, this backend is ${config.flowVariant}`
        );
        return;
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
    });
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
          lockedAt: new Date()
        }
      },
      { where: { id: state.id } }
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
            lockedAt: null
          }
        },
        { where: { id: state.id } }
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
   * Resolve the next phase for a ramp.
   *
   * If the handler explicitly changed the phase (short-circuit override), honor it.
   * Otherwise, if a phaseFlow is defined, advance to the next phase in the sequence.
   * If no phaseFlow exists (legacy ramp), return the handler's result as-is.
   */
  private resolveNextPhase(originalPhase: RampPhase, handlerResult: RampState, state: RampState): RampPhase {
    // Handler explicitly changed the phase (short-circuit override) — honor it
    if (handlerResult.currentPhase !== originalPhase) {
      return handlerResult.currentPhase;
    }

    const phaseFlow = (state.state as StateMetadata).phaseFlow;

    // Legacy ramp without phaseFlow — handler must set the next phase
    if (!phaseFlow) {
      return handlerResult.currentPhase;
    }

    // Flow-driven routing — advance to the next phase in the sequence
    const currentIndex = phaseFlow.indexOf(originalPhase);
    if (currentIndex === -1) {
      throw new Error(`PhaseProcessor: Phase "${originalPhase}" not found in phaseFlow for ramp ${state.id}`);
    }
    if (currentIndex >= phaseFlow.length - 1) {
      throw new Error(
        `PhaseProcessor: Phase "${originalPhase}" is the last phase in phaseFlow but not terminal for ramp ${state.id}`
      );
    }

    return phaseFlow[currentIndex + 1];
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

      // Execute the phase with a maximum waiting time
      // If the phase execution exceeds this time, we consider it a timeout and handle it as a recoverable error.
      const maxExecuteTime = this.MAX_EXECUTION_TIME_MS;
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new RecoverablePhaseError("Phase execution timed out"));
        }, maxExecuteTime);
      });

      const pendingState = await Promise.race([handler.execute(state), timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
      });

      // Resolve the next phase: handler short-circuit > explicit flow > handler-driven (legacy)
      const nextPhase = this.resolveNextPhase(currentPhase, pendingState, state);

      const phaseHistory =
        nextPhase !== pendingState.currentPhase
          ? [...pendingState.phaseHistory, { phase: nextPhase, timestamp: new Date() }]
          : pendingState.phaseHistory;

      // Single source of authority for phase transitions.
      // Persist only the phase-related fields on the original persisted instance
      // to avoid inserting new records or clobbering unrelated columns.
      const updatedState = await state.update(
        { currentPhase: nextPhase, phaseHistory },
        { fields: ["currentPhase", "phaseHistory"] }
      );

      // If the phase has changed, process the next phase
      // except for complete or fail phases which are terminal.
      if (
        updatedState.currentPhase !== currentPhase &&
        updatedState.currentPhase !== "complete" &&
        updatedState.currentPhase !== "failed"
      ) {
        logger.info(`Phase changed from ${currentPhase} to ${updatedState.currentPhase} for ramp ${state.id}`);

        this.retriesMap.delete(state.id);

        // Process the next phase
        await this.processPhase(updatedState);
      } else if (updatedState.currentPhase === "complete") {
        logger.info(`Ramp ${state.id} completed successfully`);
        this.retriesMap.delete(state.id);
      } else if (updatedState.currentPhase === "failed") {
        logger.error(`Ramp ${state.id} failed unrecoverably, giving up.`);
        this.retriesMap.delete(state.id);
      } else {
        logger.info("Current phase must be different to updated phase for non-terminal states. This is a bug.");
        this.retriesMap.delete(state.id);
      }
    } catch (e: unknown) {
      const error = e as Error;
      const isPhaseError = error instanceof PhaseError;
      const isRecoverable = isPhaseError && error.isRecoverable;
      const minimumWaitSeconds =
        error instanceof RecoverablePhaseError ? (error as RecoverablePhaseError).minimumWaitSeconds : undefined;

      if (isRecoverable) {
        const currentRetries = this.retriesMap.get(state.id) || 0;

        // Add error to the state
        const errorLogs = [
          ...state.errorLogs,
          {
            details: error.stack || "",
            error: error.message || "Unknown error",
            isPhaseError,
            phase: state.currentPhase,
            recoverable: isRecoverable,
            timestamp: new Date().toISOString()
          }
        ];

        const errorUpdatedState = await state.update({ errorLogs });

        const phaseHandler = phaseRegistry.getHandler(state.currentPhase);
        const maxRetries = phaseHandler?.getMaxRetries?.() ?? this.MAX_RETRIES;

        if (currentRetries < maxRetries) {
          const nextRetry = currentRetries + 1;
          this.retriesMap.set(errorUpdatedState.id, nextRetry);
          const delayMs = minimumWaitSeconds ? minimumWaitSeconds * 1000 : 30 * 1000;

          logger.info(`Scheduling retry ${nextRetry}/${maxRetries} for ramp ${errorUpdatedState.id} in ${delayMs}ms`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return this.processPhase(errorUpdatedState);
        }

        logger.error(`Max retries (${maxRetries}) reached for ramp ${errorUpdatedState.id}`);
        this.retriesMap.delete(errorUpdatedState.id);
        return;
      }

      if (isPhaseError && !isRecoverable) {
        logger.error(`Ramp ${state.id} failed unrecoverably in phase ${state.currentPhase}, transitioning to failed state`);

        await state.update({ currentPhase: "failed" });
        this.retriesMap.delete(state.id);
        return;
      }

      throw error;
    }
  }
}

export default PhaseProcessor.getInstance();
