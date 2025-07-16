import { AXL_USDC_MOONBEAM, EvmTokenDetails, EvmTransactionData, getNetworkId, Networks } from "@packages/shared";
import axios, { AxiosError } from "axios";
import { encodeFunctionData, PublicClient } from "viem";
import squidReceiverABI from "../../../../../mooncontracts/splitReceiverABI.json";
import logger from "../../../../config/logger";
import erc20ABI from "../../../../contracts/ERC20";
import { getSquidRouterConfig, squidRouterConfigBase } from "./config";

const SQUIDROUTER_BASE_URL = "https://v2.api.squidrouter.com/v2";

export interface RouteParams {
  fromAddress: string;
  fromChain: string;
  fromToken: string;
  fromAmount: string;
  toChain: string;
  toToken: string;
  toAddress: string;
  bypassGuardrails: boolean;
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

interface RouteStatus {
  chainId: string;
  txHash: string;
  status: string;
  action: string;
}

export interface SquidRouterPayResponse {
  id: string;
  status: string;
  squidTransactionStatus: string;
  isGMPTransaction: boolean;
  routeStatus: RouteStatus[];
}
// This function creates the parameters for the Squidrouter API to get a route for onramping.
// This route will always be from Moonbeam to another EVM chain.
export function createOnrampRouteParams(
  fromAddress: string,
  amount: string,
  outputTokenDetails: EvmTokenDetails,
  toNetwork: Networks,
  addressDestination: string
): RouteParams {
  const fromChainId = getNetworkId(Networks.Moonbeam);
  const toChainId = getNetworkId(toNetwork);

  return {
    bypassGuardrails: true,
    enableExpress: true,
    fromAddress,
    fromAmount: amount,
    fromChain: fromChainId.toString(),
    fromToken: AXL_USDC_MOONBEAM,
    slippageConfig: {
      autoMode: 1
    },
    toAddress: addressDestination,
    toChain: toChainId.toString(),
    toToken: outputTokenDetails.erc20AddressSourceChain
  };
}

export interface SquidrouterRoute {
  route: {
    estimate: {
      toToken: { decimals: number };
      toAmount: string;
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
        "Content-Type": "application/json",
        "x-integrator-id": integratorId
      }
    });

    const requestId = result.headers["x-request-id"]; // Retrieve request ID from response headers
    return { data: result.data, requestId };
  } catch (error) {
    if (error instanceof AxiosError && error.response) {
      logger.error(`Error fetching route from Squidrouter API: ${JSON.stringify(error.response?.data)}}`);
      throw new Error(`Failed to fetch route: ${error.response?.data?.message || "Unknown error"}`);
    } else {
      logger.error(`Error with parameters: ${JSON.stringify(params)}`);
      throw error;
    }
  }
}

// Function to get the status of the transaction using Squid API
export async function getStatus(
  transactionId: string | undefined,
  fromChainId?: string,
  toChainId?: string
): Promise<SquidRouterPayResponse> {
  const { integratorId } = squidRouterConfigBase;
  if (!transactionId) {
    throw new Error("Transaction ID is undefined");
  }

  logger.debug(
    `Fetching status for transaction ID: ${transactionId} with integrator ID: ${integratorId} from Squidrouter API.`
  );
  try {
    const result = await axios.get(`${SQUIDROUTER_BASE_URL}/status`, {
      headers: {
        "x-integrator-id": integratorId
      },
      params: {
        fromChainId,
        toChainId,
        transactionId
      }
    });
    return result.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response) {
      console.error("API error:", error.response.data);
    }
    logger.error(`Couldn't get status from squidrouter for transactionID ${transactionId}.}`);
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
  squidRouterReceiverHash: string
): RouteParams {
  const fromChainId = getNetworkId(fromNetwork);
  const toChainId = getNetworkId(Networks.Moonbeam);

  const approvalErc20 = encodeFunctionData({
    abi: erc20ABI,
    args: [receivingContractAddress, "0"],
    functionName: "approve"
  });

  const initXCMEncodedData = encodeFunctionData({
    abi: squidReceiverABI,
    args: [squidRouterReceiverHash, "0"],
    functionName: "initXCM"
  });

  return {
    bypassGuardrails: true,
    enableExpress: true,
    fromAddress,
    fromAmount: amount,
    fromChain: fromChainId.toString(),
    fromToken: inputTokenDetails.erc20AddressSourceChain,
    postHook: {
      calls: [
        // approval call.
        {
          callData: approvalErc20,
          callType: 1,
          chainType: "evm", // this will be replaced by the full native balance of the multicall after the swap
          estimatedGas: "500000",
          payload: {
            inputPos: "1", // unused // unused in callType 2, dummy value
            tokenAddress: AXL_USDC_MOONBEAM
          },
          target: AXL_USDC_MOONBEAM,
          value: "0"
        },
        // trigger the xcm call
        {
          callData: initXCMEncodedData, // SquidCallType.FULL_TOKEN_BALANCE
          callType: 1,
          chainType: "evm",
          estimatedGas: "700000",
          payload: {
            // this indexes the 256 bit word position of the
            // "amount" parameter in the encoded arguments to the call executeXCMEncodedData
            // i.e., a "1" means that the bits 256-511 are the position of "amount"
            // in the encoded argument list
            inputPos: "1",
            tokenAddress: AXL_USDC_MOONBEAM
          },
          target: receivingContractAddress,
          value: "0"
        }
      ],
      chainType: "evm",
      description: "Pendulum post hook", // This should be the name of your product or application that is triggering the hook
      logoURI: "https://pbs.twimg.com/profile_images/1548647667135291394/W2WOtKUq_400x400.jpg", // Add your product or application's logo here
      provider: "Pendulum"
    },
    slippageConfig: {
      autoMode: 1
    },
    toAddress: fromAddress,
    toChain: toChainId.toString(),
    toToken: AXL_USDC_MOONBEAM
  };
}

