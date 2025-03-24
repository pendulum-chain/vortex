import { createPublicClient, encodeFunctionData, http } from 'viem';
import { moonbeam } from 'viem/chains';
import { Networks } from '../../../helpers/networks';
import { createOfframpRouteParams, getRoute } from './route';
import erc20ABI from '../../../../contracts/ERC20';
import { EvmToken, EvmTokenDetails, getOnChainTokenDetails } from '../../../../config/tokens';

export interface OfframpSquidrouterParams {
  fromAddress: string;
  amount: string;
  inputToken: EvmToken;
  fromNetwork: Networks;
  addressDestination: string;
}

export interface OfframpTransactionData {
  approveData: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
    gas: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  };
  swapData: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
    gas: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  };
}

export async function createUnsignedOfframpSquidrouterTransactions(
  params: OfframpSquidrouterParams,
): Promise<OfframpTransactionData> {
  if (params.fromNetwork === Networks.AssetHub) {
    throw new Error('AssetHub is not supported for Squidrouter offramp');
  }

  const publicClient = createPublicClient({
    chain: moonbeam,
    transport: http(),
  });

  const inputTokenDetails = getOnChainTokenDetails(params.fromNetwork, params.inputToken) as EvmTokenDetails;
  if (!inputTokenDetails) {
    throw new Error(`Token ${params.inputToken} is not supported for Squidrouter offramp`);
  }

  const receivingContractAddress = '0x2AB52086e8edaB28193172209407FF9df1103CDc'; // TODO move this to some config
  const squidRouterReceiverHash = '0x1234'; // TODO generate this unique hash
  const routeParams = createOfframpRouteParams(
    params.fromAddress,
    params.amount,
    params.inputToken,
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
    args: [transactionRequest?.target, params.amount],
  });

  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

  return {
    approveData: {
      to: inputTokenDetails.erc20AddressSourceChain as `0x${string}`, // TODO check if this is correct
      data: approveTransactionData,
      value: 0n,
      gas: BigInt(150000),
      maxFeePerGas,
      maxPriorityFeePerGas,
    },
    swapData: {
      to: transactionRequest.target as `0x${string}`,
      data: transactionRequest.data,
      value: BigInt(transactionRequest.value),
      gas: BigInt(transactionRequest.gasLimit),
      maxFeePerGas,
      maxPriorityFeePerGas,
    },
  };
}
