import { create } from 'zustand';
import Big from 'big.js';
import { InputTokenDetails, OutputTokenDetails } from '../constants/tokenConfig';

interface FormState {
  fromAmount?: Big;
  fromToken?: InputTokenDetails;
  toToken?: OutputTokenDetails;
}

interface FormStoreActions {
  setFromAmount: (amount?: Big) => void;
  setFromToken: (token?: InputTokenDetails) => void;
  setToToken: (token?: OutputTokenDetails) => void;
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
    setToToken: (token?: OutputTokenDetails) => set({ toToken: token }),
  },
}));

export const useFromAmount = () => useFormStore((state) => state.fromAmount);
export const useFromToken = () => useFormStore((state) => state.fromToken);
export const useToToken = () => useFormStore((state) => state.toToken);

export const useFormStoreActions = () => useFormStore((state) => state.actions);
