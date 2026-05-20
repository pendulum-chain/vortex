import PQueue from "p-queue";
import logger from "../../logger";
import { squidRouterConfigBase } from "./config";
import { generateRouteCacheKey, getCachedRoute, setCachedRoute, stripRouteForCache } from "./route-cache";

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

export interface SquidrouterRouteEstimate {
  toToken: { decimals: number };
  aggregateSlippage: number;
  toAmount: string;
  toAmountMin: string;
  toAmountUSD: string;
}

export interface SquidrouterRoute {
  quoteId: string;
  estimate: SquidrouterRouteEstimate;
  transactionRequest: {
    value: string;
    target: string;
    data: string;
    gasLimit: string;
  };
}

/**
 * A stripped-down version of SquidrouterRoute that contains estimate data and the value field
 * needed for fee calculation, but excludes executable transaction data (data, target, gasLimit).
 * This is used for cached routes to prevent accidental execution while still allowing accurate
 * network fee calculations. The value field is route-dependent but not address-specific.
 */
export interface SquidrouterCachedRoute {
  quoteId: string;
  estimate: SquidrouterRouteEstimate;
  transactionRequest: {
    value: string;
  };
}

export interface SquidrouterRouteResult {
  data: { route: SquidrouterRoute };
  requestId: string;
}

/**
 * A stripped-down version of SquidrouterRouteResult that contains estimate data and the value field
 * needed for fee calculation, but excludes executable transaction data (data, target, gasLimit).
 * This is used for cached routes to prevent accidental execution while still allowing accurate
 * network fee calculations.
 */
export interface SquidrouterCachedRouteResult {
  data: {
    route: SquidrouterCachedRoute;
  };
  requestId: string;
}

export interface GetRouteOptions {
  /**
   * When true, results are cached for 3 minutes using a cache key derived from a subset of RouteParams
   * (excluding fromAddress, toAddress, and postHook). This is intended only for quote creation and
   * must not be relied on for transaction execution, since cached routes may have been generated for
   * different wallet addresses or post-hook configurations.
   *
   * When useCache is true, the returned result is a SquidrouterCachedRouteResult which intentionally
   * excludes transactionRequest to prevent accidental use of cached executable data.
   */
  useCache?: boolean;
}

// Rate-limited queues per fromAddress: at most 1 concurrent request per address, with a minimum 1500ms gap between calls.
// This prevents hitting SquidRouter API rate limits for the same user when multiple getRoute() calls happen in quick succession.
// 1500ms was chosen empirically: Squidrouter's per-address bucket rejected requests at 1000ms apart with retryAfter=1s.
const ROUTE_QUEUE_INTERVAL_MS = 1500;
const routeQueues = new Map<string, PQueue>();

// Cap any retryAfter value Squidrouter returns to avoid pathologically long waits if the API misbehaves.
const MAX_RETRY_AFTER_MS = 5000;

class HttpError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`HTTP ${status}`);
    this.status = status;
    this.data = data;
  }
}

async function squidFetch<T>(url: string, options: RequestInit): Promise<{ data: T; headers: Headers }> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new HttpError(response.status, errorData);
  }
  const data = (await response.json()) as T;
  return { data, headers: response.headers };
}

/**
 * Get a route from Squidrouter.
 *
 * When useCache is true, returns a stripped-down SquidrouterCachedRouteResult without transactionRequest.
 * When useCache is false or not specified (default), returns the full SquidrouterRouteResult.
 */
export async function getRoute(params: RouteParams, options: { useCache: true }): Promise<SquidrouterCachedRouteResult>;
export async function getRoute(params: RouteParams, options?: { useCache?: false }): Promise<SquidrouterRouteResult>;
export async function getRoute(
  params: RouteParams,
  options: GetRouteOptions = {}
): Promise<SquidrouterRouteResult | SquidrouterCachedRouteResult> {
  const { useCache = false } = options;

  if (useCache) {
    const cacheKey = generateRouteCacheKey(params);
    const cached = getCachedRoute(cacheKey);
    if (cached) {
      logger.current.debug("getRoute: returning cached route (TTL still valid)");
      return cached;
    }
  }

  // Normalize address to lowercase for consistent queue keying (EVM addresses may have different casing)
  const normalizedFromAddress = params.fromAddress.toLowerCase();
  let queue = routeQueues.get(normalizedFromAddress);

  if (!queue) {
    queue = new PQueue({ concurrency: 1, interval: ROUTE_QUEUE_INTERVAL_MS, intervalCap: 1 });
    routeQueues.set(normalizedFromAddress, queue);
  }

  try {
    const result = await queue.add(() => getRouteInternalWithRetry(params));
    if (!result) throw new Error("Route fetch returned no result");

    if (useCache) {
      const cacheKey = generateRouteCacheKey(params);
      setCachedRoute(cacheKey, result);
      // Return the stripped-down version for cached calls
      return stripRouteForCache(result);
    }

    return result;
  } finally {
    // Optional cleanup to prevent memory leaks if queue becomes empty
    if (queue.size === 0 && queue.pending === 0) {
      routeQueues.delete(normalizedFromAddress);
    }
  }
}

