
import { Horizon } from 'stellar-sdk';

import { getNetworkId, HORIZON_URL, isEvmTransactionData, PresignedTx, UnsignedTx } from 'shared';
import { sendTransaction } from '@wagmi/core';
import { wagmiConfig } from '../../wagmiConfig';
import { waitForTransactionConfirmation } from '../../helpers/safe-wallet/waitForTransactionConfirmation';

export const horizonServer = new Horizon.Server(HORIZON_URL);

// Sign the transaction with the user's connected wallet
export async function signUserTransaction(unsignedTx: UnsignedTx): Promise<string> {
  const { network, tx_data } = unsignedTx;

  if (isEvmTransactionData(tx_data)) {
    const chainId = getNetworkId(network);

    console.log('About to send transaction for phase', unsignedTx.phase);
    const hash = await sendTransaction(wagmiConfig, {
      to: tx_data.to,
      data: tx_data.data,
      value: BigInt(tx_data.value),
      // TODO seems like setting the gas limit to the received value is not correct. We can leave it out and let the
      // network estimate it.
      // maxFeePerGas: tx_data.maxFeePerGas ? BigInt(tx_data.maxFeePerGas) : undefined,
      // maxPriorityFeePerGas: tx_data.maxPriorityFeePerGas ? BigInt(tx_data.maxPriorityFeePerGas) : undefined,
    });
    console.log('Transaction sent', hash);

    const confirmedHash = await waitForTransactionConfirmation(hash, chainId);
    console.log('Transaction confirmed', confirmedHash);
    return confirmedHash;
  } else {
    // Must be a Substrate transaction
    // TODO implement this
    return '';
  }
}

