import { EvmToken, FiatToken, Networks, OnChainToken } from 'shared';
import { create } from 'zustand';

export const DEFAULT_FIAT_TOKEN = FiatToken.BRL;
export const DEFAULT_BRL_AMOUNT = '5';
export const DEFAULT_EURC_AMOUNT = '20';
export const DEFAULT_ARS_AMOUNT = '20';

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

const storedNetwork = localStorage.getItem('SELECTED_NETWORK');

export const DEFAULT_RAMP_FORM_STORE_VALUES: RampFormState = {
  inputAmount: DEFAULT_BRL_AMOUNT,
  onChainToken: storedNetwork !== null && storedNetwork === Networks.AssetHub ? EvmToken.USDC : EvmToken.USDT,
  fiatToken: DEFAULT_FIAT_TOKEN,
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
