import type { AlfredpayFiatAccount } from "@vortexfi/shared";
import { create } from "zustand";
import { AlfredpayService } from "../services/api/alfredpay.service";

interface FiatAccountsStore {
  accountsByCountry: Record<string, AlfredpayFiatAccount[] | undefined>;
  loadingByCountry: Record<string, boolean>;
  actions: {
    fetchAccounts: (country: string, force?: boolean) => Promise<void>;
  };
}

const useFiatAccountsStore = create<FiatAccountsStore>((set, get) => ({
  accountsByCountry: {},
  actions: {
    fetchAccounts: async (country, force = false) => {
      const { accountsByCountry, loadingByCountry } = get();
      if (!force && accountsByCountry[country] !== undefined) return;
      if (loadingByCountry[country]) return;

      set(s => ({ loadingByCountry: { ...s.loadingByCountry, [country]: true } }));
      try {
        const accounts = await AlfredpayService.listFiatAccounts(country);
        set(s => ({
          accountsByCountry: { ...s.accountsByCountry, [country]: accounts },
          loadingByCountry: { ...s.loadingByCountry, [country]: false }
        }));
      } catch {
        set(s => ({
          accountsByCountry: { ...s.accountsByCountry, [country]: [] },
          loadingByCountry: { ...s.loadingByCountry, [country]: false }
        }));
      }
    }
  },
  loadingByCountry: {}
}));

export const useFiatAccountsActions = () => useFiatAccountsStore(s => s.actions);
export const useFiatAccountsForCountry = (country: string) => useFiatAccountsStore(s => s.accountsByCountry[country]);
export const useFiatAccountsLoadingForCountry = (country: string) =>
  useFiatAccountsStore(s => s.loadingByCountry[country] ?? false);
