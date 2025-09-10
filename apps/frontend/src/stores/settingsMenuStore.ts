import { create } from "zustand";

interface SettingsMenuState {
  isOpen: boolean;
}

interface SettingsMenuActions {
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
}

interface SettingsMenuStore extends SettingsMenuState {
  actions: SettingsMenuActions;
}

export const useSettingsMenuStore = create<SettingsMenuStore>(set => ({
  actions: {
    closeMenu: () => set({ isOpen: false }),
    openMenu: () => set({ isOpen: true }),
    toggleMenu: () => set(state => ({ isOpen: !state.isOpen }))
  },
  isOpen: false
}));

// Convenience hooks for easier usage
export const useSettingsMenuState = () => useSettingsMenuStore(state => state.isOpen);
export const useSettingsMenuActions = () => useSettingsMenuStore(state => state.actions);
