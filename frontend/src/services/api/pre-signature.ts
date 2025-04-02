/**
 * pre-signature.ts
 *
 * Service to sign unsigned transactions for different networks.
 *
 * The signUnsignedTransactions function receives:
 * - unsignedTxs: an array of UnsignedTx
 * - ephemerals: an object mapping networks to EphemeralAccount for Stellar, Pendulum (substrate),
 *   and EVM (Moonbeam) transactions.
 *
 * For each unsigned transaction, the function selects the appropriate signing method:
 *
 * • Stellar:
 *   - Uses stellar-sdk to create a Transaction from the provided XDR (tx_data).
 *   - Signs using the ephemeral key (assumed to be passed).
 *   - IMPORTANT: Transactions must be signed in order as signing increases the sequence number of the account object.
 *
 * • Pendulum (substrate):
 *   - Uses @polkadot/api Keyring to generate a keypair from the ephemeral secret.
 *   - Simulates signing via extrinsic.signAsync - in a real implementation, the unsigned transaction
 *     would be decoded to an extrinsic, and signAsync would be called with options { nonce, era }.
 *
 * • Moonbeam (EVM):
 *   - Uses the viem client to create a wallet client.
 *   - Signs the transaction via walletClient.signTransaction.
 */

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Keyring } from '@polkadot/api';
import { Transaction, Keypair, Networks as StellarNetworks, Horizon, TransactionBuilder } from 'stellar-sdk';
import { ApiPromise } from '@polkadot/api';
import { moonbeam } from 'viem/chains';
import { HORIZON_URL, isEvmTransactionData, PresignedTx, UnsignedTx } from 'shared';

import { EphemeralAccount } from '../ephemerals';
import { Extrinsic } from '@pendulum-chain/api-solang';
import { sendTransaction, signMessage, writeContract } from '@wagmi/core';
import { wagmiConfig } from '../../wagmiConfig';

export const horizonServer = new Horizon.Server(HORIZON_URL);

/**
 * Signs an array of unsigned transactions using network-specific methods.
 *
 * @param unsignedTxs - Array of transactions to be signed.
 * @param ephemerals - Mapping from network to its corresponding EphemeralAccount.
 *                     Expected keys: stellar, pendulum, evm.
 * @param pendulumApi - ApiPromise instance for Pendulum transactions.
 * @returns Promise resolving to an array of SignedTx.
 */
export async function signUnsignedTransactions(
  unsignedTxs: UnsignedTx[],
  ephemerals: { stellar?: EphemeralAccount; pendulum?: EphemeralAccount; evm?: EphemeralAccount },
  pendulumApi: ApiPromise,
): Promise<PresignedTx[]> {
  const signedTxs: PresignedTx[] = [];

  try {
    const stellarTxs = unsignedTxs.filter((tx) => tx.network === 'stellar').sort((a, b) => a.nonce - b.nonce);
    const pendulumTxs = unsignedTxs.filter((tx) => tx.network === 'pendulum');
    const moonbeamTxs = unsignedTxs.filter((tx) => tx.network === 'moonbeam');

    // Process Stellar transactions first in sequence order
    if (stellarTxs.length > 0) {
      if (!ephemerals.stellar) {
        throw new Error('Missing Stellar ephemeral account');
      }

      const networkPassphrase = StellarNetworks.PUBLIC;
      const keypair = Keypair.fromSecret(ephemerals.stellar.secret);

      for (const tx of stellarTxs) {
        if (isEvmTransactionData(tx.tx_data)) {
          throw new Error('Invalid Stellar transaction data format');
        }
        const transaction = new Transaction(tx.tx_data, networkPassphrase);

        // TODO check. Signs in place? increases sequence number of keypair object?
        transaction.sign(keypair);

        const signedTxData = transaction.toEnvelope().toXDR().toString('base64');
        signedTxs.push({ ...tx, tx_data: signedTxData });
      }
    }

    for (const tx of pendulumTxs) {
      if (!ephemerals.pendulum) {
        throw new Error('Missing Pendulum ephemeral account');
      }

      if (!pendulumApi) {
        throw new Error('Pendulum API is required for signing transactions');
      }

      if (isEvmTransactionData(tx.tx_data)) {
        throw new Error('Invalid Pendulum transaction data format');
      }

      const keyring = new Keyring({ type: 'sr25519' });
      const keypair = keyring.addFromUri(ephemerals.pendulum.secret);

      const extrinsic = decodeSubmittableExtrinsic(tx.tx_data, pendulumApi);

      await extrinsic.signAsync(keypair, { nonce: tx.nonce, era: 0 });

      const signedTxData = extrinsic.toHex();
      signedTxs.push({ ...tx, tx_data: signedTxData });
    }

    for (const tx of moonbeamTxs) {
      if (!ephemerals.evm) {
        throw new Error('Missing EVM ephemeral account');
      }
      if (!isEvmTransactionData(tx.tx_data)) {
        throw new Error('Invalid EVM transaction data format');
      }

      const evmAccount = privateKeyToAccount(`0x${ephemerals.evm.secret.replace(/^0x/, '')}`);

      const walletClient = createWalletClient({
        account: evmAccount,
        chain: moonbeam,
        transport: http(),
      });

      const signedTxData = await walletClient.signTransaction({
        account: evmAccount,
        data: tx.tx_data.data,
      });

      signedTxs.push({ ...tx, tx_data: signedTxData });
    }
  } catch (error) {
    console.error('Error signing transactions:', error);
    throw error;
  }

  return signedTxs;
}

// Sign the transaction with the user's connected wallet
async function signUserTransaction(unsignedTx: UnsignedTx) {
  const { network, tx_data } = unsignedTx;

  if (isEvmTransactionData(tx_data)) {
    const signedData = await signMessage(wagmiConfig, { message: { raw: tx_data.data } });

    await sendTransaction(wagmiConfig, {
      to: tx_data.to,
      data: signedData,
      value: BigInt(tx_data.value),
      maxFeePerGas: tx_data.maxFeePerGas ? BigInt(tx_data.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: tx_data.maxPriorityFeePerGas ? BigInt(tx_data.maxPriorityFeePerGas) : undefined,
    });
  }
}

// TODO move to shared
function decodeSubmittableExtrinsic(encodedExtrinsic: string, api: ApiPromise) {
  return api.tx(encodedExtrinsic);
}

function encodeSubmittableExtrinsic(extrinsic: Extrinsic) {
  return extrinsic.toHex();
}
