import { create } from 'zustand';
import Big from 'big.js';
import { InputTokenDetails, BaseInputTokenDetails } from '../constants/tokenConfig';

interface FormState {
  fromAmount?: Big;
  fromToken?: InputTokenDetails;
  toToken?: BaseInputTokenDetails;
}

interface FormStoreActions {
  setFromAmount: (amount?: Big) => void;
  setFromToken: (token?: InputTokenDetails) => void;
  setToToken: (token?: BaseInputTokenDetails) => void;
}

type FormStore = FormState & {
  actions: FormStoreActions;
};

const useFormStore = create<FormStore>((set) => ({
  fromAmount: undefined,
  fromToken: undefined,
  toToken: undefined,

  actions: {
    setFromAmount: (amount?: Big) => set({ fromAmount: amount }),
    setFromToken: (token?: InputTokenDetails) => set({ fromToken: token }),
    setToToken: (token?: BaseInputTokenDetails) => set({ toToken: token }),
  },
}));

export const useFromAmount = () => useFormStore((state) => state.fromAmount);
export const useFromToken = () => useFormStore((state) => state.fromToken);
export const useToToken = () => useFormStore((state) => state.toToken);

export const useFormStoreActions = () => useFormStore((state) => state.actions);
