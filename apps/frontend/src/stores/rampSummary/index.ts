import { RefObject } from "react";
import { create } from "zustand";

//XSTATE migrate: what to do with this?
interface RampSummaryState {
  dialogScrollRef: RefObject<HTMLDivElement | null> | null;
  actions: {
    setDialogScrollRef: (ref: RefObject<HTMLDivElement | null> | null) => void;
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
    setDialogScrollRef: (ref: RefObject<HTMLDivElement | null> | null) => set({ dialogScrollRef: ref })
  },
  dialogScrollRef: null
}));

export const useRampSummaryActions = () => useRampSummaryStore(state => state.actions);
