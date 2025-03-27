import { createPublicClient, encodeFunctionData, http } from 'viem';
import { moonbeam } from 'viem/chains';

import { Networks } from '../../../helpers/networks';
import { createOnrampRouteParams, getRoute } from './route';

import erc20ABI from '../../../../contracts/ERC20';
import { AXL_USDC_MOONBEAM, EvmTokenDetails } from '../../../../config/tokens';

export interface OnrampSquidrouterParams {
  fromAddress: string;
  rawAmount: string;
  outputTokenDetails: EvmTokenDetails;
  toNetwork: Networks;
  addressDestination: string;
  moonbeamEphemeralStartingNonce: number;
}

export interface OnrampTransactionData {
  approveData: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    gas: string;
    nonce: number;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  swapData: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    gas: string;
    nonce: number;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
}

export async function createOnrampSquidrouterTransactions(
  params: OnrampSquidrouterParams,
): Promise<OnrampTransactionData> {
  if (params.toNetwork === Networks.AssetHub) {
    throw new Error('AssetHub is not supported for Squidrouter onramp');
  }

  const publicClient = createPublicClient({
    chain: moonbeam,
    transport: http(),
  });

  const routeParams = createOnrampRouteParams(
    params.fromAddress,
    params.rawAmount,
    params.outputTokenDetails,
    params.toNetwork,
    params.addressDestination,
  );
  const routeResult = await getRoute(routeParams);

  const route = routeResult.data.route;

  const transactionRequest = route.transactionRequest;

  const approveTransactionData = encodeFunctionData({
    abi: erc20ABI,
    functionName: 'approve',
    args: [transactionRequest?.target, params.rawAmount],
  });

  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

  // Create transaction data objects
  const approveData = {
    to: AXL_USDC_MOONBEAM as `0x${string}`,
    data: approveTransactionData,
    value: '0',
    nonce: params.moonbeamEphemeralStartingNonce,
    gas: '150000',
    maxFeePerGas: String(maxFeePerGas),
  };

  const swapData = {
    to: transactionRequest.target as `0x${string}`,
    data: transactionRequest.data,
    value: transactionRequest.value,
    gas: transactionRequest.gasLimit,
    maxFeePerGas: String(maxFeePerGas),
    nonce: params.moonbeamEphemeralStartingNonce + 1,
  };

  // Alternative way, untested.
  // const keyring = new Keyring({ type: 'ethereum' });

  // const ephemeralKeypair = keyring.addFromUri(`${params.moonbeamEphemeralSeed}/m/44'/60'/${0}'/${0}/${0}`);

  // const swapEvmCall =  params.moonbeamNode.api.tx.evm.call(params.moonbeamEphemeralAddress, transactionRequest.target, transactionRequest.data,  transactionRequest.value,  transactionRequest.gasLimit, maxFeePerGas, undefined, undefined, undefined);
  // const signedSwapEvmCall = await swapEvmCall.signAsync(ephemeralKeypair, {nonce: params.moonbeamEphemeralStartingNonce + 1});

  // console.log('Swap transaction prepared substrate: ', encodeSubmittableExtrinsic(signedSwapEvmCall));

  // Return both signed transactions and transaction data
  return {
    approveData,
    swapData,
  };
}
