/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';
import { encodeFunctionData } from 'viem';
import squidReceiverABI from '../../../mooncontracts/splitReceiverABI2.json';
import erc20ABI from '../../contracts/ERC20';
import { getSquidRouterConfig } from './config';
import encodePayload from './payload';
import { u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';
import { InputTokenDetails } from '../../constants/tokenConfig';

interface RouteParams {
  fromAddress: string;
  fromChain: string;
  fromToken: string;
  inputToken: InputTokenDetails;
  fromAmount: string;
  toChain: string;
  toToken: string;
  toAddress: string;
  slippageConfig: {
    autoMode: number;
  };
  enableExpress: boolean;
  postHook: {
    chainType: string;
    calls: any[];
    provider: string;
    description: string;
    logoURI: string;
  };
}

function createRouteParams(
  userAddress: string,
  amount: string,
  ephemeralAccountAddress: string,
  inputToken: InputTokenDetails,
): RouteParams {
  const { fromToken, fromChainId, toChainId, receivingContractAddress, axlUSDC_MOONBEAM } =
    getSquidRouterConfig(inputToken);

  // TODO this must be approval, should we use max amount?? Or is this unsafe.
  const approvalErc20 = encodeFunctionData({
    abi: erc20ABI,
    functionName: 'approve',
    args: [receivingContractAddress, 1000000000],
  });

  const ephemeralAccountHex = u8aToHex(decodeAddress(ephemeralAccountAddress));

  const payload = encodePayload(ephemeralAccountHex);

  // TODO: create the keccak256 hash of
  // Solidity packed encoding of
  // (id, amount, payload)
  let randomMockHash = `0x`;
  for (let i = 0; i < 32; i++) {
    randomMockHash += Math.floor(Math.random() * 16)
      .toString(16)
      .padStart(2, '0');
  }

  const executeXCMEncodedData = encodeFunctionData({
    abi: squidReceiverABI,
    functionName: 'initXCM',
    args: [randomMockHash, '0'],
  });

  return {
    fromAddress: userAddress,
    fromChain: fromChainId,
    fromToken: fromToken,
    fromAmount: amount,
    inputToken,
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
          callType: 0,
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
          callData: executeXCMEncodedData,
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

async function getRoute(params: RouteParams) {
  // This is the integrator ID for the Squid API at 'https://apiplus.squidrouter.com/v2'
  const { integratorId } = getSquidRouterConfig(params.inputToken);
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
      console.error('API error:', (error as any).response.data);
    }
    console.error('Error with parameters:', params);
    throw error;
  }
}

export async function getRouteTransactionRequest(
  userAddress: string,
  amount: string,
  ephemeralAccountAddress: string,
  inputToken: InputTokenDetails,
) {
  const routeParams = createRouteParams(userAddress, amount, ephemeralAccountAddress, inputToken);

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
