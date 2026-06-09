import { CronJob } from "cron";
import logger from "../../config/logger";
import { ApiClientEventsRetentionService } from "../services/api-client-events-retention.service";

class ApiClientEventsRetentionWorker {
  private job: CronJob;

  private readonly retentionService: ApiClientEventsRetentionService;

  constructor(cronTime = "5 0 * * *") {
    this.retentionService = new ApiClientEventsRetentionService();
    this.job = new CronJob(cronTime, this.cleanup.bind(this), null, false, "UTC", null, true);
  }

  public start(): void {
    logger.info("Starting API client events retention worker");
    this.job.start();
  }

  public stop(): void {
    logger.info("Stopping API client events retention worker");
    this.job.stop();
  }

  private async cleanup(): Promise<void> {
    logger.info("Running API client events retention worker cycle");

    try {
      const deletedEventsCount = await this.retentionService.cleanupExpiredEvents();
      if (deletedEventsCount > 0) {
        logger.info(`Deleted ${deletedEventsCount} expired API client events`);
      }

      logger.info("API client events retention worker cycle completed");
    } catch (error) {
      logger.error("Error during API client events retention worker cycle:", error);
    }
  }
}

export default ApiClientEventsRetentionWorker;
