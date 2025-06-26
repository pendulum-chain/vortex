import { create } from "zustand";

interface RampHistoryState {
  isActive: boolean;
  actions: {
    toggleHistory: () => void;
    setHistoryActive: (active: boolean) => void;
  };
}

export const useRampHistoryStore = create<RampHistoryState>(set => ({
  actions: {
    setHistoryActive: (active: boolean) => set({ isActive: active }),
    toggleHistory: () => set(state => ({ isActive: !state.isActive }))
  },
  isActive: false
}));
