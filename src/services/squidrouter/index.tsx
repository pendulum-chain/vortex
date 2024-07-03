// Import necessary libraries
import { ethers } from 'ethers';
import axios from 'axios';

// Load environment variables from .env file
const integratorId: string = import.meta.env.INTEGRATOR_ID || 'pendulum-2d38434b-db9e-49ec-b455-383a874e4b69';
const receivingContractAddress: string = '0x7d1024e467655e3ed371529ebf5ffc07438ddb3c';
// Same payload used for Axelar tests
const payload: string =
  '0x00000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000180000000000000000000000000000000000000000000000000000000003b9aca00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000002082e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000148d0bbba567ae73a06a8678e53dc7add0af6b7039000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000005000000082e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000220180fb9b50c5b785126981757bce1b7bf047e3b0eaa3cda2b8983ae35443294b3900000000000000000000000000000000000000000000000000000000000000';

// Define chain and token addresses
const fromChainId = '137'; // Polygon
const toChainId = '1284'; // Moonbeam
const fromToken = '0x750e4c4984a9e0f12978ea6742bc1c5d248f40ed'; // Define departing token
const axlUSDC_MOONBEAM = '0xca01a1d0993565291051daff390892518acfad3a';

// Define amount to be swapped and deposited
const amount = '1000';

// Import Receiver ABI for call encoding
import { squidReceiverABI } from '../../contracts/SquidReceiver';
// Import erc20 contract ABI
import { erc20Abi } from '../../contracts/Erc20';

// Creating Contract interfaces
// Approve (or Transfer) the contract to spend the erc20. On the receiving side.
// Only transfer was tested, but approve should also work.
const erc20Interface = new ethers.Interface(erc20Abi);
const transferErc20 = erc20Interface.encodeFunctionData('transfer', [receivingContractAddress, 1000]);

// Create contract interface and encode our xcm trigger function
const receiverABIInterface = new ethers.Interface(squidReceiverABI);
const executeXCMEncodedData = receiverABIInterface.encodeFunctionData('executeXCM', [payload, 1000]);

interface RouteParams {
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
  postHook: {
    chainType: string;
    calls: any[];
    provider: string;
    description: string;
    logoURI: string;
  };
}

// Function to get the optimal route for the swap using Squid API
async function getRoute(params: RouteParams) {
  try {
    const result = await axios.post(
      'https://v2.api.squidrouter.com/v2/route',

      params,
      {
        headers: {
          'x-integrator-id': integratorId,
          'Content-Type': 'application/json',
        },
      },
    );
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

interface StatusParams {
  transactionId: string;
  requestId: string;
  fromChainId: string;
  toChainId: string;
}

// Function to get the status of the transaction using Squid API
async function getStatus(params: StatusParams) {
  try {
    const result = await axios.get('https://v2.api.squidrouter.com/v2/status', {
      params: {
        transactionId: params.transactionId,
        requestId: params.requestId,
        fromChainId: params.fromChainId,
        toChainId: params.toChainId,
      },
      headers: {
        'x-integrator-id': integratorId,
      },
    });
    return result.data;
  } catch (error) {
    if (error) {
      console.error('API error:', (error as any).response.data);
    }
    console.error('Error with parameters:', params);
    throw error;
  }
}

// Function to periodically check the transaction status until it completes
async function updateTransactionStatus(txHash: string, requestId: string) {
  const getStatusParams = {
    transactionId: txHash,
    requestId: requestId,
    fromChainId: fromChainId,
    toChainId: toChainId,
  };

  let status;
  const completedStatuses = ['success', 'partial_success', 'needs_gas', 'not_found'];
  const maxRetries = 15; // Maximum number of retries for status check
  let retryCount = 0;

  do {
    try {
      status = await getStatus(getStatusParams);
      console.log(`Route status: ${status.squidTransactionStatus}`);
    } catch (error) {
      if ((error as any).response && (error as any).response.status === 404) {
        retryCount++;
        if (retryCount >= maxRetries) {
          console.error('Max retries reached. Transaction not found.');
          break;
        }
        console.log('Transaction not found. Retrying...');
        await new Promise((resolve) => setTimeout(resolve, 20000));
        continue;
      } else {
        throw error;
      }
    }

    if (!completedStatuses.includes(status.squidTransactionStatus)) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } while (!completedStatuses.includes(status.squidTransactionStatus));
}

// Function to approve the transactionRequest.target to spend fromAmount of fromToken
async function approveSpending(transactionRequestTarget: string, fromToken: string, fromAmount: string) {
  const erc20Abi = ['function approve(address spender, uint256 amount) public returns (bool)'];
  const tokenContract = new ethers.Contract(fromToken, erc20Abi, signer);
  try {
    const tx = await tokenContract.approve(transactionRequestTarget, fromAmount);
    await tx.wait();
    console.log(`Approved ${fromAmount} tokens for ${transactionRequestTarget}`);
  } catch (error) {
    console.error('Approval failed:', error);
    throw error;
  }
}

function createRouteParams(userAddress: string): RouteParams {
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
        // transfer call. Transfers the tokens from the router to our contract
        {
          callType: 1,
          target: axlUSDC_MOONBEAM,
          value: '0', // this will be replaced by the full native balance of the multicall after the swap
          callData: transferErc20,
          payload: {
            tokenAddress: axlUSDC_MOONBEAM, // unused in callType 2, dummy value
            inputPos: '1', // unused
          },
          estimatedGas: '700000',
          chainType: 'evm',
        },
        // trigger the xcm call
        {
          callType: 0, // SquidCallType.DEFAULT
          target: receivingContractAddress,
          value: '0',
          callData: executeXCMEncodedData,
          payload: {
            tokenAddress: axlUSDC_MOONBEAM, // unused in callType 0, dummy value
            inputPos: 0, // unused in callType 0, dummy value
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

import { useAccount, useReadContract, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useCallback, useEffect, useState } from 'preact/compat';

export function useSquidRouterSwap() {
  // Set up parameters for bridging the tokens and later calling the receiver contract
  const accountData = useAccount();
  const { data: hash, isPending, error, sendTransaction } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: hash });

  const [requestId, setRequestId] = useState<string>('');

  const doSwap = useCallback(async () => {
    if (!accountData.address) {
      console.error('Account not found');
      return;
    }
    const routeParams = createRouteParams(accountData.address);

    // Get the swap route using Squid API
    const routeResult = await getRoute(routeParams);
    const route = routeResult.data.route;
    const requestId = routeResult.requestId;

    console.log('Calculated route:', route);
    console.log('requestId:', requestId);

    setRequestId(requestId);

    const transactionRequest = route.transactionRequest;

    // Approve the transactionRequest.target to spend fromAmount of fromToken
    await approveSpending(transactionRequest.target, fromToken, amount);

    // Execute the swap transaction
    sendTransaction({
      to: transactionRequest.target,
      data: transactionRequest.data,
      value: transactionRequest.value,
      // gasLimit: (BigInt(transactionRequest.gasLimit) * BigInt(2)).toString(),
    });
  }, []);

  useEffect(() => {
    if (!hash || !isConfirmed) return;

    console.log('Transaction confirmed!');

    // Show the transaction receipt with Axelarscan link
    const axelarScanLink = 'https://axelarscan.io/gmp/' + hash;
    console.log(`Finished! Check Axelarscan for details: ${axelarScanLink}`);

    // Update transaction status until it completes
    updateTransactionStatus(hash, requestId);
  }, [hash, isConfirmed]);

  return doSwap;
}
