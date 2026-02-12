import { create } from "zustand";

interface EvmTokensState {
  isLoaded: boolean;
  setLoaded: () => void;
}

export const useEvmTokensStore = create<EvmTokensState>(set => ({
  isLoaded: false,
  setLoaded: () => set({ isLoaded: true })
}));

export const useEvmTokensLoaded = () => useEvmTokensStore(state => state.isLoaded);
