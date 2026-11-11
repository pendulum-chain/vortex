import { getEnvVar } from "../../helpers/environment";
import { ProviderHttpError } from "../providerHttpError";
import { RELAY_DEFAULT_API_BASE_URL } from "./config";
import { type RelayIntentStatus, type RelayQuote, relayIntentStatusSchema, relayQuoteSchema } from "./schemas";

export const RELAY_REQUEST_TIMEOUT_MS = 15_000;

export interface RelayQuoteRequest {
  amount: string;
  destinationChainId: number;
  destinationCurrency: string;
  includeProtocolData?: boolean;
  originChainId: number;
  originCurrency: string;
  recipient?: string;
  refundTo?: string;
  slippageTolerance?: string;
  strict?: boolean;
  tradeType: "EXACT_INPUT" | "EXACT_OUTPUT";
  useDepositAddress?: boolean;
  user: string;
}

export class RelayApiError extends ProviderHttpError {
  constructor(params: { status: number; endpoint: string; method: string; responseBody: string }) {
    super({ ...params, provider: "relay" });
  }
}

async function relayFetch(endpoint: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const method = init.method ?? "GET";
  const baseUrl = (getEnvVar("RELAY_API_BASE_URL") || RELAY_DEFAULT_API_BASE_URL).replace(/\/$/, "");
  const apiKey = getEnvVar("RELAY_API_KEY");
  const timeout = AbortSignal.timeout(RELAY_REQUEST_TIMEOUT_MS);

  let response: Response;
  let body: string;
  try {
    response = await fetch(`${baseUrl}${endpoint}`, {
      ...init,
      headers: { ...init.headers, ...(apiKey ? { "x-api-key": apiKey } : {}) },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    });
    body = await response.text();
  } catch (error) {
    // The caller giving up is not a Relay failure.
    if (signal?.aborted) throw error;
    throw new RelayApiError({
      endpoint,
      method,
      responseBody: error instanceof Error ? error.message : String(error),
      status: 0
    });
  }

  if (!response.ok) {
    throw new RelayApiError({ endpoint, method, responseBody: body, status: response.status });
  }
  try {
    return JSON.parse(body);
  } catch {
    // A 2xx that is not JSON comes from a gateway in front of Relay, not from Relay's API.
    throw new RelayApiError({ endpoint, method, responseBody: body, status: response.status });
  }
}

export async function getRelayQuote(request: RelayQuoteRequest, signal?: AbortSignal): Promise<RelayQuote> {
  const body = await relayFetch(
    "/quote/v2",
    { body: JSON.stringify(request), headers: { "Content-Type": "application/json" }, method: "POST" },
    signal
  );
  return relayQuoteSchema.parse(body);
}

export async function getRelayIntentStatus(requestId: string, signal?: AbortSignal): Promise<RelayIntentStatus> {
  const body = await relayFetch(`/intents/status/v3?requestId=${encodeURIComponent(requestId)}`, { method: "GET" }, signal);
  return relayIntentStatusSchema.parse(body);
}
