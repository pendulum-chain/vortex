import { toast } from "sonner";
import type { OnboardingKind, OnboardingStatus } from "@/domain/types";
import { useAuthStore } from "@/stores/auth.store";

function currentEmail() {
  return useAuthStore.getState().user?.email ?? "you@vortex.fi";
}

/** Fires the "email completion update" toast. Mirrors the real KYC_COMPLETED signal. */
export function notifyOnboardingStatus(corridorName: string, kind: OnboardingKind, status: OnboardingStatus) {
  const email = currentEmail();
  const label = kind.toUpperCase();

  if (status === "in_review") {
    toast.info(`${corridorName} ${label} submitted`, { description: `Confirmation sent to ${email}` });
    return;
  }

  if (status === "approved") {
    toast.success(`${corridorName} ${label} approved`, { description: `Completion email sent to ${email}` });
    return;
  }

  if (status === "rejected") {
    toast.error(`${corridorName} ${label} needs attention`, { description: `Details sent to ${email}` });
  }
}

export function notifyTransferCompleted(summary: string) {
  toast.success("Transfer completed", { description: summary });
}

export function notifyInviteCopied() {
  toast.success("Invite link copied", { description: "Send it to your recipient to start their onboarding." });
}
