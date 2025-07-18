import { create } from "zustand";

interface TermsState {
  termsChecked: boolean;
  termsAccepted: boolean;
  termsError: boolean;
  termsAnimationKey: number;
  isValid: boolean;
  actions: {
    toggleTermsChecked: () => void;
    setTermsError: (value: boolean) => void;
    incrementAnimationKey: () => void;
    validateTerms: () => boolean;
  };
}

const initialAccepted = localStorage.getItem("TERMS_AND_CONDITIONS") === "accepted";

export const useTermsStore = create<TermsState>()((set, get) => ({
  actions: {
    incrementAnimationKey: () => {
      set(state => ({ termsAnimationKey: state.termsAnimationKey + 1 }));
    },

    setTermsError: (value: boolean) => {
      set({ termsError: value });
    },
    toggleTermsChecked: () => {
      const currentChecked = get().termsChecked;

      set({
        isValid: !currentChecked || get().termsAccepted,
        termsChecked: !currentChecked,
        termsError: false
      });
    },

    validateTerms: () => {
      const { termsChecked, termsAccepted } = get();
      const isValid = termsChecked || termsAccepted;

      if (!isValid) {
        set({ termsError: true });
        get().actions.incrementAnimationKey();
      }

      if (isValid) {
        localStorage.setItem("TERMS_AND_CONDITIONS", "accepted");
      }

      set({ isValid });
      return isValid;
    }
  },
  isValid: initialAccepted,
  termsAccepted: initialAccepted,
  termsAnimationKey: 0,
  termsChecked: false,
  termsError: false
}));

export const useTermsChecked = () => useTermsStore(state => state.termsChecked);
export const useTermsAccepted = () => useTermsStore(state => state.termsAccepted);
export const useTermsError = () => useTermsStore(state => state.termsError);
export const useTermsAnimationKey = () => useTermsStore(state => state.termsAnimationKey);
export const useTermsIsValid = () => useTermsStore(state => state.isValid);

export const useTermsActions = () => useTermsStore(state => state.actions);
export const useValidateTerms = () => useTermsStore(state => state.actions.validateTerms);
