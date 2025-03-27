import { createPublicClient, encodeFunctionData, http } from 'viem';
import { moonbeam } from 'viem/chains';
import { Networks } from '../../../helpers/networks';
import { createOfframpRouteParams, getRoute } from './route';
import erc20ABI from '../../../../contracts/ERC20';
import { EvmTokenDetails } from '../../../../config/tokens';

export interface OfframpSquidrouterParams {
  fromAddress: string;
  rawAmount: string;
  inputTokenDetails: EvmTokenDetails;
  fromNetwork: Networks;
  addressDestination: string;
}

export interface OfframpTransactionData {
  approveData: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
    gas: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  swapData: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    gas: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
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

  const receivingContractAddress = '0x2AB52086e8edaB28193172209407FF9df1103CDc'; // TODO move this to some config
  const squidRouterReceiverHash = '0x1234'; // TODO generate this unique hash
  const routeParams = createOfframpRouteParams(
    params.fromAddress,
    params.rawAmount,
    params.inputTokenDetails,
    params.fromNetwork,
    params.addressDestination,
    receivingContractAddress,
    squidRouterReceiverHash,
  );

  const routeResult = await getRoute(routeParams);
  const route = routeResult.data.route;
  const transactionRequest = route.transactionRequest;

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
      data: approveTransactionData,
      value: 0n,
      gas: '150000',
      maxFeePerGas: String(maxFeePerGas),
      maxPriorityFeePerGas: String(maxPriorityFeePerGas),
    },
    swapData: {
      to: transactionRequest.target as `0x${string}`,
      data: transactionRequest.data,
      value: transactionRequest.value,
      gas: transactionRequest.gasLimit,
      maxFeePerGas: String(maxFeePerGas),
      maxPriorityFeePerGas: String(maxPriorityFeePerGas),
    },
  };
}
