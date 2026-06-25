import { useDashboardStore } from "@/stores/dashboard.store";
import { notifyRecipientApproved } from "./notify";

/**
 * Mocks the recipient completing their KYC/KYB after receiving the invite: the invite is
 * opened (→ pending), then the provider approves (→ approved). Timers stand in for the
 * recipient-facing widget / Google Form / partner redirect we don't render in this demo.
 */
export function simulateRecipientOnboarding(id: string, email: string, corridorName: string) {
  const setRecipientStatus = useDashboardStore.getState().setRecipientStatus;
  setTimeout(() => setRecipientStatus(id, "pending"), 2200);
  setTimeout(() => {
    setRecipientStatus(id, "approved");
    notifyRecipientApproved(email, corridorName);
  }, 4600);
}
