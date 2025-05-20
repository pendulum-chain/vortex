import { createPublicClient, encodeFunctionData, http } from 'viem';
import { moonbeam } from 'viem/chains';
import { EvmTokenDetails, EvmTransactionData, getNetworkFromDestination, Networks } from 'shared';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { createOfframpRouteParams, getRoute } from './route';
import erc20ABI from '../../../../contracts/ERC20';
import { createRandomString, createSquidRouterHash } from '../../../helpers/squidrouter';
import encodePayload from './payload';
import { getSquidRouterConfig } from './config';

export interface OfframpSquidrouterParams {
  fromAddress: string;
  rawAmount: string;
  inputTokenDetails: EvmTokenDetails;
  fromNetwork: Networks;
  pendulumAddressDestination: string;
}

export interface OfframpTransactionData {
  approveData: EvmTransactionData;
  swapData: EvmTransactionData;
  squidRouterReceiverId: string;
  squidRouterReceiverHash: string;
}

export async function createOfframpSquidrouterTransactions(
  params: OfframpSquidrouterParams,
): Promise<OfframpTransactionData> {
  if (params.fromNetwork === Networks.AssetHub) {
    throw new Error('AssetHub is not supported for Squidrouter offramp');
  }

  const publicClient = createPublicClient({
    chain: moonbeam,
    transport: http(),
  });

  const squidRouterReceiverId = createRandomString(32);
  const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(params.pendulumAddressDestination));
  const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);
  const squidRouterReceiverHash = createSquidRouterHash(squidRouterReceiverId, squidRouterPayload);
  const { receivingContractAddress } = getSquidRouterConfig(params.fromNetwork);

  const routeParams = createOfframpRouteParams(
    params.fromAddress,
    params.rawAmount,
    params.inputTokenDetails,
    params.fromNetwork,
    receivingContractAddress,
    squidRouterReceiverHash,
  );

  const routeResult = await getRoute(routeParams);
  const { route } = routeResult.data;
  const { transactionRequest } = route;

  const approveTransactionData = encodeFunctionData({
    abi: erc20ABI,
    // address: params.inputToken.erc20AddressSourceChain, // TODO somehow this parameter cannot be specified?
    functionName: 'approve',
    args: [transactionRequest?.target, params.rawAmount],
  });

  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

  return {
    approveData: {
      to: params.inputTokenDetails.erc20AddressSourceChain as `0x${string}`, // TODO check if this is correct
      data: approveTransactionData as `0x${string}`,
      value: '0',
      gas: '150000',
      maxFeePerGas: String(maxFeePerGas),
      maxPriorityFeePerGas: String(maxFeePerGas),
    },
    swapData: {
      to: transactionRequest.target as `0x${string}`,
      data: transactionRequest.data as `0x${string}`,
      value: transactionRequest.value,
      gas: transactionRequest.gasLimit, // TODO do we still need * 2 here?
      maxFeePerGas: String(maxFeePerGas),
      maxPriorityFeePerGas: String(maxFeePerGas),
    },
    squidRouterReceiverId,
    squidRouterReceiverHash,
  };
}
