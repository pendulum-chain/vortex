import { useDashboardStore } from "@/stores/dashboard.store";
import { notifyRecipientApproved } from "./notify";

/**
 * Mocks the recipient completing their KYC/KYB after opening the invite link: the link is
 * opened (→ pending), then the provider approves and the recipient's submitted name + payout
 * details land (→ approved). Timers stand in for the recipient-facing widget / partner
 * redirect we don't render in this demo.
 */
export function simulateRecipientOnboarding(id: string, corridorName: string) {
  const store = useDashboardStore.getState();
  setTimeout(() => store.setRecipientStatus(id, "pending"), 2200);
  setTimeout(() => {
    store.completeRecipientOnboarding(id);
    notifyRecipientApproved(corridorName);
  }, 4600);
}
