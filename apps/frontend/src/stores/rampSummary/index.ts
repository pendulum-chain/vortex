import { RefObject } from "react";
import { create } from "zustand";

interface RampSummaryState {
  isQuoteExpired: boolean;
  dialogScrollRef: RefObject<HTMLDialogElement | null> | null;
  actions: {
    setIsQuoteExpired: (expired: boolean) => void;
    setDialogScrollRef: (ref: RefObject<HTMLDialogElement | null> | null) => void;
    scrollToBottom: () => void;
  };
}

export const useRampSummaryStore = create<RampSummaryState>((set, get) => ({
  actions: {
    scrollToBottom: () => {
      const { dialogScrollRef } = get();
      if (dialogScrollRef?.current) {
        dialogScrollRef.current.scrollTo({
          behavior: "smooth",
          top: dialogScrollRef.current.scrollHeight
        });
      }
    },
    setDialogScrollRef: (ref: RefObject<HTMLDialogElement | null> | null) => set({ dialogScrollRef: ref }),
    setIsQuoteExpired: (expired: boolean) => set({ isQuoteExpired: expired })
  },
  dialogScrollRef: null,
  isQuoteExpired: false
}));

export const useIsQuoteExpired = () => useRampSummaryStore(state => state.isQuoteExpired);
export const useRampSummaryActions = () => useRampSummaryStore(state => state.actions);
