import { create } from 'zustand';
import { EvmToken, FiatToken, OnChainToken } from 'shared';

interface RampFormState {
  inputAmount?: string;
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  taxId?: string;
  pixId?: string;
}

interface RampFormActions {
  actions: {
    setInputAmount: (amount?: string) => void;
    setOnChainToken: (token: OnChainToken) => void;
    setFiatToken: (token: FiatToken) => void;
    setTaxId: (taxId: string) => void;
    setPixId: (pixId: string) => void;
    reset: () => void;
  };
}

export const DEFAULT_RAMP_FORM_STORE_VALUES: RampFormState = {
  inputAmount: undefined,
  onChainToken: EvmToken.USDC,
  fiatToken: FiatToken.EURC,
  taxId: undefined,
  pixId: undefined,
};

export const useRampFormStore = create<RampFormState & RampFormActions>((set) => ({
  ...DEFAULT_RAMP_FORM_STORE_VALUES,
  actions: {
    setInputAmount: (amount?: string) => set({ inputAmount: amount }),
    setOnChainToken: (token: OnChainToken) => set({ onChainToken: token }),
    setFiatToken: (token: FiatToken) => set({ fiatToken: token }),

    setTaxId: (taxId: string) => set({ taxId }),
    setPixId: (pixId: string) => set({ pixId }),

    reset: () => {
      set({
        ...DEFAULT_RAMP_FORM_STORE_VALUES,
      });
    },
  },
}));

export const useInputAmount = () => useRampFormStore((state) => state.inputAmount);
export const useOnChainToken = () => useRampFormStore((state) => state.onChainToken);
export const useFiatToken = () => useRampFormStore((state) => state.fiatToken);
export const useTaxId = () => useRampFormStore((state) => state.taxId);
export const usePixId = () => useRampFormStore((state) => state.pixId);

export const useRampFormStoreActions = () => useRampFormStore((state) => state.actions);
