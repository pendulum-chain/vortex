import axios, { AxiosError } from "axios";
import { encodeFunctionData, PublicClient } from "viem";
import erc20ABI from "../../contracts/ERC20";
import splitReceiverABI from "../../contracts/moonbeam/splitReceiverABI.json";
import { AXL_USDC_MOONBEAM, EvmTokenDetails, EvmTransactionData, getNetworkId, Networks } from "../../index";
import logger from "../../logger";
import { getSquidRouterConfig, squidRouterConfigBase } from "./config";

/**
 * Normalizes a numeric string to a format that BigInt can parse.
 * Handles scientific notation (e.g., "1.5e18") and decimal strings (e.g., "123.456")
 * by converting them to integer strings, truncating any fractional part.
 */
function normalizeBigIntString(value: string): string {
  if (!value || value === "") {
    return "0";
  }

  // If it's already a valid integer string (decimal or hex), return as-is
  if (/^-?\d+$/.test(value) || /^0x[0-9a-fA-F]+$/i.test(value)) {
    return value;
  }

  // Handle scientific notation and decimals by parsing as Number first, then converting
  // This will truncate any fractional part
  try {
    const num = Number(value);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
      logger.current.warn(`Invalid numeric value for BigInt conversion: ${value}, defaulting to 0`);
      return "0";
    }
    // Use BigInt on the truncated integer value to avoid precision issues with large numbers
    // For very large numbers, we need to handle them specially
    if (Math.abs(num) > Number.MAX_SAFE_INTEGER) {
      // For scientific notation with large exponents, parse manually
      const match = value.match(/^(-?\d+\.?\d*)[eE]([+-]?\d+)$/);
      if (match) {
        const [, mantissa, exponent] = match;
        const exp = parseInt(exponent, 10);
        const [intPart, decPart = ""] = mantissa.replace("-", "").split(".");
        const sign = mantissa.startsWith("-") ? "-" : "";
        const totalDigits = intPart + decPart;
        const zerosNeeded = exp - decPart.length;
        if (zerosNeeded >= 0) {
          return sign + totalDigits + "0".repeat(zerosNeeded);
        } else {
          // Truncate decimal part
          return sign + totalDigits.slice(0, totalDigits.length + zerosNeeded) || "0";
        }
      }
    }
    // For smaller numbers, Math.trunc works fine
    return BigInt(Math.trunc(num)).toString();
  } catch (e) {
    logger.current.warn(`Failed to normalize BigInt string: ${value}, error: ${e}`);
    return "0";
  }
}

const SQUIDROUTER_BASE_URL = "https://v2.api.squidrouter.com/v2";

export { splitReceiverABI };

export interface RouteParams {
  fromAddress: string;
  fromChain: string;
  fromToken: `0x${string}`;
  fromAmount: string;
  toChain: string;
  toToken: `0x${string}`;
  toAddress: string;
  bypassGuardrails: boolean;
  slippage?: number;
  slippageConfig?: {
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

export interface SquidrouterRoute {
  quoteId: string;
  estimate: {
    toToken: { decimals: number };
    aggregateSlippage: number;
    toAmount: string;
    toAmountMin: string;
    toAmountUSD: string;
  };
  transactionRequest: {
    value: string;
    target: string;
    data: string;
    gasLimit: string;
  };
}

export interface SquidrouterRouteResult {
  data: { route: SquidrouterRoute };
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

    if (!result.data || !result.data.route) {
      logger.current.error(`Invalid API response structure. Request ID: ${requestId}`);
      throw new Error("Invalid response from Squid Router API");
    }

    // FIXME remove this check once squidRouter works as expected again.
    // Check if slippage of received route is reasonable.
    const route = result.data.route;
    if (route.estimate?.aggregateSlippage !== undefined) {
      const slippage = route.estimate.aggregateSlippage;
      if (slippage > 2.5) {
        logger.current.warn(`Received route with high slippage: ${slippage}%. Request ID: ${requestId}`);
        // FIXME: temporarily disabled because we are facing issues with squidrouter routes failing the swap to USDT
        // throw new Error(`The slippage of the route is too high: ${slippage}%. Please try again later.`);
      }
    }

    return { data: { route }, requestId };
  } catch (error) {
    if (error instanceof AxiosError && error.response) {
      logger.current.error(`Error fetching route from Squidrouter API: ${JSON.stringify(error.response?.data)}}`);
      throw new Error(`Failed to fetch route: ${error.response?.data?.message || "Unknown error"}`);
    } else {
      logger.current.error(`Error with parameters: ${JSON.stringify(params)}`);
      throw error;
    }
  }
}

// Function to get the status of the transaction using Squid API
export async function getStatus(
  transactionId: string | undefined,
  fromChainId?: string,
  toChainId?: string,
  quoteId?: string
): Promise<SquidRouterPayResponse> {
  const { integratorId } = squidRouterConfigBase;
  if (!transactionId) {
    throw new Error("Transaction ID is undefined");
  }

  logger.current.debug(
    `Fetching status for transaction ID: ${transactionId} with integrator ID: ${integratorId} from Squidrouter API.`
  );
  try {
    const result = await axios.get(`${SQUIDROUTER_BASE_URL}/status`, {
      headers: {
        "x-integrator-id": integratorId
      },
      params: {
        fromChainId,
        quoteId,
        toChainId,
        transactionId
      }
    });
    return result.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response) {
      logger.current.error("API error:", error.response.data);
    }
    logger.current.error(`Couldn't get status from squidRouter for transactionID ${transactionId}.}`);
    throw error;
  }
}

