import { create } from 'zustand';
import Big from 'big.js';
import { InputTokenDetails, BaseInputTokenDetails } from '../constants/tokenConfig';

interface FormState {
  fromAmount?: Big;
  fromToken?: InputTokenDetails;
  toToken?: BaseInputTokenDetails;
  taxId?: string;
  pixId?: string;
}

interface FormStoreActions {
  setFromAmount: (amount?: Big) => void;
  setFromToken: (token?: InputTokenDetails) => void;
  setToToken: (token?: BaseInputTokenDetails) => void;
  setTaxId: (taxId: string) => void;
  setPixId: (pixId: string) => void;
}

type FormStore = FormState & {
  actions: FormStoreActions;
};

export const useFormStore = create<FormStore>((set) => ({
  fromAmount: undefined,
  fromToken: undefined,
  toToken: undefined,

  actions: {
    setFromAmount: (amount?: Big) => set({ fromAmount: amount }),
    setFromToken: (token?: InputTokenDetails) => set({ fromToken: token }),
    setToToken: (token?: BaseInputTokenDetails) => set({ toToken: token }),
    setTaxId: (taxId: string) => set({ taxId }),
    setPixId: (pixId: string) => set({ pixId }),
  },
}));

export const useFromAmount = () => useFormStore((state) => state.fromAmount);
export const useFromToken = () => useFormStore((state) => state.fromToken);
export const useToToken = () => useFormStore((state) => state.toToken);
export const useTaxId = () => useFormStore((state) => state.taxId);
export const usePixId = () => useFormStore((state) => state.pixId);

export const useBrlaInputs = () => useFormStore((state) => ({ taxId: state.taxId, pixId: state.pixId }));

export const useFormStoreActions = () => useFormStore((state) => state.actions);
