import { create } from "zustand";

interface RampSummaryState {
  isQuoteExpired: boolean;
  actions: {
    setIsQuoteExpired: (expired: boolean) => void;
  };
}

export const useRampSummaryStore = create<RampSummaryState>(set => ({
  isQuoteExpired: false,
  actions: {
    setIsQuoteExpired: (expired: boolean) => set({ isQuoteExpired: expired })
  }
}));

export const useIsQuoteExpired = () => useRampSummaryStore(state => state.isQuoteExpired);
export const useRampSummaryActions = () => useRampSummaryStore(state => state.actions);
