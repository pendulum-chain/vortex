import { RampDirection } from "@vortexfi/shared";
import { literal, Op } from "sequelize";
import logger from "../../../config/logger";
import { NotificationProvider, NotificationType } from "../../../models/emailNotification.model";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import { trimTrailingZeros } from "../phases/blocks/core/helpers";
import { enqueueNotification, recordSkippedNotification } from "./notification.service";

function getCompletedAt(rampState: RampState): string {
  const completion = [...rampState.phaseHistory].reverse().find(entry => entry.phase === "complete");
  const rawTimestamp: unknown = completion?.timestamp;
  const completedAt =
    rawTimestamp instanceof Date
      ? rawTimestamp
      : typeof rawTimestamp === "string" || typeof rawTimestamp === "number"
        ? new Date(rawTimestamp)
        : rampState.updatedAt;

  return Number.isNaN(completedAt.getTime()) ? rampState.updatedAt.toISOString() : completedAt.toISOString();
}

/**
 * Queues the ramp completion email. Only ramps a signed-in user runs for themselves get
 * one. A partner-API ramp is excluded even though it carries a userId — the credential
 * middleware fills it with the credential's linked profile, which would flood the partner
 * with one email per end-customer ramp — and the email on a ramp's additionalData belongs
 * to the partner's customer, not to us. Exclusion writes a skipped tombstone so the
 * reconcile sweep does not re-surface the ramp every hour.
 *
 * Lives here rather than on RampService because the phase processor is the only
 * place a ramp actually reaches the complete phase, and it cannot import
 * RampService without a cycle.
 */
export async function enqueueRampCompletedEmail(rampState: RampState): Promise<void> {
  if (!rampState.userId) {
    return;
  }

  const quote = await QuoteTicket.findByPk(rampState.quoteId);
  if (!quote) {
    logger.warn(`Skipping completion email for ${rampState.id}: quote ${rampState.quoteId} not found`);
    return;
  }

  if (quote.apiCredentialId) {
    await recordSkippedNotification(
      { provider: NotificationProvider.Vortex, resourceId: rampState.id, type: NotificationType.RampCompleted },
      rampState.userId,
      "Partner-API ramp: the userId is the credential's profile, not a subscribed end user"
    );
    return;
  }

  // On a buy the user pays fiat and receives the token; on a sell it is the other way
  // round. The email always reports the fiat leg as Amount and the on-chain leg as
  // Token, so which side of the quote each one reads from swaps with the direction.
  const isBuy = rampState.type === RampDirection.BUY;

  await enqueueNotification({
    payload: {
      completedAt: getCompletedAt(rampState),
      // DECIMAL(38,18) columns come back scale-padded ("1250.000000000000000000");
      // trim them the same way the quote API response does before anyone reads them.
      fiatAmount: trimTrailingZeros(isBuy ? quote.inputAmount : quote.outputAmount),
      fiatCurrency: (isBuy ? quote.inputCurrency : quote.outputCurrency).toUpperCase(),
      network: quote.network,
      rampId: rampState.id,
      rampType: isBuy ? "buy" : "sell",
      tokenAmount: trimTrailingZeros(isBuy ? quote.outputAmount : quote.inputAmount),
      tokenSymbol: (isBuy ? quote.outputCurrency : quote.inputCurrency).toUpperCase()
    },
    provider: NotificationProvider.Vortex,
    resourceId: rampState.id,
    type: NotificationType.RampCompleted,
    userId: rampState.userId
  });
}

/**
 * Second chance for completion emails the inline enqueue never wrote.
 *
 * That enqueue runs after the terminal phase is already persisted and deliberately does
 * not fail the ramp, so a backend that dies — or an enqueue that throws — between the two
 * leaves a completed ramp with no queue row. `complete` is terminal and never revisited,
 * so nothing else would ever notice. This sweep re-enqueues those; enqueuing is keyed on
 * the ramp id, so a row the inline path did write is a no-op here.
 */
// Bounds one reconcile cycle after a prolonged outage; anything beyond it drains on the
// following cycles, because every processed ramp gains a queue row and leaves the anti-join.
const RECONCILE_BATCH_SIZE = 250;

export async function reconcileMissedRampCompletedEmails(): Promise<void> {
  const completed = await RampState.findAll({
    attributes: ["id", "phaseHistory", "quoteId", "type", "updatedAt", "userId"],
    limit: RECONCILE_BATCH_SIZE,
    order: [["updatedAt", "ASC"]],
    where: {
      [Op.and]: literal(`NOT EXISTS (
        SELECT 1
        FROM email_notifications
        WHERE provider = '${NotificationProvider.Vortex}'
          AND type = '${NotificationType.RampCompleted}'
          AND resource_id = "RampState"."id"::text
      )`),
      currentPhase: "complete",
      // Query only anomalies, using the notification key's index. A fixed lookback can
      // turn one transient outage into a permanent gap once the completed ramp ages out.
      userId: { [Op.not]: null }
    }
  });

  if (completed.length === 0) {
    return;
  }

  logger.warn(`Reconciling ${completed.length} completed ramp(s) whose completion email was never enqueued`);
  if (completed.length === RECONCILE_BATCH_SIZE) {
    logger.warn(`Completion email reconcile hit its ${RECONCILE_BATCH_SIZE}-ramp cap; the remainder drains next cycle`);
  }

  for (const state of completed) {
    try {
      await enqueueRampCompletedEmail(state);
    } catch (error) {
      logger.error(`Error reconciling completion email for ${state.id}: ${error}`);
    }
  }
}
