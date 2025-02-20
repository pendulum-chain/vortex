import { getTransaction } from '@wagmi/core';
import { Hash } from 'viem';

import { wagmiConfig } from '../../wagmiConfig';

/**
 * Determines if a transaction hash belongs to a Safe Wallet transaction or a regular Ethereum transaction.
 *
 * Safe Wallet transactions are not stored directly on the blockchain, but rather in Safe's API.
 * When querying the blockchain for a Safe transaction hash, it will return null since that hash only exists
 * in Safe's system until the transaction is executed.
 *
 * [!] When SAFE Wallet account has only 1 signer required it works as regular EOA and returns regular Ethereum transaction.
 *
 * @param hash - The transaction hash to check. Can be either:
 *              - A regular Ethereum transaction hash
 *              - A Safe transaction hash (safeTxHash) from Safe Wallet
 * @returns true if this is a Safe Wallet transaction, false if it's a regular Ethereum transaction
 */

export async function isTransactionHashSafeWallet(hash: Hash) {
  try {
    // Try to find the transaction on the blockchain
    // If found, it's a regular Ethereum transaction
    // If not found or throws error, it must be a Safe Wallet transaction that hasn't been executed yet
    const tx = await getTransaction(wagmiConfig, { hash });

    // Return true for Safe Wallet transactions (not found on chain)
    // Return false for regular Ethereum transactions (found on chain)
    return !tx;
  } catch (error) {
    // If getTransaction throws an error, assume it's a Safe transaction
    return true;
  }
}
