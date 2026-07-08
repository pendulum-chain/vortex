import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth.store";
import { useNotificationsStore } from "@/stores/notifications.store";

function currentEmail() {
  return useAuthStore.getState().user?.email ?? "you@vortex.fi";
}

export function notifyTransferCompleted(summary: string) {
  const email = currentEmail();
  const title = "Transfer completed";
  const body = `${summary} settled successfully. A confirmation was sent to ${email}.`;
  useNotificationsStore.getState().add({ body, email, title });
  toast.success(title, { description: summary });
}

export function notifyInviteLinkReady(corridorName: string) {
  const email = currentEmail();
  const title = "Invite link ready";
  const body = `Share this ${corridorName} invite link with your recipient — they can receive transfers once they complete KYC/KYB.`;
  useNotificationsStore.getState().add({ body, email, title });
}

export function notifyInviteCopied() {
  toast.success("Invite link copied", { description: "Send it to your recipient to start their onboarding." });
}
