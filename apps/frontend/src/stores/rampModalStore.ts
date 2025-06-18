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
  actions: {
    closeTokenSelectModal: () =>
      set(state => ({
        modal: {
          ...state.modal,
          isOpen: false
        }
      })),
    openTokenSelectModal: type =>
      set(state => ({
        modal: {
          ...state.modal,
          isOpen: true,
          tokenSelectModalType: type
        }
      }))
  },
  modal: {
    isLoading: false,
    isOpen: false,
    tokenSelectModalType: "from"
  }
}));

export const useRampModalState = () => useRampModalStore(state => state.modal);
export const useRampModalActions = () => useRampModalStore(state => state.actions);
