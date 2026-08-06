import { literal, Op } from "sequelize";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import EmailNotification, { NotificationKey, NotificationStatus } from "../../../models/emailNotification.model";
import NotificationPreference from "../../../models/notificationPreference.model";
import User from "../../../models/user.model";
import { SupabaseAuthService } from "../auth";
import { SlackNotifier } from "../slack.service";
import { EmailNotConfiguredError, sendEmail } from "./resend.transport";
import { renderNotification } from "./templates";

const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
// One initial send plus one retry per backoff step. Deriving it keeps the last step
// reachable: a flat 5 abandoned the row on the attempt that should have waited 180 minutes.
const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;
const BATCH_SIZE = 25;
const STALE_CLAIM_MS = 15 * 60 * 1000;
const STALE_ABANDON_REASON = "Abandoned after a claimed send repeatedly failed to complete";

interface EnqueueParams extends NotificationKey {
  userId: string;
  payload: Record<string, unknown>;
}

function describeKey({ provider, type, resourceId }: NotificationKey): string {
  return `${provider}/${type} notification for resource ${resourceId}`;
}

/**
 * Records a notification to be emailed. Idempotent on the notification key:
 * enqueuing the same event twice is a no-op, so callers can fire without guarding.
 */
export async function enqueueNotification({ userId, payload, ...key }: EnqueueParams): Promise<void> {
  const locale = await SupabaseAuthService.getUserLocale(userId);

  const [, created] = await EmailNotification.findOrCreate({
    defaults: { ...key, locale, payload, userId },
    where: { ...key }
  });

  if (created) {
    logger.info(`Enqueued ${describeKey(key)}`);
  }
}

/**
 * When a notification that has already failed `attempts` times should next be tried,
 * or null once every backoff step has been spent and the row must be abandoned.
 */
export function nextRetryAt(attempts: number): Date | null {
  if (attempts >= MAX_ATTEMPTS) {
    return null;
  }
  return new Date(Date.now() + BACKOFF_MINUTES[attempts - 1] * 60 * 1000);
}

async function alertAbandoned(notification: EmailNotification, reason: string | null): Promise<void> {
  try {
    await new SlackNotifier().sendMessage({
      text: `Abandoned ${describeKey(notification)} after ${notification.attempts} attempts: ${reason}`
    });
  } catch (error) {
    logger.error(`Failed to send Slack alert for abandoned notification ${notification.id}: ${error}`);
  }
}

/**
 * Atomically claims a batch of due notifications so a concurrent backend cannot
 * pick up the same rows. Attempts are incremented at claim time, which also caps
 * retries if the process dies mid-send.
 */
async function claimDueNotifications(): Promise<EmailNotification[]> {
  return sequelize.transaction(async transaction => {
    const due = await EmailNotification.findAll({
      limit: BATCH_SIZE,
      lock: transaction.LOCK.UPDATE,
      order: [["nextAttemptAt", "ASC"]],
      skipLocked: true,
      transaction,
      where: {
        // The cap is enforced here as well as in handleDeliveryFailure: a row that was
        // requeued without a failure ever being recorded (a crash between claim and
        // resolution) would otherwise be picked up forever.
        attempts: { [Op.lt]: MAX_ATTEMPTS },
        nextAttemptAt: { [Op.lte]: new Date() },
        status: { [Op.in]: [NotificationStatus.Pending, NotificationStatus.Failed] }
      }
    });

    if (due.length === 0) {
      return [];
    }

    await EmailNotification.update(
      { attempts: literal("attempts + 1") as unknown as number, status: NotificationStatus.Sending },
      { transaction, where: { id: { [Op.in]: due.map(notification => notification.id) } } }
    );

    for (const notification of due) {
      notification.attempts += 1;
      notification.status = NotificationStatus.Sending;
    }

    return due;
  });
}

/**
 * Email is opt-out: a profile with no preferences row has never disabled anything, and
 * `getOrCreateNotificationPreferences` defaults `email_enabled` to true, so a missing row
 * and a default row must behave alike. `email_enabled` is the master switch;
 * `prefs[<notification type>]` — keyed by the stored `type` value, e.g. `ramp_completed` —
 * silences one type when set to false and is ignored otherwise.
 *
 * Resolved at delivery rather than at enqueue so an opt-out registered while a row sits in
 * the queue is still honoured.
 */
async function emailIsAllowed(notification: EmailNotification): Promise<boolean> {
  const preferences = await NotificationPreference.findOne({ where: { profileId: notification.userId } });

  if (!preferences) {
    return true;
  }

  return preferences.emailEnabled && preferences.prefs[notification.type] !== false;
}

