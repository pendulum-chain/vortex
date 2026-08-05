import { BrlaApiService } from "@vortexfi/shared";
import { CronJob } from "cron";
import { Op } from "sequelize";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import KycCase from "../../models/kycCase.model";
import { VerificationStatus } from "../../models/providerCustomer.model";
import { enqueueVerificationNotification } from "../services/avenia/verification-notifications";

const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Reconciliation safety net behind the Avenia webhook receiver, which is the primary
 * path for both KYC and KYB outcomes.
 *
 * It exists because Avenia documents no KYB subscription: company attempts are only
 * expected to arrive over the wildcard subscription because they share the attempts
 * resource with KYC, and that is unconfirmed. If they do not arrive, this poll is what
 * still sends the email. Retire it once company events are observed on the webhook.
 *
 * Double-sending is impossible: enqueuing is keyed on the attempt id, so a poll that
 * races or repeats a webhook is a no-op.
 *
 * Polls the attempt recorded at initiation rather than listing the subaccount's
 * attempts: the list endpoint returns no documented ordering, so picking one from it
 * would guess at both the level and the newest entry.
 */
class KybStatusWorker {
  private job: CronJob;

  constructor(cronTime = "0 * * * *") {
    this.job = new CronJob(cronTime, this.poll.bind(this), null, false, "UTC", null, true);
  }

  public start(): void {
    logger.info("Starting KYB status worker");
    this.job.start();
  }

  public stop(): void {
    logger.info("Stopping KYB status worker");
    this.job.stop();
  }

  // eslint-disable-next-line class-methods-use-this
  private async poll(): Promise<void> {
    try {
      const pending = await KycCase.findAll({
        include: [{ as: "customerEntity", model: CustomerEntity, required: true }],
        where: {
          provider: "avenia",
          providerCaseId: { [Op.not]: null },
          status: { [Op.notIn]: [VerificationStatus.Approved, VerificationStatus.Rejected] },
          type: "kyb",
          // The case row is reused across attempts (re-initiation rebinds it to a fresh
          // attempt id), so its creation date says nothing about the attempt being polled.
          // Bounding on the last write keeps a resumed attempt in scope no matter how old
          // the row is, which is exactly when the webhook fallback has to work.
          updatedAt: { [Op.gte]: new Date(Date.now() - MAX_AGE_MS) }
        }
      });

      if (pending.length === 0) {
        return;
      }

      logger.info(`Checking KYB status for ${pending.length} company account(s)`);

      const brlaApiService = BrlaApiService.getInstance();

      for (const kycCase of pending) {
        try {
          // Partner-owned entities have no profile to email.
          const profileId = kycCase.customerEntity?.profileId;
          if (!profileId) {
            continue;
          }

          // Non-null by the providerCaseId filter in the query above.
          const { attempt } = await brlaApiService.getKybAttemptStatus(kycCase.providerCaseId as string);
          if (!attempt) {
            continue;
          }

          await enqueueVerificationNotification(attempt, profileId, "business");
        } catch (error) {
          logger.error(`Error checking KYB status for attempt ${kycCase.providerCaseId}: ${error}`);
        }
      }
    } catch (error) {
      const errorDetails = error instanceof Error ? (error.stack ?? error.message) : String(error);
      logger.error(`Error during KYB status worker cycle: ${errorDetails}`);
    }
  }
}

export default KybStatusWorker;
