import { create } from "zustand";

import { SafeTransactionResponse } from "../helpers/safe-wallet/waitForTransactionConfirmation";

interface SafeTransactionStatus {
  currentConfirmations: number;
  requiredConfirmations: number;
}

interface SafeWalletSignatureState {
  confirmations: {
    required: number;
    current: number;
  };
  setSigners: (required: number, current: number) => void;
  reset: () => void;
  updateSafeWalletSignatureStatus: (safeTransaction: SafeTransactionResponse) => SafeTransactionStatus;
}

/**
 * When using a Safe Wallet, sometimes several signatures are required to confirm a transaction.
 * This store is used to track the number of signatures required and the number of signatures that have been confirmed.
 */

export const useSafeWalletSignatureStore = create<SafeWalletSignatureState>((set, get) => ({
  confirmations: {
    required: 0,
    current: 0
  },
  setSigners: (required: number, current: number) => set({ confirmations: { required, current } }),
  reset: () => set({ confirmations: { required: 0, current: 0 } }),
  /**
   * Updates the global signature status store based on a Safe transaction's current state.
   * Tracks the number of confirmations received vs required, and resets when complete.
   *
   * @param safeTransaction - The transaction response from Safe API
   * @returns The current confirmation status
   */
  updateSafeWalletSignatureStatus: (safeTransaction: SafeTransactionResponse) => {
    const status: SafeTransactionStatus = {
      currentConfirmations: safeTransaction.confirmations?.length ?? 0,
      requiredConfirmations: safeTransaction.confirmationsRequired ?? 0
    };

    get().setSigners(status.requiredConfirmations, status.currentConfirmations);

    if (safeTransaction.isSuccessful) {
      get().reset();
    }

    return status;
  }
}));
