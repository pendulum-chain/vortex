import { CronJob } from "cron";
import { Op } from "sequelize";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import { refreshAlfredpayCustomerStatus } from "../services/alfredpay/alfredpay-customer.service";

const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
// Each account costs two to three Alfredpay calls (submission-id resolution, then status),
// so the sweep is bounded rather than sized by whatever the query happens to return.
const MAX_ACCOUNTS_PER_CYCLE = 250;

/**
 * The only background watcher of Alfredpay verification outcomes. Unlike Avenia there is no
 * webhook to fall back on — Alfredpay publishes no verification events — so this is the
 * primary path, not a reconciliation net, for every user who does not reopen the dashboard.
 *
 * It only drives `refreshAlfredpayCustomerStatus`, which is where the outcome is persisted
 * and the email queued; the dashboard's on-demand refresh calls the same function, so an
 * account decided while the user was watching is mailed by that path instead and is already
 * terminal by the time this sweep next runs.
 *
 * Double-sending is impossible: enqueuing is keyed on the Alfredpay submission id, so a
 * sweep racing or repeating a dashboard refresh is a no-op.
 */
class AlfredpayStatusWorker {
  private job: CronJob;

  constructor(cronTime = "15 * * * *") {
    this.job = new CronJob(cronTime, this.poll.bind(this), null, false, "UTC", null, true);
  }

  public start(): void {
    logger.info("Starting Alfredpay status worker");
    this.job.start();
  }

  public stop(): void {
    logger.info("Stopping Alfredpay status worker");
    this.job.stop();
  }

  // eslint-disable-next-line class-methods-use-this
  private async poll(): Promise<void> {
    try {
      const pending = await ProviderCustomer.findAll({
        // Partner-owned entities have no profile to email, and each account here costs
        // provider calls — so they are excluded by the query rather than skipped in the loop.
        include: [
          {
            as: "customerEntity",
            attributes: [],
            model: CustomerEntity,
            required: true,
            where: { profileId: { [Op.not]: null } }
          }
        ],
        limit: MAX_ACCOUNTS_PER_CYCLE,
        // Most-recently-touched first: an account that just moved is the one most likely to
        // be mid-decision, and the one a truncated cycle can least afford to defer.
        order: [["updatedAt", "DESC"]],
        where: {
          provider: "alfredpay",
          status: { [Op.notIn]: [VerificationStatus.Approved, VerificationStatus.Rejected] },
          // An account abandoned mid-wizard stays non-terminal forever; without this bound the
          // sweep would re-poll every one of them for the life of the deployment.
          updatedAt: { [Op.gte]: new Date(Date.now() - MAX_AGE_MS) }
        }
      });

      if (pending.length === 0) {
        return;
      }

      logger.info(`Checking Alfredpay verification status for ${pending.length} account(s)`);
      if (pending.length === MAX_ACCOUNTS_PER_CYCLE) {
        logger.warn(
          `Alfredpay status sweep hit its ${MAX_ACCOUNTS_PER_CYCLE}-account cap; the remainder waits for the next cycle`
        );
      }

      for (const customer of pending) {
        // Best-effort per account: refreshAlfredpayCustomerStatus swallows provider failures
        // and leaves the stored status untouched, so one bad account cannot end the cycle.
        await refreshAlfredpayCustomerStatus(customer);
      }
    } catch (error) {
      const errorDetails = error instanceof Error ? (error.stack ?? error.message) : String(error);
      logger.error(`Error during Alfredpay status worker cycle: ${errorDetails}`);
    }
  }
}

export default AlfredpayStatusWorker;
