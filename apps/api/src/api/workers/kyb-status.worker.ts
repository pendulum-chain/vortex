import { BrlaApiService } from "@vortexfi/shared";
import { CronJob } from "cron";
import { literal, Op } from "sequelize";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import { NotificationProvider } from "../../models/emailNotification.model";
import KycCase from "../../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import { enqueueVerificationNotification } from "../services/avenia/verification-notifications";

const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_CASES_PER_CYCLE = 250;

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

  // Keyset cursor: null selects from the top; set only when a cycle filled its cap, so
  // the next cycle continues behind the last row instead of re-taking the same prefix.
  private cursorId: string | null = null;

  constructor(cronTime = "0 * * * *") {
    this.job = CronJob.from({
      cronTime,
      onTick: this.poll.bind(this),
      start: false,
      timeZone: "UTC",
      waitForCompletion: true
    });
  }

  public start(): void {
    logger.info("Starting KYB status worker");
    this.job.start();
  }

  public stop(): void {
    logger.info("Stopping KYB status worker");
    this.job.stop();
  }

  private async poll(): Promise<void> {
    try {
      const pending = await KycCase.findAll({
        include: [
          {
            as: "customerEntity",
            model: CustomerEntity,
            required: true,
            // Partner-owned entities have no profile to email. Filtered in the join, not
            // after the fetch, so they cannot occupy the batch's slots.
            where: { profileId: { [Op.not]: null } }
          },
          {
            as: "providerCustomer",
            model: ProviderCustomer,
            required: true,
            where: {
              customerType: "business",
              provider: "avenia",
              providerSubaccountId: { [Op.not]: null }
            }
          }
        ],
        limit: MAX_CASES_PER_CYCLE,
        // Walk a stable keyset: a poll does not modify a still-pending case, so a plain
        // oldest-first prefix would re-select the same rows every cycle and starve the
        // rest whenever more than one batch is pending.
        order: [["id", "ASC"]],
        where: {
          ...(this.cursorId ? { id: { [Op.gt]: this.cursorId } } : {}),
          // An attempt whose outcome is already queued (webhook or an earlier poll) is
          // settled for this worker's purpose. Without the anti-join every settled case
          // costs one Avenia request per hour until it ages out of the window, since
          // nothing here writes the terminal status back to kyc_cases.
          [Op.and]: literal(`NOT EXISTS (
            SELECT 1
            FROM email_notifications
            WHERE provider = '${NotificationProvider.Avenia}'
              AND resource_id = "KycCase"."provider_case_id"
          )`),
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

      this.cursorId = pending.length === MAX_CASES_PER_CYCLE ? (pending.at(-1)?.id ?? null) : null;

      if (pending.length === 0) {
        return;
      }

      if (pending.length === MAX_CASES_PER_CYCLE) {
        logger.info(`KYB status sweep hit its ${MAX_CASES_PER_CYCLE}-case cap; the keyset scan continues next cycle`);
      }

      logger.info(`Checking KYB status for ${pending.length} company account(s)`);

      const brlaApiService = BrlaApiService.getInstance();

      for (const kycCase of pending) {
        try {
          // Non-null by the join filter above; kept for type narrowing.
          const profileId = kycCase.customerEntity?.profileId;
          const subAccountId = kycCase.providerCustomer?.providerSubaccountId;
          if (!profileId || !subAccountId) {
            continue;
          }

          // Non-null by the providerCaseId filter in the query above.
          const { attempt } = await brlaApiService.getKybAttemptStatus(kycCase.providerCaseId as string, subAccountId);
          if (!attempt) {
            continue;
          }

          // Mirror the authenticated route's mismatch guard: a malformed provider response
          // must not enqueue another attempt's outcome (and reason) for this case's profile.
          if (attempt.id !== kycCase.providerCaseId) {
            logger.error(`Avenia returned attempt ${attempt.id} when asked for ${kycCase.providerCaseId}; skipping`);
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