export function createGenericRouteParams(
  fromAddress: string,
  amount: string,
  inputTokenDetails: EvmTokenDetails,
  outputTokenDetails: EvmTokenDetails,
  fromNetwork: Networks,
  toNetwork: Networks,
  destinationAddress: string
): RouteParams {
  const fromChainId = getNetworkId(fromNetwork);
  const toChainId = getNetworkId(toNetwork);

  return {
    bypassGuardrails: true,
    enableExpress: true,
    fromAddress,
    fromAmount: amount,
    fromChain: fromChainId.toString(),
    fromToken: inputTokenDetails.erc20AddressSourceChain,
    slippageConfig: {
      autoMode: 1
    },
    toAddress: destinationAddress,
    toChain: toChainId.toString(),
    toToken: outputTokenDetails.erc20AddressSourceChain
  };
}

export async function testRoute(
  testingToken: EvmTokenDetails,
  attemptedAmountRaw: string,
  address: string,
  fromNetwork: Networks
) {
  const { fromChainId, toChainId, axlUSDC_MOONBEAM } = getSquidRouterConfig(fromNetwork);

  const sharedRouteParams: RouteParams = {
    bypassGuardrails: true,
    enableExpress: true,
    fromAddress: address,
    fromAmount: attemptedAmountRaw,
    fromChain: fromChainId,
    fromToken: testingToken.erc20AddressSourceChain,

    slippageConfig: {
      autoMode: 1
    },
    toAddress: address,
    toChain: toChainId,
    toToken: axlUSDC_MOONBEAM
  };

  // will throw if no route is found
  await getRoute(sharedRouteParams);
}

export async function createTransactionDataFromRoute({
  route,
  rawAmount,
  inputTokenErc20Address,
  publicClient,
  swapValue,
  nonce
}: {
  route: SquidrouterRoute["route"];
  rawAmount: string;
  inputTokenErc20Address: string;
  publicClient: PublicClient;
  swapValue?: string;
  nonce?: number;
}): Promise<{ approveData: EvmTransactionData; swapData: EvmTransactionData }> {
  const { transactionRequest } = route;

  const approveTransactionData = encodeFunctionData({
    abi: erc20ABI,
    args: [transactionRequest?.target, rawAmount],
    functionName: "approve"
  });

  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

  const approveData: EvmTransactionData = {
    data: approveTransactionData as `0x${string}`,
    gas: "150000",
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: (maxPriorityFeePerGas ?? maxFeePerGas).toString(),
    to: inputTokenErc20Address as `0x${string}`,
    value: "0"
  };

  if (nonce !== undefined) {
    approveData.nonce = nonce;
  }

  const swapData: EvmTransactionData = {
    data: transactionRequest.data as `0x${string}`,
    gas: transactionRequest.gasLimit,
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: (maxPriorityFeePerGas ?? maxFeePerGas).toString(),
    to: transactionRequest.target as `0x${string}`,
    value: swapValue ?? transactionRequest.value
  };

  if (nonce !== undefined) {
    swapData.nonce = nonce + 1;
  }

  return {
    approveData,
    swapData
  };
}
