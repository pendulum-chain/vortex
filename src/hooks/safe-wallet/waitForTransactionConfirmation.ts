import SafeApiKit from '@safe-global/api-kit';
import { waitForTransactionReceipt, getChainId } from '@wagmi/core';
import { Hash } from 'viem';

import { isTransactionHashSafeWallet } from './isTransactionSafeWallet';
import { wagmiConfig } from '../../wagmiConfig';
import { useSignatureStore } from '../../components/SigningBox';

/**
 * Waits for a transaction to be confirmed, handling both regular and Safe Wallet transactions.
 * For Safe Wallet transactions, it monitors both the Safe API for signatures and the blockchain for confirmation.
 * For regular transactions, it simply waits for blockchain confirmation.
 *
 * @param hash - The transaction hash to monitor
 * @returns A promise that resolves to the final transaction hash
 */
export async function waitForTransactionConfirmation(hash: Hash): Promise<Hash> {
  const isSafeWalletTransaction = await isTransactionHashSafeWallet(hash);

  if (isSafeWalletTransaction) {
    // Wait for all required signatures via Safe API
    const transactionHash = await pollSafeTransaction(hash);

    // Wait for on-chain confirmation
    await waitForTransactionReceipt(wagmiConfig, { hash: transactionHash });
    return transactionHash;
  }

  await waitForTransactionReceipt(wagmiConfig, { hash });
  return hash;
}

interface SafeTransactionStatus {
  currentConfirmations: number;
  requiredConfirmations: number;
}

interface SafeTransactionResponse {
  confirmations: unknown[];
  confirmationsRequired: number;
  isSuccessful: boolean;
  transactionHash?: Hash;
}

/**
 * Updates the global signature status store based on a Safe transaction's current state.
 * Tracks the number of confirmations received vs required, and resets when complete.
 *
 * @param safeTransaction - The transaction response from Safe API
 * @returns The current confirmation status
 */
function updateSignatureStatus(safeTransaction: SafeTransactionResponse): SafeTransactionStatus {
  const status: SafeTransactionStatus = {
    currentConfirmations: safeTransaction.confirmations?.length ?? 0,
    requiredConfirmations: safeTransaction.confirmationsRequired ?? 0,
  };

  useSignatureStore.getState().setSigners(status.requiredConfirmations, status.currentConfirmations);

  if (safeTransaction.isSuccessful) {
    useSignatureStore.getState().reset();
  }

  return status;
}

/**
 * Polls the Safe API until a transaction is fully signed by all required signers.
 * Updates the signature status during polling to track progress.
 *
 * @param hash - The Safe transaction hash to poll
 * @param delay - Time in milliseconds between polling attempts (default: 5000)
 * @returns A promise that resolves to the final transaction hash once fully signed
 */
async function pollSafeTransaction(hash: Hash, delay = 5000): Promise<Hash> {
  const chainId = getChainId(wagmiConfig);
  const safeApiKit = new SafeApiKit({
    chainId: BigInt(chainId),
  });

  const safeTransaction = await safeApiKit.getTransaction(hash);

  updateSignatureStatus(safeTransaction as SafeTransactionResponse);

  if (safeTransaction.isSuccessful) {
    return safeTransaction.transactionHash as Hash;
  }

  await new Promise((resolve) => setTimeout(resolve, delay));
  return pollSafeTransaction(hash, delay);
}
