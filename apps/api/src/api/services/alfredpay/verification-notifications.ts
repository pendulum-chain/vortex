import { AlfredpayKycStatus } from "@vortexfi/shared";
import { NotificationProvider, NotificationType } from "../../../models/emailNotification.model";
import { enqueueNotification } from "../email";
import { VerificationSubject } from "../email/types";

const MAX_REASON_LENGTH = 200;

/**
 * Terminal outcomes only. Alfredpay has no expiry state, so `verification_expired` never
 * fires for this provider — CREATED, PENDING and IN_REVIEW are still in flight, and
 * UPDATE_REQUIRED is resumable in the wizard rather than a decision.
 */
function terminalNotificationType(status: AlfredpayKycStatus): NotificationType | null {
  if (status === AlfredpayKycStatus.COMPLETED) {
    return NotificationType.VerificationApproved;
  }

  return status === AlfredpayKycStatus.FAILED ? NotificationType.VerificationRejected : null;
}

/**
 * Single enqueue path for both Alfredpay verification kinds and both poll routes (the
 * dashboard's on-demand refresh and the background sweep). Keyed on the submission id, so
 * the same outcome observed twice — a sweep racing a dashboard refresh, or either one
 * repeating — cannot send two emails. A resubmission after a rejection carries a fresh
 * submission id, which is a genuinely new outcome and correctly mails again.
 *
 * `subject` decides whether the email says identity or business verification. Alfredpay
 * reports the same status vocabulary for KYC and KYB, so only our own customer record
 * tells them apart.
 */
export async function enqueueAlfredpayVerificationNotification({
  status,
  submissionId,
  userId,
  subject,
  updatedAt,
  reason
}: {
  status: AlfredpayKycStatus;
  submissionId: string;
  userId: string;
  subject: VerificationSubject;
  updatedAt: string;
  reason?: string | null;
}): Promise<boolean> {
  const type = terminalNotificationType(status);
  if (!type) {
    return false;
  }

  await enqueueNotification({
    payload: {
      reason: type === NotificationType.VerificationRejected ? (reason?.slice(0, MAX_REASON_LENGTH) ?? null) : null,
      subject,
      updatedAt
    },
    provider: NotificationProvider.Alfredpay,
    resourceId: submissionId,
    type,
    userId
  });

  return true;
}