// This function creates the parameters for the Squidrouter API to get a route for offramping.
// This route will always be from another EVM chain to Moonbeam.
export function createRouteParamsWithMoonbeamPostHook(params: {
  fromAddress: string;
  amount: string;
  fromToken: `0x${string}`;
  fromNetwork: Networks;
  receivingContractAddress: string;
  squidRouterReceiverHash: string;
}): RouteParams {
  const { fromAddress, amount, fromToken, fromNetwork, receivingContractAddress, squidRouterReceiverHash } = params;

  const fromChainId = getNetworkId(fromNetwork);
  const toChainId = getNetworkId(Networks.Moonbeam);

  const approvalErc20 = encodeFunctionData({
    abi: erc20ABI,
    args: [receivingContractAddress, "0"],
    functionName: "approve"
  });

  const initXCMEncodedData = encodeFunctionData({
    abi: splitReceiverABI,
    args: [squidRouterReceiverHash, "0"],
    functionName: "initXCM"
  });

  return {
    bypassGuardrails: true,
    enableExpress: true,
    fromAddress,
    fromAmount: amount,
    fromChain: fromChainId.toString(),
    fromToken,
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
    slippage: 4,
    toAddress: fromAddress,
    toChain: toChainId.toString(),
    toToken: AXL_USDC_MOONBEAM
  };
}

export function createGenericRouteParams(params: {
  fromAddress: string;
  amount: string;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  fromNetwork: Networks;
  toNetwork: Networks;
  destinationAddress: string;
}): RouteParams {
  const { fromAddress, amount, fromToken, toToken, fromNetwork, toNetwork, destinationAddress } = params;

  const fromChainId = getNetworkId(fromNetwork);
  const toChainId = getNetworkId(toNetwork);

  return {
    bypassGuardrails: true,
    enableExpress: true,
    fromAddress,
    fromAmount: amount,
    fromChain: fromChainId.toString(),
    fromToken,
    slippage: 4,
    toAddress: destinationAddress,
    toChain: toChainId.toString(),
    toToken
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
  route: SquidrouterRoute;
  rawAmount: string;
  inputTokenErc20Address: string;
  publicClient: PublicClient;
  swapValue?: string;
  nonce?: number;
}): Promise<{ approveData: EvmTransactionData; swapData: EvmTransactionData; squidRouterQuoteId?: string }> {
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
    gas: normalizeBigIntString(transactionRequest.gasLimit),
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: (maxPriorityFeePerGas ?? maxFeePerGas).toString(),
    to: transactionRequest.target as `0x${string}`,
    value: normalizeBigIntString(swapValue ?? transactionRequest.value)
  };

  if (nonce !== undefined) {
    swapData.nonce = nonce + 1;
  }

  return {
    approveData,
    squidRouterQuoteId: route.quoteId,
    swapData
  };
}
