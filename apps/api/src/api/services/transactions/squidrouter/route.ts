import { AXL_USDC_MOONBEAM, EvmTokenDetails, Networks, getNetworkId } from '@packages/shared';
import axios, { AxiosError } from 'axios';
import { encodeFunctionData } from 'viem';
import squidReceiverABI from '../../../../../mooncontracts/splitReceiverABI.json';
import logger from '../../../../config/logger';
import erc20ABI from '../../../../contracts/ERC20';
import { getSquidRouterConfig, squidRouterConfigBase } from './config';

const SQUIDROUTER_BASE_URL = 'https://v2.api.squidrouter.com/v2';

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

// This function creates the parameters for the Squidrouter API to get a route for onramping.
// This route will always be from Moonbeam to another EVM chain.
export function createOnrampRouteParams(
  fromAddress: string,
  amount: string,
  outputTokenDetails: EvmTokenDetails,
  toNetwork: Networks,
  addressDestination: string,
): RouteParams {
  const fromChainId = getNetworkId(Networks.Moonbeam);
  const toChainId = getNetworkId(toNetwork);

  return {
    fromAddress,
    fromChain: fromChainId.toString(),
    fromToken: AXL_USDC_MOONBEAM,
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

export interface SquidrouterRoute {
  route: {
    estimate: {
      toAmountMin: string;
    };
    transactionRequest: {
      value: string;
      target: string;
      data: string;
      gasLimit: string;
    };
  };
}

export interface SquidrouterRouteResult {
  data: SquidrouterRoute;
  requestId: string;
}

export async function getRoute(params: RouteParams): Promise<SquidrouterRouteResult> {
  // This is the integrator ID for the Squidrouter API
  const { integratorId } = squidRouterConfigBase;
  const url = `${SQUIDROUTER_BASE_URL}/route`;

  try {
    const result = await axios.post(url, params, {
      headers: {
        'x-integrator-id': integratorId,
        'Content-Type': 'application/json',
      },
    });

    const requestId = result.headers['x-request-id']; // Retrieve request ID from response headers
    return { data: result.data, requestId };
  } catch (error) {
    if (error instanceof AxiosError && error.response) {
      logger.error(`Error fetching route from Squidrouter API: ${error.response?.data}}`);
    }
    logger.error(`Error with parameters: ${JSON.stringify(params)}`);
    throw error;
  }
}

// Function to get the status of the transaction using Squid API
export async function getStatus(transactionId: string | undefined) {
  const { integratorId } = squidRouterConfigBase;
  if (!transactionId) {
    throw new Error('Transaction ID is undefined');
  }

  logger.debug(
    `Fetching status for transaction ID: ${transactionId} with integrator ID: ${integratorId} from Squidrouter API.`,
  );

  try {
    const result = await axios.get(`${SQUIDROUTER_BASE_URL}/status`, {
      params: {
        transactionId,
      },
      headers: {
        'x-integrator-id': integratorId,
      },
    });
    return result.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response) {
      console.error('API error:', error.response.data);
    }
    logger.error(error);
    throw error;
  }
}

// This function creates the parameters for the Squidrouter API to get a route for offramping.
// This route will always be from another EVM chain to Moonbeam.
export function createOfframpRouteParams(
  fromAddress: string,
  amount: string,
  inputTokenDetails: EvmTokenDetails,
  fromNetwork: Networks,
  receivingContractAddress: string,
  squidRouterReceiverHash: string,
): RouteParams {
  const fromChainId = getNetworkId(fromNetwork);
  const toChainId = getNetworkId(Networks.Moonbeam);

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
    fromAddress,
    fromChain: fromChainId.toString(),
    fromToken: inputTokenDetails.erc20AddressSourceChain,
    fromAmount: amount,
    toChain: toChainId.toString(),
    toToken: AXL_USDC_MOONBEAM,
    toAddress: fromAddress,
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
          target: AXL_USDC_MOONBEAM,
          value: '0', // this will be replaced by the full native balance of the multicall after the swap
          callData: approvalErc20,
          payload: {
            tokenAddress: AXL_USDC_MOONBEAM, // unused in callType 2, dummy value
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
            tokenAddress: AXL_USDC_MOONBEAM,
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
      provider: 'Pendulum', // This should be the name of your product or application that is triggering the hook
      description: 'Pendulum post hook',
      logoURI: 'https://pbs.twimg.com/profile_images/1548647667135291394/W2WOtKUq_400x400.jpg', // Add your product or application's logo here
    },
  };
}

export async function testRoute(
  testingToken: EvmTokenDetails,
  attemptedAmountRaw: string,
  address: string,
  fromNetwork: Networks,
) {
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
