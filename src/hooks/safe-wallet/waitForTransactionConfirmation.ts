import SafeApiKit from '@safe-global/api-kit';
import { waitForTransactionReceipt, getChainId } from '@wagmi/core';
import { Hash } from 'viem';

import { isTransactionHashSafeWallet } from './isTransactionSafeWallet';
import { wagmiConfig } from '../../wagmiConfig';
import { useSignatureStore } from '../../components/SigningBox';

/**
 * Detects if a transaction is a Safe Wallet transaction and waits for it to be confirmed by the Safe Wallet API and the blockchain.
 *
 * @param hash - The hash of the transaction to wait for.
 * @returns The confirmed transaction hash.
 */
export async function waitForTransactionConfirmation(hash: Hash): Promise<Hash> {
  const isSafeWalletTransaction = await isTransactionHashSafeWallet(hash);

  if (isSafeWalletTransaction) {
    // Wait for the transaction to be confirmed by the Safe Wallet API
    const transactionHash = await pollSafeTransaction(hash);

    // Wait for the transaction to be confirmed by the blockchain
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

interface UpdateSignatureStatusProps {
  confirmations: unknown[];
  confirmationsRequired: number;
  isSuccessful: boolean;
}
/**
 * Extracts and updates the signature status from a Safe transaction
 * @param safeTransaction The Safe transaction response
 */
function updateSignatureStatus(safeTransaction: UpdateSignatureStatusProps): SafeTransactionStatus {
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
 * If the transaction has to be signed by several signers, it may take some time for the transaction to be confirmed.
 * This function polls the Safe Wallet API for the transaction and returns the confirmed transaction.
 *
 * @param hash - The hash of the transaction to poll.
 * @param delay - The delay between polls in milliseconds.
 * @returns The confirmed transaction and its status.
 */
async function pollSafeTransaction(hash: Hash, delay = 5000): Promise<Hash> {
  const chainId = getChainId(wagmiConfig);
  const safeApiKit = new SafeApiKit({
    chainId: BigInt(chainId),
  });

  const safeTransaction = await safeApiKit.getTransaction(hash);

  updateSignatureStatus(safeTransaction as UpdateSignatureStatusProps);

  if (safeTransaction.isSuccessful) {
    return safeTransaction.transactionHash as Hash;
  }

  await new Promise((resolve) => setTimeout(resolve, delay));
  return pollSafeTransaction(hash, delay);
}
