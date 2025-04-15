import { create } from 'zustand';

interface RampSummaryState {
  isQuoteExpired: boolean;
  setIsQuoteExpired: (expired: boolean) => void;
}

export const useRampSummaryStore = create<RampSummaryState>((set) => ({
  isQuoteExpired: false,
  setIsQuoteExpired: (expired: boolean) => set({ isQuoteExpired: expired }),
}));
