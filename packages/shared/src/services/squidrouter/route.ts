import axios, { AxiosError } from "axios";
import PQueue from "p-queue";
import logger from "../../logger";
import { squidRouterConfigBase } from "./config";
import { generateRouteCacheKey, getCachedRoute, setCachedRoute } from "./route-cache";

const SQUIDROUTER_BASE_URL = "https://v2.api.squidrouter.com/v2";

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

export interface GetRouteOptions {
  /** When true, results are cached for 3 minutes keyed on the full RouteParams. Use only during quote creation. */
  useCache?: boolean;
}

// Rate-limited queues per fromAddress: at most 1 concurrent request per address, with a minimum 1000ms gap between calls.
// This prevents hitting SquidRouter API rate limits for the same user when multiple getRoute() calls happen in quick succession.
const routeQueues = new Map<string, PQueue>();

export async function getRoute(params: RouteParams, options: GetRouteOptions = {}): Promise<SquidrouterRouteResult> {
  const { useCache = false } = options;

  if (useCache) {
    const cacheKey = generateRouteCacheKey(params);
    const cached = getCachedRoute(cacheKey);
    if (cached) {
      logger.current.debug("getRoute: returning cached route (TTL still valid)");
      return cached;
    }
  }

  const { fromAddress } = params;
  let queue = routeQueues.get(fromAddress);

  if (!queue) {
    queue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 });
    routeQueues.set(fromAddress, queue);
  }

  try {
    const result = (await queue.add(() => getRouteInternal(params))) as SquidrouterRouteResult;

    if (useCache) {
      const cacheKey = generateRouteCacheKey(params);
      setCachedRoute(cacheKey, result);
    }

    return result;
  } finally {
    // Optional cleanup to prevent memory leaks if queue becomes empty
    if (queue.size === 0 && queue.pending === 0) {
      routeQueues.delete(fromAddress);
    }
  }
}

async function getRouteInternal(params: RouteParams): Promise<SquidrouterRouteResult> {
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
