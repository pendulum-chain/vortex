import SafeApiKit from '@safe-global/api-kit';
import { getTransaction } from '@wagmi/core';
import { Hash } from 'viem';

import { wagmiConfig } from '../../wagmiConfig';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Determines if a transaction hash belongs to a Safe Wallet transaction or a regular Ethereum transaction.
 *
 * Safe Wallet transactions are not stored directly on the blockchain, but rather in Safe's API.
 * When querying the blockchain for a Safe transaction hash, it will return null since that hash only exists
 * in Safe's system until the transaction is executed.
 *
 * The function first attempts to find the transaction on the blockchain. If found, it's considered a regular
 * Ethereum transaction. If not found, it checks the Safe API to determine if it's a Safe Wallet transaction.
 *
 * Note: When a Safe Wallet has only 1 signer required, it behaves like a regular EOA (Externally Owned Account)
 * and will produce regular Ethereum transactions.
 *
 * @param hash - The transaction hash to check
 * @param chainId - The chain ID of the network to check
 * @returns true if this is a Safe Wallet transaction, false if it's a regular Ethereum transaction
 */
export async function isTransactionHashSafeWallet(hash: Hash, chainId: number) {
  try {
    // Try to find the transaction on the blockchain
    // If found, it's a regular Ethereum transaction
    // If not found it throws an error, it might be a Safe Wallet transaction that hasn't been executed yet
    await getTransaction(wagmiConfig, { hash });

    // Transaction found on chain, so it's a regular Ethereum transaction
    // Note: If a transaction isn't found, it could be a Safe transaction or just not indexed by the node yet
    return false;
  } catch (error) {
    // Transaction not found on chain, check if it's a Safe Wallet transaction
    const safeApiKit = new SafeApiKit({
      chainId: BigInt(chainId),
    });

    try {
      const safeWalletTx = await safeApiKit.getSafeOperation(hash);

      return true;
    } catch (e) {
      // Wait for 1 second before retrying to help the node index the transaction
      await delay(1000);

      // Retry, maybe the node we're querying now has the transaction indexed
      return isTransactionHashSafeWallet(hash, chainId);
    }
  }
}