async function deliver(notification: EmailNotification): Promise<void> {
  if (!(await emailIsAllowed(notification))) {
    logger.info(`Skipping notification ${notification.id}: the recipient has disabled email for this notification`);
    await notification.update({
      lastError: "Recipient has disabled email notifications",
      status: NotificationStatus.Skipped
    });
    return;
  }

  const user = await User.findByPk(notification.userId);

  if (!user?.email) {
    await notification.update({
      lastError: "No email address on the recipient profile",
      status: NotificationStatus.Skipped
    });
    return;
  }

  const { deploymentEnv } = config;
  const { recipientAllowlist } = config.integrations.resend;

  if (deploymentEnv !== "production" && !recipientAllowlist.includes(user.email.toLowerCase())) {
    logger.info(`Skipping notification ${notification.id}: ${deploymentEnv} allowlist does not include the recipient`);
    await notification.update({
      lastError: `Recipient not in EMAIL_RECIPIENT_ALLOWLIST (${deploymentEnv})`,
      status: NotificationStatus.Skipped
    });
    return;
  }

  const rendered = renderNotification(notification);
  // The row id is the idempotency key: a crash after Resend accepts but before `sent` is
  // persisted leaves the row to be reclaimed, and the retry must collapse into the original
  // send rather than mail the user twice.
  const messageId = await sendEmail({ ...rendered, idempotencyKey: notification.id, to: user.email });

  await notification.update({
    lastError: null,
    providerMessageId: messageId || null,
    sentAt: new Date(),
    status: NotificationStatus.Sent
  });
}

async function handleDeliveryFailure(notification: EmailNotification, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const retryAt = nextRetryAt(notification.attempts);

  await notification.update({
    lastError: message.slice(0, 2000),
    nextAttemptAt: retryAt ?? notification.nextAttemptAt,
    status: retryAt ? NotificationStatus.Failed : NotificationStatus.Abandoned
  });

  if (!retryAt) {
    logger.error(`Abandoning notification ${notification.id} after ${notification.attempts} attempts: ${message}`);
    await alertAbandoned(notification, message);
  } else {
    logger.warn(`Notification ${notification.id} attempt ${notification.attempts} failed: ${message}`);
  }
}

/**
 * Releases rows a previous cycle claimed but never resolved (e.g. the process was
 * killed mid-send), so they become eligible again instead of stalling forever.
 *
 * A row that has spent its attempts is abandoned here rather than requeued. Nothing
 * else can retire it: a process dying between claim and resolution records no failure,
 * so handleDeliveryFailure — which owns the cap on the normal path — never runs.
 */
async function releaseStaleClaims(): Promise<void> {
  const staleClaim = {
    status: NotificationStatus.Sending,
    updatedAt: { [Op.lt]: new Date(Date.now() - STALE_CLAIM_MS) }
  };

  const exhausted = await EmailNotification.findAll({
    where: { ...staleClaim, attempts: { [Op.gte]: MAX_ATTEMPTS } }
  });

  await EmailNotification.update(
    { lastError: STALE_ABANDON_REASON, status: NotificationStatus.Abandoned },
    { where: { ...staleClaim, attempts: { [Op.gte]: MAX_ATTEMPTS } } }
  );

  await EmailNotification.update(
    { nextAttemptAt: new Date(), status: NotificationStatus.Failed },
    { where: { ...staleClaim, attempts: { [Op.lt]: MAX_ATTEMPTS } } }
  );

  for (const notification of exhausted) {
    logger.error(`Abandoning notification ${notification.id} stuck in sending after ${notification.attempts} attempts`);
    await alertAbandoned(notification, STALE_ABANDON_REASON);
  }
}

export async function dispatchPendingNotifications(): Promise<void> {
  if (!config.integrations.resend.apiKey) {
    logger.warn("RESEND_API_KEY is not set; leaving pending notifications queued");
    return;
  }

  await releaseStaleClaims();

  const claimed = await claimDueNotifications();
  if (claimed.length === 0) {
    return;
  }

  logger.info(`Dispatching ${claimed.length} notification(s)`);

  for (const notification of claimed) {
    try {
      await deliver(notification);
    } catch (error) {
      if (error instanceof EmailNotConfiguredError) {
        await notification.update({ status: NotificationStatus.Pending });
        return;
      }
      await handleDeliveryFailure(notification, error);
    }
  }
}
