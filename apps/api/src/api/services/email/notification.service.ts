import { literal, Op } from "sequelize";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import EmailNotification, { NotificationKey, NotificationStatus } from "../../../models/emailNotification.model";
import User from "../../../models/user.model";
import { SupabaseAuthService } from "../auth";
import { SlackNotifier } from "../slack.service";
import { EmailNotConfiguredError, sendEmail } from "./resend.transport";
import { renderNotification } from "./templates";

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
const BATCH_SIZE = 25;
const STALE_CLAIM_MS = 15 * 60 * 1000;

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

function backoffFor(attempts: number): Date {
  const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1];
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function alertAbandoned(notification: EmailNotification): Promise<void> {
  try {
    await new SlackNotifier().sendMessage({
      text: `Abandoned ${describeKey(notification)} after ${notification.attempts} attempts: ${notification.lastError}`
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

async function deliver(notification: EmailNotification): Promise<void> {
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
  const messageId = await sendEmail({ ...rendered, to: user.email });

  await notification.update({
    lastError: null,
    providerMessageId: messageId || null,
    sentAt: new Date(),
    status: NotificationStatus.Sent
  });
}

async function handleDeliveryFailure(notification: EmailNotification, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = notification.attempts >= MAX_ATTEMPTS;

  await notification.update({
    lastError: message.slice(0, 2000),
    nextAttemptAt: exhausted ? notification.nextAttemptAt : backoffFor(notification.attempts),
    status: exhausted ? NotificationStatus.Abandoned : NotificationStatus.Failed
  });

  if (exhausted) {
    logger.error(`Abandoning notification ${notification.id} after ${notification.attempts} attempts: ${message}`);
    await alertAbandoned(notification);
  } else {
    logger.warn(`Notification ${notification.id} attempt ${notification.attempts} failed: ${message}`);
  }
}

/**
 * Releases rows a previous cycle claimed but never resolved (e.g. the process was
 * killed mid-send), so they become eligible again instead of stalling forever.
 */
async function releaseStaleClaims(): Promise<void> {
  await EmailNotification.update(
    { nextAttemptAt: new Date(), status: NotificationStatus.Failed },
    {
      where: {
        status: NotificationStatus.Sending,
        updatedAt: { [Op.lt]: new Date(Date.now() - STALE_CLAIM_MS) }
      }
    }
  );
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
