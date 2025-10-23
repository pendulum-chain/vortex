import { CronJob } from "cron";
import { Op } from "sequelize";
import logger from "../../config/logger";
import RampState from "../../models/rampState.model";
import { postProcessHandlers } from "../services/phases/post-process";
import { BaseRampService } from "../services/ramp/base.service";

/**
 * Worker to delete expired quotes and post-process completed ramps
 */
class CleanupWorker {
  private job: CronJob;

  private readonly rampService: BaseRampService;

  constructor(cronTime = "*/5 * * * *") {
    this.rampService = new BaseRampService();

    // Run immediately and then according to schedule
    this.job = new CronJob(
      cronTime,
      this.cleanup.bind(this),
      null, // onComplete
      false, // start
      undefined, // timeZone
      null, // context
      true // runOnInit - Run immediately on start
    );
  }

  /**
   * Start the cleanup worker
   */
  public start(): void {
    logger.info("Starting cleanup worker");
    this.job.start();
  }

  /**
   * Stop the cleanup worker
   */
  public stop(): void {
    logger.info("Stopping cleanup worker");
    this.job.stop();
  }

  /**
   * Process a single state with appropriate cleanup handlers
   * @param state The state to process
   */
  protected async processCleanup(state: RampState): Promise<void> {
    // Identify which handlers should process this state
    const applicableHandlers = postProcessHandlers.filter(handler => handler.shouldProcess(state));

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
    const filteredApplicableHandlers =
      currentErrors.length > 0
        ? applicableHandlers.filter(handler => currentErrors.some(error => error.name === handler.getCleanupName()))
        : applicableHandlers;

    // Process each handler
    for (const handler of filteredApplicableHandlers) {
      const handlerName = handler.getCleanupName();
      logger.info(`Processing state ${state.id} with handler ${handler.constructor.name}`);

      // Process with this handler
      const [success, error] = await handler.process(state);

      if (!success) {
        allSuccessful = false;

        // Add or update error entry
        const errorMessage = error ? error.message : "Unknown error";
        const newError = { error: errorMessage, name: handlerName };

        updatedErrors = updatedErrors.filter(err => err.name !== handlerName);
        updatedErrors.push(newError);

        logger.error(`Handler ${handler.constructor.name} failed for state ${state.id}: ${errorMessage}`);
      } else {
        // Remove any existing error for this handler on success, if it exists there.
        updatedErrors = updatedErrors.filter(err => err.name !== handlerName);
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
            cleanupAt: new Date(),
            cleanupCompleted: allSuccessful,
            errors: updatedErrors.length > 0 ? updatedErrors : null
          }
        }
      },
      { where: { id: state.id } }
    );

    if (allSuccessful) {
      logger.info(`All cleanup handlers successful for state ${state.id}, marked cleanup as complete`);
    } else {
      logger.warn(`Some cleanup handlers failed for state ${state.id}, will retry on next cycle`);
    }
  }

  /**
   * Run the cleanup process
   */
  // eslint-disable-next-line class-methods-use-this
  private async cleanup(): Promise<void> {
    logger.info("Running cleanup worker cycle");
    try {
      // Delete expired quotes
      const expiredQuotesCount = await this.rampService.cleanupExpiredQuotes();
      if (expiredQuotesCount > 0) {
        logger.info(`Deleted ${expiredQuotesCount} expired quotes`);
      }

      // Post-process completed RampStates
      await this.postProcessCompletedStates();

      logger.info("Cleanup worker cycle completed");
    } catch (error) {
      logger.error("Error during cleanup worker cycle:", error);
    }
  }

  /**
   * Post-process RampStates that have been completed but not cleaned up yet
   */
  private async postProcessCompletedStates(): Promise<void> {
    try {
      const states = await RampState.findAll({
        limit: 5,
        order: [["updatedAt", "DESC"]],
        where: {
          currentPhase: "complete",
          from: {
            [Op.ne]: "sepa" // Exclude SEPA onramp states as the ephemerals are not cleaned up.
          },
          postCompleteState: {
            cleanup: {
              cleanupCompleted: false
            }
          }
        }
      });

      if (states.length === 0) {
        logger.info("No completed RampStates found needing post-processing.");
        return;
      }

      logger.info(`Found ${states.length} completed RampStates that need post-processing`);

      const processPromises = states.map(async state => {
        try {
          await this.processCleanup(state);
          return { stateId: state.id, status: "fulfilled" };
        } catch (error) {
          logger.error(`Error processing cleanup for state ${state.id}:`, error);
          // Don't update the state here, processCleanup handles its own updates
          return { reason: error, stateId: state.id, status: "rejected" };
        }
      });

      // Use allSettled to allow individual state processing to fail without stopping others
      const results = await Promise.allSettled(processPromises);
      const successful = results.filter(r => r.status === "fulfilled").length;
      const failed = results.length - successful;
      logger.info(
        `Post-processing attempt completed for ${states.length} states. Successful: ${successful}, Failed: ${failed}`
      );
    } catch (error) {
      logger.error("Error fetching states in postProcessCompletedStates:", error);
    }
  }
}

export default CleanupWorker;
