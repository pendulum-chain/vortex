import { CronJob } from "cron";
import logger from "../../config/logger";
import { dispatchDueWebhookDeliveries, reconcileStuckWebhookDeliveries } from "../services/webhook/webhook-outbox.service";

/**
 * Dispatches the durable webhook-delivery outbox (account-scoped event family).
 * Claim-before-send makes it safe to run on every backend sharing the database.
 */
class WebhookOutboxWorker {
  private dispatchJob: CronJob;
  private reconcileJob: CronJob;
  private running = false;

  constructor(dispatchCron = "* * * * *", reconcileCron = "10 * * * *") {
    this.dispatchJob = new CronJob(dispatchCron, this.dispatchCycle.bind(this), null, false, undefined, null, true);
    this.reconcileJob = new CronJob(reconcileCron, this.reconcileCycle.bind(this), null, false, undefined, null, false);
  }

  public start(): void {
    logger.info("Starting webhook outbox worker");
    this.dispatchJob.start();
    this.reconcileJob.start();
  }

  public stop(): void {
    logger.info("Stopping webhook outbox worker");
    this.dispatchJob.stop();
    this.reconcileJob.stop();
  }

  private async dispatchCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Drain everything currently due, one claimed batch at a time.
      while ((await dispatchDueWebhookDeliveries()) > 0) {
        // keep claiming until the due backlog is empty
      }
    } catch (error) {
      logger.error("Error during webhook outbox dispatch cycle:", error);
    } finally {
      this.running = false;
    }
  }

  private async reconcileCycle(): Promise<void> {
    try {
      await reconcileStuckWebhookDeliveries();
    } catch (error) {
      logger.error("Error during webhook outbox reconcile cycle:", error);
    }
  }
}

export default WebhookOutboxWorker;
