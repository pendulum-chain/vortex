import SafeApiKit from "@safe-global/api-kit";
import { getChainId, waitForTransactionReceipt } from "@wagmi/core";
import { Hash } from "viem";

import { useSafeWalletSignatureStore } from "../../stores/safeWalletSignaturesStore";
import { wagmiConfig } from "../../wagmiConfig";
import { isTransactionHashSafeWallet } from "./isTransactionSafeWallet";

/**
 * Waits for a transaction to be confirmed, handling both regular and Safe Wallet transactions.
 * For Safe Wallet transactions, it monitors both the Safe API for signatures and the blockchain for confirmation.
 * For regular transactions, it simply waits for blockchain confirmation.
 *
 * @param hash - The transaction hash to monitor
 * @returns A promise that resolves to the final transaction hash
 */
export async function waitForTransactionConfirmation(hash: Hash, chainId: number): Promise<Hash> {
  const isSafeWalletTransaction = await isTransactionHashSafeWallet(hash, chainId);

  if (isSafeWalletTransaction) {
    // Wait for all required signatures via Safe API
    const transactionHash = await pollSafeWalletTransaction(hash);

    // Wait for on-chain confirmation
    await waitForTransactionReceipt(wagmiConfig, { hash: transactionHash });
    return transactionHash;
  }

  await waitForTransactionReceipt(wagmiConfig, { hash });
  return hash;
}

export interface SafeTransactionResponse {
  confirmations: unknown[];
  confirmationsRequired: number;
  isSuccessful: boolean;
  transactionHash?: Hash;
}

/**
 * Polls the Safe API until a transaction is fully signed by all required signers.
 * Updates the signature status during polling to track progress.
 *
 * @param hash - The Safe transaction hash to poll
 * @param delay - Time in milliseconds between polling attempts (default: 5000)
 * @returns A promise that resolves to the final transaction hash once fully signed
 */
async function pollSafeWalletTransaction(hash: Hash, delay = 5000): Promise<Hash> {
  const chainId = getChainId(wagmiConfig);
  const safeApiKit = new SafeApiKit({
    chainId: BigInt(chainId)
  });

  const safeTransaction = await safeApiKit.getTransaction(hash);

  useSafeWalletSignatureStore.getState().updateSafeWalletSignatureStatus(safeTransaction as SafeTransactionResponse);

  if (safeTransaction.isSuccessful) {
    return safeTransaction.transactionHash as Hash;
  }

  await new Promise(resolve => setTimeout(resolve, delay));
  return pollSafeWalletTransaction(hash, delay);
}
