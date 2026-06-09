import logger from "../../config/logger";
import ApiClientEvent from "../../models/apiClientEvent.model";
import { recordApiClientMetricsSafe } from "./metrics";
import { logApiClientOperationSafe } from "./operationLogger";
import { ApiClientErrorType, ApiClientEventInput } from "./types";

const API_KEY_PREFIX_LENGTH = 16;

const SENSITIVE_METADATA_KEYS = new Set([
  "additionalData",
  "additionaldata",
  "apiKey",
  "apikey",
  "authorization",
  "depositQrCode",
  "depositqrcode",
  "ephemeralAccounts",
  "ephemeralaccounts",
  "ibanPaymentData",
  "ibanpaymentdata",
  "pixDestination",
  "pixdestination",
  "presignedTxs",
  "presignedtxs",
  "rawBody",
  "rawbody",
  "receiverTaxId",
  "receivertaxid",
  "secretKey",
  "secretkey",
  "signingAccounts",
  "signingaccounts",
  "taxId",
  "taxid",
  "token",
  "walletAddress",
  "walletaddress",
  "x-api-key"
]);

type RequestMetadataValue = string | number | boolean | null;

interface ApiClientRequestLike {
  body?: unknown;
  method?: string;
  params?: unknown;
  path?: string;
  query?: unknown;
}

interface RequestMetadataOptions {
  bodyKeys?: string[];
  paramKeys?: string[];
  queryKeys?: string[];
}

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
    apiKeyPrefix: trimString(event.apiKeyPrefix, API_KEY_PREFIX_LENGTH),
    errorMessage: getSafeErrorMessage(errorType),
    errorType,
    metadata: sanitizeMetadata(event.metadata),
    partnerName: trimString(event.partnerName, 100),
    status: event.status
  };
}

export function getSafeApiKeyPrefix(
  apiKey: string | null | undefined,
  allowedPrefixes: ("pk_" | "sk_")[] = ["pk_", "sk_"]
): string | null {
  if (!apiKey || !allowedPrefixes.some(prefix => apiKey.startsWith(prefix))) return null;

  return apiKey.slice(0, API_KEY_PREFIX_LENGTH);
}

export function buildApiClientRequestMetadata(
  req: ApiClientRequestLike,
  options: RequestMetadataOptions = {}
): Record<string, RequestMetadataValue> {
  const metadata: Record<string, RequestMetadataValue> = {
    requestMethod: req.method || null,
    requestPath: buildTemplatedRequestPath(req.path, req.params)
  };

  addSelectedValues(metadata, "requestBody", req.body, options.bodyKeys);
  addSelectedValues(metadata, "requestParam", req.params, options.paramKeys);
  addSelectedValues(metadata, "requestQuery", req.query, options.queryKeys);

  return metadata;
}

function sanitizeMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!metadata) return null;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_METADATA_KEYS.has(key) || SENSITIVE_METADATA_KEYS.has(key.toLowerCase()) || typeof value === "object") {
      continue;
    }
    sanitized[key] = typeof value === "string" ? trimString(value, 100) : value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function addSelectedValues(
  metadata: Record<string, RequestMetadataValue>,
  prefix: string,
  values: unknown,
  keys: string[] | undefined
): void {
  if (!isPlainObject(values) || !keys || keys.length === 0) return;

  for (const key of keys) {
    const value = values[key];
    if (value === undefined) continue;

    const isSensitiveKey = SENSITIVE_METADATA_KEYS.has(key) || SENSITIVE_METADATA_KEYS.has(key.toLowerCase());
    if (isSensitiveKey && !Array.isArray(value) && !isPlainObject(value)) continue;

    const metadataKey = `${prefix}${toPascalCase(key)}`;
    if (Array.isArray(value)) {
      metadata[`${metadataKey}Count`] = value.length;
      continue;
    }
    if (isPlainObject(value)) {
      metadata[`has${prefix.replace(/^request/, "Request")}${toPascalCase(key)}`] = true;
      continue;
    }

    metadata[metadataKey] = sanitizeRequestMetadataValue(value);
  }
}

function buildTemplatedRequestPath(path: string | undefined, params: unknown): string | null {
  if (!path) return null;
  if (!isPlainObject(params)) return path;

  const paramEntries = Object.entries(params)
    .filter(([, value]) => isScalarPathParam(value))
    .map(([key, value]) => [key, String(value)] as const);

  if (paramEntries.length === 0) return path;

  return path
    .split("/")
    .map(segment => {
      const decodedSegment = decodePathSegment(segment);
      const matchingParam = paramEntries.find(([, value]) => segment === value || decodedSegment === value);
      return matchingParam ? `:${matchingParam[0]}` : segment;
    })
    .join("/");
}

function sanitizeRequestMetadataValue(value: unknown): RequestMetadataValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return String(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isScalarPathParam(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function toPascalCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function trimString(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return value.replace(/[\r\n\t]/g, " ").slice(0, maxLength);
}

function getSafeErrorMessage(errorType: ApiClientErrorType): string | null {
  if (errorType === "none") return null;

  const messages: Record<ApiClientErrorType, string | null> = {
    auth_inactive_partner: "Partner authentication is inactive.",
    auth_invalid_api_key: "API authentication failed.",
    auth_invalid_public_key: "Public API key validation failed.",
    auth_missing_api_key: "API authentication is missing.",
    auth_partner_mismatch: "Authenticated partner does not match the requested partner.",
    auth_partner_not_found: "Requested partner was not found.",
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
