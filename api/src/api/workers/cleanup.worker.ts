import { CronJob } from 'cron';
import { CleanupPhase } from 'shared'; // <-- Import CleanupPhase
import logger from '../../config/logger';
import { BaseRampService } from '../services/ramp/base.service';
import RampState from '../../models/rampState.model';
import { postProcessHandlers, BasePostProcessHandler } from '../services/phases/post-process';

interface HandlerError {
  name: CleanupPhase; // <-- Use CleanupPhase type
  error: string;
}

/**
 * Worker to clean up expired quotes and post-process completed ramps
 */
class CleanupWorker {
  private job: CronJob;

  private readonly rampService: BaseRampService;

  constructor(cronTime = '*/5 * * * *') {
    this.rampService = new BaseRampService();

    // Run immediately and then according to schedule
    this.job = new CronJob(
      cronTime,
      this.cleanup.bind(this),
      null, // onComplete
      false, // start
      undefined, // timeZone
      null, // context
      true, // runOnInit - Run immediately on start
    );
  }

  /**
   * Start the cleanup worker
   */
  public start(): void {
    logger.info('Starting cleanup worker');
    this.job.start();
  }

  /**
   * Stop the cleanup worker
   */
  public stop(): void {
    logger.info('Stopping cleanup worker');
    this.job.stop();
  }

  /**
   * Run the cleanup process
   */
  // eslint-disable-next-line class-methods-use-this
  private async cleanup(): Promise<void> {
    logger.info('Running cleanup worker cycle');
    try {
      // Clean up expired quotes
      const expiredQuotesCount = await this.rampService.cleanupExpiredQuotes();
      if (expiredQuotesCount > 0) {
        logger.info(`Cleaned up ${expiredQuotesCount} expired quotes`);
      }

      // Post-process completed RampStates
      await this.postProcessCompletedStates();

      logger.info('Cleanup worker cycle completed');
    } catch (error) {
      logger.error('Error during cleanup worker cycle:', error);
    }
    // TODO should we remove expired quotes from the database eventually? Maybe after 1 day or so?
  }

  /**
   * Post-process RampStates that have been completed but not cleaned up yet
   */
  private async postProcessCompletedStates(): Promise<void> {
    try {
      const states = await RampState.findAll({
        where: {
          currentPhase: 'complete',
          postCompleteState: {
            cleanup: {
              cleanupCompleted: false,
            },
          },
        },
      });

      if (states.length === 0) {
        logger.info('No completed RampStates found needing post-processing.');
        return;
      }

      logger.info(`Found ${states.length} completed RampStates that need post-processing`);

      const processPromises = states.map(async (state) => {
        try {
          await this.processCleanup(state);
          return { status: 'fulfilled', stateId: state.id };
        } catch (error) {
          logger.error(`Error processing cleanup for state ${state.id}:`, error);
          // Don't update the state here, processCleanup handles its own updates
          return { status: 'rejected', stateId: state.id, reason: error };
        }
      });

      // Use allSettled to allow individual state processing to fail without stopping others
      const results = await Promise.allSettled(processPromises);
      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - successful;
      logger.info(
        `Post-processing attempt completed for ${states.length} states. Successful: ${successful}, Failed: ${failed}`,
      );
    } catch (error) {
      logger.error('Error fetching states in postProcessCompletedStates:', error);
    }
  }

