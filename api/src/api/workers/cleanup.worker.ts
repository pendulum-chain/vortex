import logger from '../../config/logger';
import quoteService from '../services/ramp/quote.service';
import { BaseRampService } from '../services/ramp/base.service';
import RampState from '../../models/rampState.model';
import { postProcessHandlers } from '../services/phases/post-process';

/**
 * Worker to clean up expired quotes
 */
export class CleanupWorker {
  private readonly rampService: BaseRampService;

  private readonly intervalMs: number;

  private interval: NodeJS.Timeout | null = null;

  constructor(intervalMs = 60000) {
    // Default to 1 minute
    this.rampService = new BaseRampService();
    this.intervalMs = intervalMs;
  }

  /**
   * Start the cleanup worker
   */
  public start(): void {
    if (this.interval) {
      return;
    }

    logger.info('Starting cleanup worker');

    this.interval = setInterval(async () => {
      try {
        await this.cleanup();
      } catch (error) {
        logger.error('Error in cleanup worker:', error);
      }
    }, this.intervalMs);
  }

  /**
   * Stop the cleanup worker
   */
  public stop(): void {
    if (!this.interval) {
      return;
    }

    logger.info('Stopping cleanup worker');

    clearInterval(this.interval);
    this.interval = null;
  }

  /**
   * Run the cleanup process
   */
  private async cleanup(): Promise<void> {
    // Clean up expired quotes
    const expiredQuotesCount = await this.rampService.cleanupExpiredQuotes();
    if (expiredQuotesCount > 0) {
      logger.info(`Cleaned up ${expiredQuotesCount} expired quotes`);
    }

    // Post-process completed RampStates
    await this.postProcessCompletedStates();

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
        return;
      }

      logger.info(`Found ${states.length} completed RampStates that need post-processing`);

      const processPromises = states.map(async (state) => {
        try {
          await this.processCleanup(state);
        } catch (error) {
          logger.error(`Error post-processing state ${state.id}:`, error);
        }
      });

      await Promise.all(processPromises);
    } catch (error) {
      logger.error('Error in postProcessCompletedStates:', error);
    }
  }

  /**
   * Process a state with appropriate cleanup handlers
   * @param state The state to process
   */
  private async processCleanup(state: RampState): Promise<void> {
    // Identify which handlers should process this state
    const applicableHandlers = postProcessHandlers.filter((handler) => handler.shouldProcess(state));
    
    if (applicableHandlers.length === 0) {
      logger.info(`No applicable cleanup handlers for state ${state.id}`);
      return;
    }

    logger.info(`Found ${applicableHandlers.length} applicable cleanup handlers for state ${state.id}`);

    const currentErrors = state.postCompleteState.cleanup.errors || [];
    let updatedErrors = [...currentErrors];
    let allSuccessful = true;

    // If there are errors, remove from applicable those that are NOT in the current errors.
    // We will retry only the ones that failed
    const filteredApplicableHandlers = currentErrors.length > 0 ? applicableHandlers.filter((handler) =>
      currentErrors.some((error) => error.name === handler.getCleanupName()),
    ) : applicableHandlers;

    // Process each handler
    for (const handler of filteredApplicableHandlers) {
      const handlerName = handler.getCleanupName();
      logger.info(`Processing state ${state.id} with handler ${handler.constructor.name}`);

      // Process with this handler
      const [success, error] = await handler.process(state);

      if (!success) {
        allSuccessful = false;

        // Add or update error entry
        const errorMessage = error ? error.message : 'Unknown error';
        const newError = { name: handlerName, error: errorMessage };

        updatedErrors = updatedErrors.filter((err) => err.name !== handlerName);
        updatedErrors.push(newError);

        logger.error(`Handler ${handler.constructor.name} failed for state ${state.id}: ${errorMessage}`);
      } else {
        // Remove any existing error for this handler on success, if it exists there.
        updatedErrors = updatedErrors.filter((err) => err.name !== handlerName);
        logger.info(`Handler ${handler.constructor.name} succeeded for state ${state.id}`);
      }
    }

    // Update the state with the results
    await RampState.update(
      {
        postCompleteState: {
          ...state.postCompleteState,
          cleanup: {
            ...state.postCompleteState.cleanup,
            cleanupCompleted: allSuccessful,
            cleanupAt: new Date(),
            errors: updatedErrors.length > 0 ? updatedErrors : null,
          },
        },
      },
      { where: { id: state.id } },
    );

    if (allSuccessful) {
      logger.info(`All cleanup handlers successful for state ${state.id}, marked cleanup as complete`);
    } else {
      logger.warn(`Some cleanup handlers failed for state ${state.id}, will retry on next cycle`);
    }
  }
}

export default new CleanupWorker();
