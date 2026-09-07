import EmailNotification, { NotificationType } from "../../../../models/emailNotification.model";
import {
  EmailLocale,
  RampCompletedPayload,
  RenderedEmail,
  toEmailLocale,
  VerificationKind,
  VerificationPayload
} from "../types";
import { renderManagedProfileInvitation } from "./managed-profile-membership-invitation";
import { renderRampCompleted } from "./ramp-completed";
import { renderVerificationStatus } from "./verification-status";

const VERIFICATION_KINDS: Partial<Record<NotificationType, VerificationKind>> = {
  [NotificationType.VerificationApproved]: "approved",
  [NotificationType.VerificationExpired]: "expired",
  [NotificationType.VerificationRejected]: "rejected"
};

export function renderNotification(notification: EmailNotification): RenderedEmail {
  const locale: EmailLocale = toEmailLocale(notification.locale);

  if (notification.type === NotificationType.ManagedProfileMembershipInvitation) {
    if (typeof notification.payload.invitationUrl !== "string") throw new Error("Invalid invitation email payload");
    return renderManagedProfileInvitation(notification.payload.invitationUrl);
  }

  if (notification.type === NotificationType.RampCompleted) {
    return renderRampCompleted(locale, notification.payload as unknown as RampCompletedPayload);
  }

  const verificationKind = VERIFICATION_KINDS[notification.type];
  if (verificationKind) {
    return renderVerificationStatus(verificationKind, locale, notification.payload as unknown as VerificationPayload);
  }

  throw new Error(`No email template registered for notification type '${notification.type}'`);
}
