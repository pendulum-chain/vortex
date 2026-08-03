import { CronJob } from "cron";
import logger from "../../config/logger";
import { dispatchPendingNotifications, reconcileMissedRampCompletedEmails } from "../services/email";

/**
 * Sends queued email notifications and retries the ones that failed.
 * The notifications table is the only send path, so a lost in-process call
 * cannot lose a user-facing email.
 *
 * The hourly reconcile closes the one gap the table cannot close by itself: enqueuing at
 * ramp completion is not atomic with the phase write, so a row that was never written has
 * to be recovered from the completed ramps themselves.
 */
class NotificationDispatchWorker {
  private dispatchJob: CronJob;

  private reconcileJob: CronJob;

  constructor(dispatchCronTime = "* * * * *", reconcileCronTime = "15 * * * *") {
    this.dispatchJob = new CronJob(dispatchCronTime, this.dispatch.bind(this), null, false, "UTC", null, true);
    this.reconcileJob = new CronJob(reconcileCronTime, this.reconcile.bind(this), null, false, "UTC", null, true);
  }

  public start(): void {
    logger.info("Starting notification dispatch worker");
    this.dispatchJob.start();
    this.reconcileJob.start();
  }

  public stop(): void {
    logger.info("Stopping notification dispatch worker");
    this.dispatchJob.stop();
    this.reconcileJob.stop();
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

  // eslint-disable-next-line class-methods-use-this
  private async reconcile(): Promise<void> {
    try {
      await reconcileMissedRampCompletedEmails();
    } catch (error) {
      const errorDetails = error instanceof Error ? (error.stack ?? error.message) : String(error);
      logger.error(`Error during completion email reconciliation cycle: ${errorDetails}`);
    }
  }
}

export default NotificationDispatchWorker;
