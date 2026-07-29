import { CronJob } from "cron";
import logger from "../../config/logger";
import { dispatchPendingNotifications } from "../services/email";

/**
 * Sends queued email notifications and retries the ones that failed.
 * The notifications table is the only send path, so a lost in-process call
 * cannot lose a user-facing email.
 */
class NotificationDispatchWorker {
  private job: CronJob;

  constructor(cronTime = "* * * * *") {
    this.job = new CronJob(cronTime, this.dispatch.bind(this), null, false, "UTC", null, true);
  }

  public start(): void {
    logger.info("Starting notification dispatch worker");
    this.job.start();
  }

  public stop(): void {
    logger.info("Stopping notification dispatch worker");
    this.job.stop();
  }

  // eslint-disable-next-line class-methods-use-this
  private async dispatch(): Promise<void> {
    try {
      await dispatchPendingNotifications();
    } catch (error) {
      const errorDetails = error instanceof Error ? (error.stack ?? error.message) : String(error);
      logger.error(`Error during notification dispatch cycle: ${errorDetails}`);
    }
  }
}

export default NotificationDispatchWorker;
