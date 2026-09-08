import type { Transaction } from "sequelize";
import { z } from "zod";
import { config } from "../../../config/vars";
import EmailNotification, { NotificationProvider, NotificationType } from "../../../models/emailNotification.model";

/** Await inside the invitation-creation transaction; failures must roll back the invitation and its event. */
export async function enqueueManagedProfileInvitation(
  { invitationId, recipientEmail }: { invitationId: string; recipientEmail: string },
  transaction: Transaction
): Promise<void> {
  if (!transaction) throw new Error("Invitation email requires the invitation transaction");
  const id = z.string().toLowerCase().uuid().safeParse(invitationId);
  const email = z.string().trim().toLowerCase().max(254).email().safeParse(recipientEmail);
  if (!id.success || !email.success) throw new Error("Invalid invitation email input");
  if (!config.dashboardPublicUrl) throw new Error("DASHBOARD_PUBLIC_URL is required for invitation email");

  const key = {
    provider: NotificationProvider.Vortex,
    resourceId: id.data,
    type: NotificationType.ManagedProfileMembershipInvitation
  };
  try {
    await EmailNotification.findOrCreate({
      defaults: {
        ...key,
        locale: "en-US",
        payload: { invitationUrl: `${config.dashboardPublicUrl}/member-invitations/${id.data}` },
        recipientEmail: email.data,
        userId: null
      },
      logging: false,
      transaction,
      where: key
    });
  } catch {
    // Sequelize errors can contain SQL, the target email, and the invitation link.
    throw new Error("Could not enqueue managed-profile invitation email");
  }
}
