import logger from '../../config/logger';
import quoteService from '../services/ramp/quote.service';
import { BaseRampService } from '../services/ramp/base.service';

/**
 * Worker to clean up expired quotes and idempotency keys
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
    // TOOD should we remove expired quotes from the database eventually? Maybe after 1 day or so?

    // Clean up expired idempotency keys
    const expiredKeysCount = await this.rampService.cleanupExpiredIdempotencyKeys();
    if (expiredKeysCount > 0) {
      logger.info(`Cleaned up ${expiredKeysCount} expired idempotency keys`);
    }
  }
}

export default new CleanupWorker();
