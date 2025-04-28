import { decodeSubmittableExtrinsic, getNetworkId, isEvmTransactionData, UnsignedTx } from 'shared';
import { sendTransaction } from '@wagmi/core';
import { ApiPromise } from '@polkadot/api';
import { wagmiConfig } from '../../wagmiConfig';
import { waitForTransactionConfirmation } from '../../helpers/safe-wallet/waitForTransactionConfirmation';
import { WalletAccount } from '@talismn/connect-wallets';
import { ISubmittableResult, Signer } from '@polkadot/types/types';

// Sign the transaction with the user's connected wallet.
export async function signAndSubmitEvmTransaction(unsignedTx: UnsignedTx): Promise<string> {
  const { network, txData } = unsignedTx;

  if (!isEvmTransactionData(txData)) {
    throw new Error('Invalid EVM transaction data format for signing transaction');
  }

  const chainId = getNetworkId(network);

  console.log('About to send transaction for phase', unsignedTx.phase);
  const hash = await sendTransaction(wagmiConfig, {
    to: txData.to,
    data: txData.data,
    value: BigInt(txData.value),
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
  const { txData } = unsignedTx;

  if (isEvmTransactionData(txData)) {
    throw new Error('Invalid Substrate transaction data format for signing transaction');
  }

  const extrinsic = decodeSubmittableExtrinsic(txData, api);
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
    ).catch((error) => {
      // Most likely, the user cancelled the signing process.
      console.error('Error signing and submitting transaction', error);
      reject('Error signing and sending transaction:' + error);
    });
  });
}
