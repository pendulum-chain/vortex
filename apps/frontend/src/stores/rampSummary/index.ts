import { RefObject } from "react";
import { create } from "zustand";

interface RampSummaryState {
  isQuoteExpired: boolean;
  dialogRef: RefObject<HTMLDivElement | null> | null;
  actions: {
    setIsQuoteExpired: (expired: boolean) => void;
    setDialogRef: (ref: RefObject<HTMLDivElement | null> | null) => void;
    scrollToBottom: () => void;
  };
}

export const useRampSummaryStore = create<RampSummaryState>((set, get) => ({
  actions: {
    scrollToBottom: () => {
      const { dialogRef } = get();
      if (dialogRef?.current) {
        dialogRef.current.scrollTo({
          behavior: "smooth",
          top: dialogRef.current.scrollHeight
        });
      }
    },
    setDialogRef: (ref: RefObject<HTMLDivElement | null> | null) => set({ dialogRef: ref }),
    setIsQuoteExpired: (expired: boolean) => set({ isQuoteExpired: expired })
  },
  dialogRef: null,
  isQuoteExpired: false
}));

export const useIsQuoteExpired = () => useRampSummaryStore(state => state.isQuoteExpired);
export const useRampSummaryActions = () => useRampSummaryStore(state => state.actions);
