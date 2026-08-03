import { RampDirection } from "@vortexfi/shared";
import { Op } from "sequelize";
import logger from "../../../config/logger";
import EmailNotification, { NotificationProvider, NotificationType } from "../../../models/emailNotification.model";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import { enqueueNotification } from "./notification.service";

// How far back the reconciliation sweep looks for completed ramps that were never queued.
const RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Queues the ramp completion email. Only ramps owned by a signed-in user get one:
 * a partner-driven ramp has no verified Vortex-side recipient, and the email on a
 * ramp's additionalData belongs to the partner's customer, not to us.
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

  // On a buy the user pays fiat and receives the token; on a sell it is the other way
  // round. The email always reports the fiat leg as Amount and the on-chain leg as
  // Token, so which side of the quote each one reads from swaps with the direction.
  const isBuy = rampState.type === RampDirection.BUY;

  await enqueueNotification({
    payload: {
      completedAt: new Date().toISOString(),
      fiatAmount: isBuy ? quote.inputAmount : quote.outputAmount,
      fiatCurrency: (isBuy ? quote.inputCurrency : quote.outputCurrency).toUpperCase(),
      network: quote.network,
      rampId: rampState.id,
      rampType: isBuy ? "buy" : "sell",
      tokenAmount: isBuy ? quote.outputAmount : quote.inputAmount,
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
export async function reconcileMissedRampCompletedEmails(): Promise<void> {
  const completed = await RampState.findAll({
    attributes: ["id", "quoteId", "type", "userId"],
    where: {
      currentPhase: "complete",
      updatedAt: { [Op.gte]: new Date(Date.now() - RECONCILE_WINDOW_MS) },
      userId: { [Op.not]: null }
    }
  });

  if (completed.length === 0) {
    return;
  }

  const queued = await EmailNotification.findAll({
    attributes: ["resourceId"],
    where: {
      provider: NotificationProvider.Vortex,
      resourceId: { [Op.in]: completed.map(state => state.id) },
      type: NotificationType.RampCompleted
    }
  });

  const queuedIds = new Set(queued.map(notification => notification.resourceId));
  const missed = completed.filter(state => !queuedIds.has(state.id));

  if (missed.length === 0) {
    return;
  }

  logger.warn(`Reconciling ${missed.length} completed ramp(s) whose completion email was never enqueued`);

  for (const state of missed) {
    try {
      await enqueueRampCompletedEmail(state);
    } catch (error) {
      logger.error(`Error reconciling completion email for ${state.id}: ${error}`);
    }
  }
}
