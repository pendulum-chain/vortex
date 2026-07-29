import { AveniaVerificationAttempt, KycAttemptResult, KycAttemptStatus } from "@vortexfi/shared";
import { NotificationProvider, NotificationType } from "../../../models/emailNotification.model";
import { enqueueNotification } from "../email";

const MAX_REASON_LENGTH = 200;

/**
 * Terminal outcomes only. An attempt that is still PENDING or PROCESSING, or that
 * completed without a result we recognise, produces no email — the webhook for the
 * settled state arrives later, and the reconciliation poller is a second chance at it.
 */
function terminalNotificationType(attempt: AveniaVerificationAttempt): NotificationType | null {
  if (attempt.status === KycAttemptStatus.EXPIRED) {
    return NotificationType.VerificationExpired;
  }

  if (attempt.status !== KycAttemptStatus.COMPLETED) {
    return null;
  }

  if (attempt.result === KycAttemptResult.APPROVED) {
    return NotificationType.VerificationApproved;
  }

  return attempt.result === KycAttemptResult.REJECTED ? NotificationType.VerificationRejected : null;
}

/**
 * Single enqueue path for both verification kinds and both delivery routes (webhook
 * and reconciliation poll). Keyed on the attempt id, so the same outcome arriving
 * twice — replayed webhook, or a poll racing the webhook — cannot send two emails.
 */
export async function enqueueVerificationNotification(attempt: AveniaVerificationAttempt, userId: string): Promise<boolean> {
  const type = terminalNotificationType(attempt);
  if (!type) {
    return false;
  }

  await enqueueNotification({
    payload: {
      reason:
        type === NotificationType.VerificationRejected ? (attempt.resultMessage?.slice(0, MAX_REASON_LENGTH) ?? null) : null,
      updatedAt: attempt.updatedAt
    },
    provider: NotificationProvider.Avenia,
    resourceId: attempt.id,
    type,
    userId
  });

  return true;
}
