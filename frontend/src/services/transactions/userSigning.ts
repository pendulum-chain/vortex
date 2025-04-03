import { decodeSubmittableExtrinsic, getNetworkId, isEvmTransactionData, UnsignedTx } from 'shared';
import { sendTransaction } from '@wagmi/core';
import { ApiPromise } from '@polkadot/api';
import { wagmiConfig } from '../../wagmiConfig';
import { waitForTransactionConfirmation } from '../../helpers/safe-wallet/waitForTransactionConfirmation';
import { WalletAccount } from '@talismn/connect-wallets';
import { ISubmittableResult, Signer } from '@polkadot/types/types';

// Sign the transaction with the user's connected wallet.
export async function signAndSubmitEvmTransaction(unsignedTx: UnsignedTx): Promise<string> {
  const { network, tx_data } = unsignedTx;

  if (!isEvmTransactionData(tx_data)) {
    throw new Error('Invalid EVM transaction data format for signing transaction');
  }

  const chainId = getNetworkId(network);

  console.log('About to send transaction for phase', unsignedTx.phase);
  const hash = await sendTransaction(wagmiConfig, {
    to: tx_data.to,
    data: tx_data.data,
    value: BigInt(tx_data.value),
  });
  console.log('Transaction sent', hash);

  const confirmedHash = await waitForTransactionConfirmation(hash, chainId);
  console.log('Transaction confirmed', confirmedHash);
  return confirmedHash;
}

/// Sign the transaction with the user's connected wallet. The api needs to be for the correct network.
export async function signAndSubmitSubstrateTransaction(
  unsignedTx: UnsignedTx,
  api: ApiPromise,
  walletAccount: WalletAccount,
): Promise<string> {
  const { tx_data } = unsignedTx;

  if (isEvmTransactionData(tx_data)) {
    throw new Error('Invalid Substrate transaction data format for signing transaction');
  }

  const extrinsic = decodeSubmittableExtrinsic(tx_data, api);
  return new Promise((resolve, reject) => {
    let inBlockHash: string | null = null;

    extrinsic.signAndSend(
      walletAccount.address,
      {
        signer: walletAccount.signer as Signer,
      },
      (submissionResult: ISubmittableResult) => {
        const { status, events, dispatchError } = submissionResult;

        if (status.isInBlock && !inBlockHash) {
          inBlockHash = status.asInBlock.toString();
        }

        if (status.isFinalized) {
          const hash = status.asFinalized.toString();

          // Try to find a 'system.ExtrinsicFailed' event
          if (dispatchError) {
            reject('Substrate transaction execution failed');
          }

          resolve(hash);
        }
      },
    );
  });
}
