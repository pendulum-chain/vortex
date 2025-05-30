import { createPublicClient, encodeFunctionData, http } from 'viem';
import { moonbeam } from 'viem/chains';
import { AXL_USDC_MOONBEAM, EvmTokenDetails, getNetworkId, Networks } from 'shared';
import { createOnrampRouteParams, getRoute } from './route';

import erc20ABI from '../../../../contracts/ERC20';

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

  try {
    const routeResult = await getRoute(routeParams);

    const { route } = routeResult.data;
    const { transactionRequest } = route;

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
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
    };

    const swapData = {
      to: transactionRequest.target as `0x${string}`,
      data: transactionRequest.data,
      value: transactionRequest.value,
      gas: transactionRequest.gasLimit,
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      nonce: params.moonbeamEphemeralStartingNonce + 1,
    };

    return {
      approveData,
      swapData,
    };
  } catch (e) {
    throw new Error(`Error getting route: ${routeParams}. Error: ${e}`);
  }
}
