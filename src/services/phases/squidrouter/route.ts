import axios from 'axios';
import { encodeFunctionData, Hash } from 'viem';

import squidReceiverABI from '../../../../mooncontracts/splitReceiverABI.json';
import {
  getInputTokenDetails,
  getOutputTokenDetailsMoonbeam,
  InputTokenDetails,
  isEvmInputTokenDetails,
  OutputTokenDetailsMoonbeam,
  OutputTokenTypes,
} from '../../../constants/tokenConfig';
import erc20ABI from '../../../contracts/ERC20';
import { getSquidRouterConfig, squidRouterConfigBase } from './config';
import { getNetworkId, Networks } from '../../../helpers/networks';
import { OnrampOutputTokenType } from '../../onrampingFlow';

export interface RouteParams {
  fromAddress: string;
  fromChain: string;
  fromToken: string;
  fromAmount: string;
  toChain: string;
  toToken: string;
  toAddress: string;
  slippageConfig: {
    autoMode: number;
  };
  enableExpress: boolean;
  postHook?: {
    chainType: string;
    calls: unknown[];
    provider: string;
    description: string;
    logoURI: string;
  };
}

export type TransactionRequest = { target: string; data: Hash; value: bigint; gasLimit: string };

function createRouteParams(
  userAddress: string,
  amount: string,
  squidRouterReceiverHash: `0x${string}`,
  inputToken: InputTokenDetails,
  fromNetwork: Networks,
): RouteParams {
  const { fromChainId, toChainId, receivingContractAddress, axlUSDC_MOONBEAM } = getSquidRouterConfig(fromNetwork);

  if (!isEvmInputTokenDetails(inputToken)) {
    throw new Error(`Token ${inputToken.assetSymbol} is not supported on EVM chains`);
  }
  const fromToken = inputToken.erc20AddressSourceChain as `0x${string}`;

  const approvalErc20 = encodeFunctionData({
    abi: erc20ABI,
    functionName: 'approve',
    args: [receivingContractAddress, '0'],
  });

  const initXCMEncodedData = encodeFunctionData({
    abi: squidReceiverABI,
    functionName: 'initXCM',
    args: [squidRouterReceiverHash, '0'],
  });

  return {
    fromAddress: userAddress,
    fromChain: fromChainId,
    fromToken: fromToken,
    fromAmount: amount,
    toChain: toChainId,
    toToken: axlUSDC_MOONBEAM,
    toAddress: userAddress,
    slippageConfig: {
      autoMode: 1,
    },
    enableExpress: true,
    postHook: {
      chainType: 'evm',
      calls: [
        // approval call.
        {
          callType: 1,
          target: axlUSDC_MOONBEAM,
          value: '0', // this will be replaced by the full native balance of the multicall after the swap
          callData: approvalErc20,
          payload: {
            tokenAddress: axlUSDC_MOONBEAM, // unused in callType 2, dummy value
            inputPos: '1', // unused
          },
          estimatedGas: '500000',
          chainType: 'evm',
        },
        // trigger the xcm call
        {
          callType: 1, // SquidCallType.FULL_TOKEN_BALANCE
          target: receivingContractAddress,
          value: '0',
          callData: initXCMEncodedData,
          payload: {
            tokenAddress: axlUSDC_MOONBEAM,
            // this indexes the 256 bit word position of the
            // "amount" parameter in the encoded arguments to the call executeXCMEncodedData
            // i.e., a "1" means that the bits 256-511 are the position of "amount"
            // in the encoded argument list
            inputPos: '1',
          },
          estimatedGas: '700000',
          chainType: 'evm',
        },
      ],
      provider: 'Pendulum', //This should be the name of your product or application that is triggering the hook
      description: 'Pendulum post hook',
      logoURI: 'https://pbs.twimg.com/profile_images/1548647667135291394/W2WOtKUq_400x400.jpg', //Add your product or application's logo here
    },
  };
}

export function createOnrampRouteParams(
  fromAddress: string,
  amount: string,
  outputToken: OnrampOutputTokenType,
  toNetwork: Networks,
  addressDestination: string,
): RouteParams {
  const { axlUSDC_MOONBEAM } = getSquidRouterConfig(Networks.Moonbeam);
  const fromChainId = getNetworkId(Networks.Moonbeam);
  const toChainId = getNetworkId(toNetwork);

  // will throw if invalid. Must exist.
  const outputTokenDetails = getInputTokenDetails(Networks.Moonbeam, outputToken);
  if (!outputTokenDetails) {
    throw new Error(`Token ${outputToken} is not supported for Squidrouter onramp`);
  }

  if (!isEvmInputTokenDetails(outputTokenDetails)) {
    throw new Error(`Token ${outputToken} is not supported on EVM chains`);
  }

  return {
    fromAddress: fromAddress,
    fromChain: fromChainId.toString(),
    fromToken: axlUSDC_MOONBEAM,
    fromAmount: amount,
    toChain: toChainId.toString(),
    toToken: outputTokenDetails.erc20AddressSourceChain,
    toAddress: addressDestination,
    slippageConfig: {
      autoMode: 1,
    },
    enableExpress: true,
  };
}

export async function getRoute(params: RouteParams) {
  // This is the integrator ID for the Squid API at 'https://apiplus.squidrouter.com/v2'
  const { integratorId } = squidRouterConfigBase;
  const url = 'https://apiplus.squidrouter.com/v2/route';

  try {
    const result = await axios.post(url, params, {
      headers: {
        'x-integrator-id': integratorId,
        'Content-Type': 'application/json',
      },
    });

    const requestId = result.headers['x-request-id']; // Retrieve request ID from response headers
    return { data: result.data, requestId: requestId };
  } catch (error) {
    if (error) {
      console.error('Squidrouter API error:', (error as { response: { data: unknown } }).response.data);
    }
    console.error('Error with parameters:', params);
    throw error;
  }
}

export async function getRouteTransactionRequest(
  userAddress: string,
  amount: string,
  squidRouterReceiverHash: `0x${string}`,
  inputToken: InputTokenDetails,
  fromNetwork: Networks,
) {
  const routeParams = createRouteParams(userAddress, amount, squidRouterReceiverHash, inputToken, fromNetwork);

  // Get the swap route using Squid API
  const routeResult = await getRoute(routeParams);
  const route = routeResult.data.route;
  const requestId = routeResult.requestId;

  console.log('Calculated route:', route);
  console.log('requestId:', requestId);

  const transactionRequest = route.transactionRequest;

  return {
    requestId,
    transactionRequest,
    data: routeResult.data,
  };
}

export async function testRoute(
  testingToken: InputTokenDetails,
  attemptedAmountRaw: string,
  address: string,
  fromNetwork: Networks,
) {
  if (!isEvmInputTokenDetails(testingToken)) {
    return;
  }
  const { fromChainId, toChainId, axlUSDC_MOONBEAM } = getSquidRouterConfig(fromNetwork);

  const sharedRouteParams: RouteParams = {
    fromAddress: address,
    fromChain: fromChainId,
    fromToken: testingToken.erc20AddressSourceChain,
    fromAmount: attemptedAmountRaw,
    toChain: toChainId,
    toToken: axlUSDC_MOONBEAM,
    toAddress: address,
    slippageConfig: {
      autoMode: 1,
    },
    enableExpress: true,
  };

  // will throw if no route is found
  await getRoute(sharedRouteParams);
}
