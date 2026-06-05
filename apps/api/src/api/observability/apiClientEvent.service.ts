import logger from "../../config/logger";
import ApiClientEvent from "../../models/apiClientEvent.model";
import { recordApiClientMetricsSafe } from "./metrics";
import { logApiClientOperationSafe } from "./operationLogger";
import { ApiClientErrorType, ApiClientEventInput } from "./types";

const SENSITIVE_METADATA_KEYS = new Set([
  "additionalData",
  "apiKey",
  "authorization",
  "depositQrCode",
  "ephemeralAccounts",
  "ibanPaymentData",
  "pixDestination",
  "presignedTxs",
  "rawBody",
  "receiverTaxId",
  "secretKey",
  "signingAccounts",
  "taxId",
  "walletAddress",
  "x-api-key"
]);

export function observeApiClientEvent(event: ApiClientEventInput): void {
  try {
    const sanitizedEvent = sanitizeApiClientEvent(event);
    logApiClientOperationSafe(sanitizedEvent);
    recordApiClientMetricsSafe(sanitizedEvent);
    void recordApiClientEventSafe(sanitizedEvent);
  } catch (error) {
    logger.warn("Failed to observe API client event", { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function recordApiClientEventSafe(event: ApiClientEventInput): Promise<void> {
  try {
    await ApiClientEvent.create(sanitizeApiClientEvent(event));
  } catch (error) {
    logger.warn("Failed to record API client event", { error: error instanceof Error ? error.message : String(error) });
  }
}

export function sanitizeApiClientEvent(event: ApiClientEventInput): ApiClientEventInput {
  const errorType = event.errorType || (event.status === "success" ? "none" : "unknown_error");
  return {
    ...event,
    apiKeyPrefix: trimString(event.apiKeyPrefix, 16),
    errorMessage: getSafeErrorMessage(errorType),
    errorType,
    metadata: sanitizeMetadata(event.metadata),
    partnerName: trimString(event.partnerName, 100),
    status: event.status
  };
}

function sanitizeMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!metadata) return null;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_METADATA_KEYS.has(key) || typeof value === "object") continue;
    sanitized[key] = typeof value === "string" ? trimString(value, 100) : value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function trimString(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return value.slice(0, maxLength);
}

function getSafeErrorMessage(errorType: ApiClientErrorType): string | null {
  if (errorType === "none") return null;

  const messages: Record<ApiClientErrorType, string | null> = {
    auth_inactive_partner: "Partner authentication is inactive.",
    auth_invalid_api_key: "API authentication failed.",
    auth_invalid_public_key: "Public API key validation failed.",
    auth_missing_api_key: "API authentication is missing.",
    auth_partner_mismatch: "Authenticated partner does not match the requested partner.",
    internal_error: "Internal server error.",
    invalid_ephemerals: "Ephemeral account validation failed.",
    invalid_presigned_transactions: "Presigned transaction validation failed.",
    missing_presigned_transactions: "Required presigned transactions are missing.",
    none: null,
    ownership_denied: "Authenticated principal does not own the resource.",
    provider_error: "Provider operation failed.",
    quote_consumed: "Quote is already consumed.",
    quote_expired: "Quote is expired.",
    quote_not_found: "Quote was not found.",
    ramp_not_found: "Ramp was not found.",
    ramp_not_in_initial_state: "Ramp is not in an updatable state.",
    ramp_not_updatable: "Ramp cannot be updated.",
    service_unavailable: "Service is unavailable.",
    time_window_exceeded: "Allowed time window was exceeded.",
    unknown_error: "Unknown API client operation error.",
    validation_error: "Request validation failed."
  };

  return messages[errorType];
}
