import { CronJob } from 'cron';
import { Op } from 'sequelize';
import { RampErrorLog } from 'shared';
import logger from '../../config/logger';
import RampState from '../../models/rampState.model';
import phaseProcessor from '../services/phases/phase-processor';
import rampService from '../services/ramp/ramp.service';

const TEN_MINUTES_IN_MS = 10 * 60 * 1000;

/**
 * Worker to recover failed ramp states
 */
class RampRecoveryWorker {
  private job: CronJob;

  constructor(cronTime = '*/5 * * * *') {
    // Run immediately and then according to schedule
    this.job = new CronJob(
      cronTime,
      this.recover.bind(this),
      null, // onComplete
      false, // start
      undefined, // timeZone
      null, // context
      true, // runOnInit - This makes it run immediately
    );
  }

  /**
   * Start the worker
   */
  public start(): void {
    logger.info('Starting ramp recovery worker');
    this.job.start();
  }

  /**
   * Stop the worker
   */
  public stop(): void {
    logger.info('Stopping ramp recovery worker');
    this.job.stop();
  }

  /**
   * Recover failed ramp states
   */
  // eslint-disable-next-line class-methods-use-this
  private async recover(): Promise<void> {
    try {
      logger.info('Running ramp recovery worker');

      // Find ramp states that have not been updated in the last 10 minutes
      // and are not in the 'complete' phase
      const staleStates = await RampState.findAll({
        where: {
          currentPhase: {
            [Op.ne]: 'complete',
          },
          updatedAt: {
            [Op.lt]: new Date(Date.now() - TEN_MINUTES_IN_MS), // 10 minutes ago
          },
          presignedTxs: { [Op.not]: null },
        },
      });

      if (staleStates.length === 0) {
        logger.info('No stale ramp states found.');
        return;
      }

      logger.info(`Found ${staleStates.length} stale ramp states to process.`);

      // Process each stale state concurrently
      const recoveryPromises = staleStates.map(async (state) => {
        try {
          logger.info(`Attempting recovery for ramp state ${state.id} in phase ${state.currentPhase}`);
          // Process the state
          await phaseProcessor.processRamp(state.id);
          logger.info(`Successfully processed ramp state ${state.id}`);
          return { status: 'fulfilled', stateId: state.id };
        } catch (error: any) {
          logger.error(`Error recovering ramp state ${state.id}:`, error);

          // Prepare error log entry
          const errorLogEntry: RampErrorLog = {
            phase: state.currentPhase,
            timestamp: new Date().toISOString(),
            error: error.message || 'Unknown error during recovery',
            details: error.stack || 'No stack trace available',
          };

          // Attempt to update the state with the error log
          try {
            await rampService.appendErrorLog(state.id, errorLogEntry);
            logger.info(`Updated ramp state ${state.id} with error log.`);
          } catch (updateError: any) {
            logger.error(`Failed to update ramp state ${state.id} with error log:`, updateError);
            // Log the original error as well if the update fails
            logger.error(`Original recovery error for state ${state.id}:`, error);
          }
          // Return a rejected status for Promise.allSettled
          return { status: 'rejected', stateId: state.id, reason: error };
        }
      });

      // Wait for all recovery attempts to settle
      const results = await Promise.allSettled(recoveryPromises);

      // Log summary of results
      const successfulRecoveries = results.filter((r) => r.status === 'fulfilled').length;
      const failedRecoveries = results.length - successfulRecoveries;
      logger.info(`Ramp recovery attempt completed. Successful: ${successfulRecoveries}, Failed: ${failedRecoveries}`);
    } catch (error) {
      // Catch errors from the initial findAll or other unexpected issues
      logger.error('Critical error in ramp recovery worker:', error);
    }
  }
}

export default RampRecoveryWorker;
