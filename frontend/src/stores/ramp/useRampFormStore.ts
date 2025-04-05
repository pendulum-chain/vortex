import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import Big from 'big.js';
import { UseFormReturn } from 'react-hook-form';
import { FiatToken, OnChainToken } from 'shared';

import { SwapFormValues } from '../../components/Nabla/schema';

interface RampFormState {
  // Form state (the form itself is managed in a hook, not in the store)
  fromAmount: Big | undefined;
  fromAmountString: string;
  from: OnChainToken;
  to: FiatToken;
  taxId: string | undefined;
  pixId: string | undefined;

  // Token selection modal state
  isTokenSelectModalVisible: boolean;
  tokenSelectModalType: 'from' | 'to' | null;

  // Actions
  setFrom: (token: OnChainToken) => void;
  setTo: (token: FiatToken) => void;
  onFromChange: (amount: string) => void;
  onToChange: (amount: string) => void;
  setFormValues: (form: UseFormReturn<SwapFormValues>) => void;
  openTokenSelectModal: (type: 'from' | 'to') => void;
  closeTokenSelectModal: () => void;
  setTaxId: (taxId: string) => void;
  setPixId: (pixId: string) => void;
  reset: () => void;
}

/**
 * Store for managing the ramp form state
 * Handles form values, token selection, and related UI state
 */
export const useRampFormStore = create<RampFormState>()(
  devtools(
    (set) => ({
      // Initial state
      fromAmount: undefined,
      fromAmountString: '',
      // Default tokens would be set based on the application's needs
      from: 'usdc' as OnChainToken,
      to: 'eurc' as FiatToken,
      taxId: undefined,
      pixId: undefined,
      isTokenSelectModalVisible: false,
      tokenSelectModalType: null,

      // Actions for updating state
      setFrom: (token: OnChainToken) => {
        set({ from: token });
      },

      setTo: (token: FiatToken) => {
        set({ to: token });
      },

      onFromChange: (amount: string) => {
        try {
          const parsedAmount = amount ? Big(amount) : undefined;
          set({
            fromAmount: parsedAmount,
            fromAmountString: amount
          });
        } catch (error) {
          console.error('Invalid amount input:', error);
        }
      },

      onToChange: (amount: string) => {
        // Just a no-op implementation - actual form values handled in useRampForm
      },

      setFormValues: (_form: UseFormReturn<SwapFormValues>) => {
        // No-op in store - form state is managed in the useRampForm hook
      },

      openTokenSelectModal: (type: 'from' | 'to') => {
        set({
          isTokenSelectModalVisible: true,
          tokenSelectModalType: type
        });
      },

      closeTokenSelectModal: () => {
        set({
          isTokenSelectModalVisible: false,
          tokenSelectModalType: null
        });
      },

      setTaxId: (taxId: string) => {
        set({ taxId });
      },

      setPixId: (pixId: string) => {
        set({ pixId });
      },

      reset: () => {
        set({
          fromAmount: undefined,
          fromAmountString: '',
          taxId: undefined,
          pixId: undefined,
          isTokenSelectModalVisible: false,
          tokenSelectModalType: null,
        });
      },
    }),
    { name: 'ramp-form-store' }
  )
);