import { create } from "zustand";

interface HamburgerMenuState {
  isOpen: boolean;
}

interface HamburgerMenuActions {
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
}

interface HamburgerMenuStore extends HamburgerMenuState {
  actions: HamburgerMenuActions;
}

export const useHamburgerMenuStore = create<HamburgerMenuStore>(set => ({
  actions: {
    closeMenu: () => set({ isOpen: false }),
    openMenu: () => set({ isOpen: true }),
    toggleMenu: () => set(state => ({ isOpen: !state.isOpen }))
  },
  isOpen: false
}));

// Convenience hooks for easier usage
export const useHamburgerMenuState = () => useHamburgerMenuStore(state => state.isOpen);
export const useHamburgerMenuActions = () => useHamburgerMenuStore(state => state.actions);
