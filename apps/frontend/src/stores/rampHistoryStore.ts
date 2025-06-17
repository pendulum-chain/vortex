import { create } from "zustand";

interface RampHistoryState {
  isActive: boolean;
  actions: {
    toggleHistory: () => void;
    setHistoryActive: (active: boolean) => void;
  };
}

export const useRampHistoryStore = create<RampHistoryState>(set => ({
  isActive: false,
  actions: {
    toggleHistory: () => set(state => ({ isActive: !state.isActive })),
    setHistoryActive: (active: boolean) => set({ isActive: active })
  }
}));
