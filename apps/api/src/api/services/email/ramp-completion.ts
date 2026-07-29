import { RampDirection } from "@vortexfi/shared";
import logger from "../../../config/logger";
import { NotificationProvider, NotificationType } from "../../../models/emailNotification.model";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import { enqueueNotification } from "./notification.service";

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
