import { create } from "zustand";

//XSTATE migrate: what to do with this?
interface RampSummaryState {
  isQuoteExpired: boolean;
  actions: {
    setIsQuoteExpired: (expired: boolean) => void;
  };
}

export const useRampSummaryStore = create<RampSummaryState>(set => ({
  actions: {
    setIsQuoteExpired: (expired: boolean) => set({ isQuoteExpired: expired })
  },
  isQuoteExpired: false
}));

export const useIsQuoteExpired = () => useRampSummaryStore(state => state.isQuoteExpired);
export const useRampSummaryActions = () => useRampSummaryStore(state => state.actions);
