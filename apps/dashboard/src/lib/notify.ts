import { toast } from "sonner";
import type { OnboardingKind, OnboardingStatus } from "@/domain/types";
import { useAuthStore } from "@/stores/auth.store";
import { useNotificationsStore } from "@/stores/notifications.store";

function currentEmail() {
  return useAuthStore.getState().user?.email ?? "you@vortex.fi";
}

/**
 * Simulates the "email completion update": pushes an entry into the in-app
 * notifications panel and fires a toast. Mirrors the real KYC_COMPLETED signal.
 */
export function notifyOnboardingStatus(corridorName: string, kind: OnboardingKind, status: OnboardingStatus) {
  const email = currentEmail();
  const label = kind.toUpperCase();

  if (status === "in_review") {
    const title = `${corridorName} ${label} submitted`;
    const body = `Your ${corridorName} ${label} is now in review. We'll email ${email} when it's complete.`;
    useNotificationsStore.getState().add({ body, email, title });
    toast.info(title, { description: `Confirmation sent to ${email}` });
    return;
  }

  if (status === "approved") {
    const title = `${corridorName} ${label} approved`;
    const body = `Your ${corridorName} ${label} was approved. You can now register recipients and transfer.`;
    useNotificationsStore.getState().add({ body, email, title });
    toast.success(title, { description: `Completion email sent to ${email}` });
    return;
  }

  if (status === "rejected") {
    const title = `${corridorName} ${label} needs attention`;
    const body = `Your ${corridorName} ${label} could not be approved. Details were emailed to ${email}.`;
    useNotificationsStore.getState().add({ body, email, title });
    toast.error(title, { description: `Details sent to ${email}` });
  }
}

export function notifyTransferCompleted(summary: string) {
  const email = currentEmail();
  const title = "Transfer completed";
  const body = `${summary} settled successfully. A confirmation was sent to ${email}.`;
  useNotificationsStore.getState().add({ body, email, title });
  toast.success(title, { description: summary });
}

export function notifyRecipientInvited(recipientEmail: string, corridorName: string) {
  const email = currentEmail();
  const title = "KYB invite sent";
  const body = `We emailed a ${corridorName} KYB invite to ${recipientEmail}. They can receive transfers once approved.`;
  useNotificationsStore.getState().add({ body, email, title });
  toast.info(title, { description: `Invite sent to ${recipientEmail}` });
}

export function notifyRecipientRegistered(recipientEmail: string, corridorName: string) {
  const email = currentEmail();
  const title = "Recipient approved";
  const body = `${recipientEmail} completed ${corridorName} KYB and is ready to receive transfers.`;
  useNotificationsStore.getState().add({ body, email, title });
  toast.success(title, { description: `${recipientEmail} is ready` });
}
