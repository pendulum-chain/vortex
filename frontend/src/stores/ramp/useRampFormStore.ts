import { create } from 'zustand';
import Big from 'big.js';
import { FiatToken, OnChainToken } from 'shared';

interface RampFormState {
  inputAmount?: Big;
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  taxId?: string;
  pixId?: string;
}

interface RampFormActions {
  actions: {
    setInputAmount: (amount?: Big) => void;
    setOnChainToken: (token: OnChainToken) => void;
    setFiatToken: (token: FiatToken) => void;
    setTaxId: (taxId: string) => void;
    setPixId: (pixId: string) => void;
    reset: () => void;
  };
}

export const DEFAULT_RAMP_FORM_STORE_VALUES: RampFormState = {
  inputAmount: undefined,
  onChainToken: 'usdc' as OnChainToken,
  fiatToken: 'eurc' as FiatToken,
  taxId: undefined,
  pixId: undefined,
};

export const useRampFormStore = create<RampFormState & RampFormActions>((set) => ({
  ...DEFAULT_RAMP_FORM_STORE_VALUES,
  actions: {
    setInputAmount: (amount?: Big) => set({ inputAmount: amount }),
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