async function getRouteInternalWithRetry(params: RouteParams): Promise<SquidrouterRouteResult> {
  try {
    return await getRouteInternal(params);
  } catch (error) {
    const retryAfterMs = extractRateLimitRetryAfterMs(error);
    if (retryAfterMs === undefined) throw error;

    logger.current.warn(`Squidrouter rate limit hit. Retrying once after ${retryAfterMs}ms.`);
    await sleep(retryAfterMs);
    return getRouteInternal(params);
  }
}

function extractRateLimitRetryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof HttpError)) return undefined;

  const data = error.data as { retryAfter?: unknown; error?: unknown } | null;
  const looksLikeRateLimit =
    error.status === 429 ||
    (typeof data?.error === "string" && data.error.toLowerCase().includes("too many")) ||
    typeof data?.retryAfter === "number";
  if (!looksLikeRateLimit) return undefined;

  const retryAfterSeconds = typeof data?.retryAfter === "number" ? data.retryAfter : 1;
  const retryAfterMs = Math.min(Math.max(retryAfterSeconds, 0) * 1000, MAX_RETRY_AFTER_MS);
  // Add a small jitter (up to 250ms) so concurrent retries don't all fire at the same instant,
  // while still respecting the maximum retry delay cap.
  const jitterMs = Math.floor(Math.random() * 250);
  return Math.min(retryAfterMs + jitterMs, MAX_RETRY_AFTER_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRouteInternal(params: RouteParams): Promise<SquidrouterRouteResult> {
  const { integratorId } = squidRouterConfigBase;
  const url = `${SQUIDROUTER_BASE_URL}/route`;

  let fetchResult: Awaited<ReturnType<typeof squidFetch<{ route: SquidrouterRoute }>>>;
  try {
    fetchResult = await squidFetch<{ route: SquidrouterRoute }>(url, {
      body: JSON.stringify(params),
      headers: {
        "Content-Type": "application/json",
        "x-integrator-id": integratorId
      },
      method: "POST"
    });
  } catch (error) {
    if (error instanceof HttpError) {
      logger.current.error(`Error fetching route from Squidrouter API: ${JSON.stringify(error.data)}`);
      const message =
        typeof error.data === "object" && error.data !== null && "message" in error.data
          ? String((error.data as { message: unknown }).message)
          : "Unknown error";
      error.message = `Failed to fetch route: ${message}`;
    } else {
      logger.current.error(`Error with parameters: ${JSON.stringify(params)}`);
    }
    throw error;
  }

  const { data, headers } = fetchResult;
  const requestId = headers.get("x-request-id");

  if (!data || !data.route) {
    logger.current.error(`Invalid API response structure. Request ID: ${requestId}`);
    throw new Error("Invalid response from Squid Router API");
  }

  // FIXME remove this check once squidRouter works as expected again.
  // Check if slippage of received route is reasonable.
  const route = data.route;
  if (route.estimate?.aggregateSlippage !== undefined) {
    const slippage = route.estimate.aggregateSlippage;
    if (slippage > 5) {
      logger.current.warn(`Received route with high slippage: ${slippage}%. Request ID: ${requestId}`);
      throw new Error(`The slippage of the route is too high: ${slippage}%. Please try again later.`);
    }
  }

  return { data: { route }, requestId: requestId ?? "" };
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

  const url = new URL(`${SQUIDROUTER_BASE_URL}/status`);
  if (fromChainId) url.searchParams.set("fromChainId", fromChainId);
  if (toChainId) url.searchParams.set("toChainId", toChainId);
  url.searchParams.set("transactionId", transactionId);
  if (quoteId) url.searchParams.set("quoteId", quoteId);

  try {
    const { data } = await squidFetch<SquidRouterPayResponse>(url.toString(), {
      headers: { "x-integrator-id": integratorId }
    });
    return data;
  } catch (error) {
    if (error instanceof HttpError) {
      logger.current.error("API error:", error.data);
    }
    logger.current.error(`Couldn't get status from squidRouter for transactionID ${transactionId}.`);
    throw error;
  }
}
