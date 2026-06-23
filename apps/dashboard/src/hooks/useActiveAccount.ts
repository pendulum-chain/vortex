import { useDashboardStore } from "@/stores/dashboard.store";

/** The currently selected sender account (falls back to the first seeded account). */
export function useActiveAccount() {
  return useDashboardStore(state => state.accounts.find(account => account.id === state.activeAccountId) ?? state.accounts[0]);
}
