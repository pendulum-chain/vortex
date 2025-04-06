import { create } from 'zustand';
import Big from 'big.js';
import { FiatToken, OnChainToken } from 'shared';

interface RampFormState {
  fromAmount?: Big;
  from: OnChainToken;
  to: FiatToken;
  taxId?: string;
  pixId?: string;

  actions: {
    setFromAmount: (amount?: Big) => void;
    setFrom: (token: OnChainToken) => void;
    setTo: (token: FiatToken) => void;
    setTaxId: (taxId: string) => void;
    setPixId: (pixId: string) => void;
  };
}

export const useRampFormStore = create<RampFormState>((set) => ({
  fromAmount: undefined,
  from: 'usdc' as OnChainToken,
  to: 'eurc' as FiatToken,
  taxId: undefined,
  pixId: undefined,
  actions: {
    setFrom: (token: OnChainToken) => {
      set({ from: token });
    },

    setTo: (token: FiatToken) => {
      set({ to: token });
    },

    setTaxId: (taxId: string) => {
      set({ taxId });
    },

    setFromAmount: (amount?: Big) => set({ fromAmount: amount }),
    setPixId: (pixId: string) => {
      set({ pixId });
    },
  },
}));

export const useFromAmount = () => useRampFormStore((state) => state.fromAmount);
export const useFromToken = () => useRampFormStore((state) => state.from);
export const useToToken = () => useRampFormStore((state) => state.to);
export const useTaxId = () => useRampFormStore((state) => state.taxId);
export const usePixId = () => useRampFormStore((state) => state.pixId);

export const useRampFormStoreActions = () => useRampFormStore((state) => state.actions);
