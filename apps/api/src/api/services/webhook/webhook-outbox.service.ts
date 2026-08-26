import { WebhookPayload } from "@vortexfi/shared";
import { literal, Op, Transaction } from "sequelize";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import Webhook from "../../../models/webhook.model";
import WebhookDelivery, { WebhookDeliveryStatus } from "../../../models/webhookDelivery.model";
import webhookDeliveryService from "./webhook-delivery.service";

// Same shape as the email-notification dispatcher: attempts are incremented at claim
// time, backoff grows per attempt, and the row is abandoned after the cap. Unlike the
// legacy in-process path, a failing endpoint never deactivates the webhook — the
// delivery is durable and the subscription survives outages.
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;
const BATCH_SIZE = 25;
const STUCK_SENDING_MS = 15 * 60 * 1000;

/**
 * Enqueues one durable delivery per webhook for an already-built event envelope.
 * Idempotent: the unique (webhook_id, event_id) pair absorbs re-emits after crashes.
 */
export async function enqueueWebhookDeliveries(webhooks: Webhook[], payload: WebhookPayload): Promise<void> {
  if (webhooks.length === 0) return;
  await WebhookDelivery.bulkCreate(
    webhooks.map(webhook => ({
      eventId: payload.eventId,
      eventType: payload.eventType,
      payload,
      webhookId: webhook.id
    })),
    { ignoreDuplicates: true }
  );
}

async function claimDueDeliveries(): Promise<WebhookDelivery[]> {
  return sequelize.transaction(async transaction => {
    const due = await WebhookDelivery.findAll({
      limit: BATCH_SIZE,
      lock: Transaction.LOCK.UPDATE,
      order: [["next_attempt_at", "ASC"]],
      skipLocked: true,
      transaction,
      where: {
        attempts: { [Op.lt]: MAX_ATTEMPTS },
        nextAttemptAt: { [Op.lte]: new Date() },
        status: WebhookDeliveryStatus.Pending
      }
    });
    if (due.length === 0) return [];
    await WebhookDelivery.update(
      { attempts: literal("attempts + 1") as unknown as number, status: WebhookDeliveryStatus.Sending },
      { transaction, where: { id: due.map(row => row.id) } }
    );
    for (const row of due) {
      row.attempts += 1;
      row.status = WebhookDeliveryStatus.Sending;
    }
    return due;
  });
}

async function settle(row: WebhookDelivery, ok: boolean, error: string | null): Promise<void> {
  if (ok) {
    await row.update({ lastError: null, sentAt: new Date(), status: WebhookDeliveryStatus.Sent });
    return;
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    logger.error(`webhook-outbox: delivery ${row.id} abandoned after ${row.attempts} attempts: ${error}`);
    await row.update({ lastError: error, status: WebhookDeliveryStatus.Abandoned });
    return;
  }
  const backoffMinutes = BACKOFF_MINUTES[Math.min(row.attempts - 1, BACKOFF_MINUTES.length - 1)];
  await row.update({
    lastError: error,
    nextAttemptAt: new Date(Date.now() + backoffMinutes * 60 * 1000),
    status: WebhookDeliveryStatus.Pending
  });
}

/** Dispatches one claimed batch of due deliveries. Returns the number processed. */
export async function dispatchDueWebhookDeliveries(): Promise<number> {
  const claimed = await claimDueDeliveries();
  for (const row of claimed) {
    try {
      const webhook = await Webhook.findByPk(row.webhookId);
      if (!webhook || !webhook.isActive) {
        await row.update({ lastError: "webhook missing or inactive", status: WebhookDeliveryStatus.Abandoned });
        continue;
      }
      const result = await webhookDeliveryService.deliverSingleAttempt(webhook, row.payload);
      await settle(row, result.ok, result.error);
    } catch (error) {
      logger.error(`webhook-outbox: dispatch failed for delivery ${row.id}:`, error);
      await settle(row, false, error instanceof Error ? error.message : String(error)).catch(settleError => {
        // The stuck-sending reconciler requeues the row; still say why settling failed.
        logger.error(`webhook-outbox: could not settle delivery ${row.id}:`, settleError);
      });
    }
  }
  return claimed.length;
}

/**
 * Requeues rows stuck in `sending` (a crash between claim and settle). The attempts
 * counter was already incremented at claim, so the cap still holds.
 */
export async function reconcileStuckWebhookDeliveries(): Promise<number> {
  const [count] = await WebhookDelivery.update(
    { status: WebhookDeliveryStatus.Pending },
    {
      where: {
        status: WebhookDeliveryStatus.Sending,
        updatedAt: { [Op.lt]: new Date(Date.now() - STUCK_SENDING_MS) }
      }
    }
  );
  if (count > 0) {
    logger.warn(`webhook-outbox: requeued ${count} stuck delivery row(s)`);
  }
  return count;
}
