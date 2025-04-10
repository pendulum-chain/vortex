import { CronJob } from 'cron';
import { Op } from 'sequelize';
import RampState from '../../models/rampState.model';
import logger from '../../config/logger';
import phaseProcessor from '../services/phases/phase-processor';

/**
 * Worker to recover failed ramp states
 */
class RampRecoveryWorker {
  private job: CronJob;

  constructor() {
    // Run every 5 minutes
    this.job = new CronJob('*/5 * * * *', this.recover.bind(this));
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
            [Op.lt]: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
          },
          presignedTxs: {[Op.not]: null},
        },
      });

      logger.info(`Found ${staleStates.length} stale ramp states`);

      // Process each stale state
      for (const state of staleStates) {
        try {
          logger.info(`Recovering ramp state ${state.id} in phase ${state.currentPhase}`);

          // Process the state
          await phaseProcessor.processRamp(state.id);
        } catch (error: any) {
          logger.error(`Error recovering ramp state ${state.id}:`, error);

          // Add error to the state
          const errorLogs = [
            ...(state.errorLogs || []),
            {
              phase: state.currentPhase,
              timestamp: new Date().toISOString(),
              error: error.message || 'Unknown error',
              details: error.stack || {},
            },
          ];

          await state.update({ errorLogs });
        }
      }

      logger.info('Ramp recovery worker completed');
    } catch (error) {
      logger.error('Error in ramp recovery worker:', error);
    }
  }
}

export default new RampRecoveryWorker();
