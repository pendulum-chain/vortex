import { create } from 'zustand';
import { debounce } from '../helpers/function';
import { storageService } from '../services/storage/local';
import { storageKeys } from '../constants/localStorage';

const storageSet = debounce(storageService.set, 1000);
const setStorageForRampSettings = storageSet.bind(null, storageKeys.RAMP_SETTINGS);

type RampSettings = {
  from: string;
  to: string;
};

interface RampModalState {
  isOpen: boolean;
  isLoading: boolean;
  tokenSelectModalType: 'from' | 'to';
  fromToken: string;
  toToken: string;
}

interface RampModalStore {
  modal: RampModalState;

  actions: {
    openTokenSelectModal: (type: 'from' | 'to') => void;
    closeTokenSelectModal: () => void;
    setModalLoading: (isLoading: boolean) => void;
    selectFromToken: (token: string) => void;
    selectToToken: (token: string) => void;
    setFromToken: (token: string) => void;
    setToToken: (token: string) => void;
    swapTokens: () => void;
  };
}

export const useRampModalStore = create<RampModalStore>((set, get) => ({
  modal: {
    isOpen: false,
    isLoading: false,
    tokenSelectModalType: 'from',
    fromToken: '',
    toToken: '',
  },

  actions: {
    openTokenSelectModal: (type) =>
      set((state) => ({
        modal: {
          ...state.modal,
          isOpen: true,
          tokenSelectModalType: type,
        },
      })),

    closeTokenSelectModal: () =>
      set((state) => ({
        modal: {
          ...state.modal,
          isOpen: false,
        },
      })),

    setModalLoading: (isLoading) =>
      set((state) => ({
        modal: {
          ...state.modal,
          isLoading,
        },
      })),

    selectFromToken: (token) => {
      const { toToken } = get().modal;
      const updated: RampSettings = {
        from: token,
        to: toToken || '',
      };

      setStorageForRampSettings(updated);
      set((state) => ({
        modal: {
          ...state.modal,
          fromToken: token,
          isOpen: false,
        },
      }));
    },

    selectToToken: (token) => {
      const { fromToken } = get().modal;
      const updated: RampSettings = {
        from: fromToken || '',
        to: token,
      };

      setStorageForRampSettings(updated);
      set((state) => ({
        modal: {
          ...state.modal,
          toToken: token,
          isOpen: false,
        },
      }));
    },

    setFromToken: (token) =>
      set((state) => ({
        modal: {
          ...state.modal,
          fromToken: token,
        },
      })),

    setToToken: (token) =>
      set((state) => ({
        modal: {
          ...state.modal,
          toToken: token,
        },
      })),

    swapTokens: () => {
      const { fromToken, toToken } = get().modal;
      set((state) => ({
        modal: {
          ...state.modal,
          fromToken: toToken,
          toToken: fromToken,
        },
      }));

      const updated: RampSettings = {
        from: toToken || '',
        to: fromToken || '',
      };

      setStorageForRampSettings(updated);
    },
  },
}));

export const useRampModalState = () => useRampModalStore((state) => state.modal);
export const useRampModalActions = () => useRampModalStore((state) => state.actions);
