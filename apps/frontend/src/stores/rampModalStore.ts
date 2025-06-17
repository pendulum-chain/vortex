import { create } from "zustand";

interface RampModalState {
  isOpen: boolean;
  isLoading: boolean;
  tokenSelectModalType: "from" | "to";
}

interface RampModalStore {
  modal: RampModalState;

  actions: {
    openTokenSelectModal: (type: "from" | "to") => void;
    closeTokenSelectModal: () => void;
  };
}

export const useRampModalStore = create<RampModalStore>(set => ({
  modal: {
    isOpen: false,
    isLoading: false,
    tokenSelectModalType: "from"
  },

  actions: {
    openTokenSelectModal: type =>
      set(state => ({
        modal: {
          ...state.modal,
          isOpen: true,
          tokenSelectModalType: type
        }
      })),

    closeTokenSelectModal: () =>
      set(state => ({
        modal: {
          ...state.modal,
          isOpen: false
        }
      }))
  }
}));

export const useRampModalState = () => useRampModalStore(state => state.modal);
export const useRampModalActions = () => useRampModalStore(state => state.actions);