  /**
   * Process a single state with appropriate cleanup handlers
   * @param state The state to process
   */
  // eslint-disable-next-line class-methods-use-this
  private async processCleanup(state: RampState): Promise<void> {
    // Identify which handlers should process this state
    const applicableHandlers = postProcessHandlers.filter((handler) => handler.shouldProcess(state));

    if (applicableHandlers.length === 0) {
      logger.info(`No applicable cleanup handlers for state ${state.id}. Marking as complete.`);
      // Mark as complete if no handlers apply
      await RampState.update(
        {
          postCompleteState: {
            ...state.postCompleteState,
            cleanup: {
              ...(state.postCompleteState?.cleanup || {}), // Ensure cleanup object exists
              cleanupCompleted: true,
              cleanupAt: new Date(),
              errors: null,
            },
          },
        },
        { where: { id: state.id } },
      );
      return;
    }

    logger.info(`Found ${applicableHandlers.length} applicable cleanup handlers for state ${state.id}`);

    const currentErrors: HandlerError[] = state.postCompleteState?.cleanup?.errors || [];
    let handlersToRun: BasePostProcessHandler[];

    // If there are existing errors, only retry the handlers that failed previously.
    // Otherwise, run all applicable handlers.
    if (currentErrors.length > 0) {
      const failedHandlerNames = new Set(currentErrors.map((err) => err.name));
      handlersToRun = applicableHandlers.filter((handler) => failedHandlerNames.has(handler.getCleanupName()));
      logger.info(`Retrying ${handlersToRun.length} previously failed handlers for state ${state.id}`);
      if (handlersToRun.length === 0) {
        logger.warn(`State ${state.id} has errors, but no matching applicable handlers found for retry.`);
        // Decide if we should mark complete or leave as is. Leaving as is for now.
        return;
      }
    } else {
      handlersToRun = applicableHandlers;
    }

    // Process handlers concurrently
    const handlerPromises = handlersToRun.map(async (handler) => {
      const handlerName = handler.getCleanupName();
      logger.info(`Processing state ${state.id} with handler ${handler.constructor.name}`);
      try {
        const [success, error] = await handler.process(state);
        if (!success) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error during handler processing';
          logger.error(`Handler ${handler.constructor.name} failed for state ${state.id}: ${errorMessage}`);
          return { status: 'rejected', name: handlerName, error: errorMessage };
        }
        logger.info(`Handler ${handler.constructor.name} succeeded for state ${state.id}`);
        return { status: 'fulfilled', name: handlerName };
      } catch (processError: any) {
        const errorMessage =
          processError instanceof Error ? processError.message : 'Exception during handler processing';
        logger.error(`Exception in handler ${handler.constructor.name} for state ${state.id}:`, processError);
        // Ensure handlerName retains CleanupPhase type
        return { status: 'rejected', name: handlerName as CleanupPhase, error: errorMessage };
      }
    });

    const results = await Promise.allSettled(handlerPromises);

    // Aggregate results and update state
    const finalErrors = [...currentErrors]; // Start with existing errors
    // The 'allSuccessfulThisRun' variable is not needed as completion is determined by finalErrors.length

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        // Remove error if handler succeeded this time
        const index = finalErrors.findIndex((err) => err.name === result.value.name);
        if (index > -1) {
          finalErrors.splice(index, 1);
        }
      } else {
        // status === 'rejected'
        // Explicitly type the reason object to ensure name is CleanupPhase
        const failedHandler = result.reason as { name: CleanupPhase; error: string };
        // Add or update error entry
        const existingErrorIndex = finalErrors.findIndex((err) => err.name === failedHandler.name);
        if (existingErrorIndex > -1) {
          finalErrors[existingErrorIndex].error = failedHandler.error; // Update error message
        } else {
          // Now failedHandler.name is correctly typed as CleanupPhase
          finalErrors.push({ name: failedHandler.name, error: failedHandler.error });
        }
      }
    });

    // Determine overall completion status
    // It's complete only if all *applicable* handlers succeeded *eventually* (i.e., no errors remain)
    const cleanupCompleted = finalErrors.length === 0;

    // Update the state
    await RampState.update(
      {
        postCompleteState: {
          ...state.postCompleteState,
          cleanup: {
            ...(state.postCompleteState?.cleanup || {}), // Ensure cleanup object exists
            cleanupCompleted,
            cleanupAt: new Date(), // Update timestamp on every attempt
            errors: finalErrors.length > 0 ? finalErrors : null,
          },
        },
      },
      { where: { id: state.id } },
    );

    if (cleanupCompleted) {
      logger.info(`All cleanup handlers successful for state ${state.id}, marked cleanup as complete`);
    } else {
      logger.warn(
        `Some cleanup handlers failed for state ${state.id}. Errors: ${JSON.stringify(
          finalErrors,
        )}. Will retry on next cycle.`,
      );
    }
  }
}

export default CleanupWorker;
