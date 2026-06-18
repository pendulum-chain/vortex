import httpStatus from "http-status";
import { APIError } from "../errors/api-error";
import { ApiClientErrorType } from "./types";

export function classifyApiClientError(error: unknown, fallbackStatus?: number | null): ApiClientErrorType {
  const message = getErrorMessage(error).toLowerCase();
  const status = error instanceof APIError ? error.status : fallbackStatus;

  if (message.includes("authentication required")) return "auth_missing_api_key";
  if (message.includes("does not own") || message.includes("ownership")) return "ownership_denied";
  if (status === httpStatus.FORBIDDEN) return "ownership_denied";
  if (status === httpStatus.UNAUTHORIZED) return "auth_invalid_api_key";
  if (status === httpStatus.SERVICE_UNAVAILABLE) return "service_unavailable";

  if (message.includes("low liquidity")) return "provider_error";

  if (status === httpStatus.BAD_REQUEST) {
    if (message.includes("expired")) return "quote_expired";
    if (message.includes("no presigned transactions")) return "missing_presigned_transactions";
    if (message.includes("presigned")) return "invalid_presigned_transactions";
    if (message.includes("ephemeral")) return "invalid_ephemerals";
    if (message.includes("time window")) return "time_window_exceeded";
    return "validation_error";
  }

  if (status === httpStatus.NOT_FOUND) {
    if (message.includes("quote")) return "quote_not_found";
    if (message.includes("ramp")) return "ramp_not_found";
  }

  if (status === httpStatus.CONFLICT) {
    if (message.includes("quote")) return "quote_consumed";
    if (message.includes("initial") || message.includes("allows updates")) return "ramp_not_in_initial_state";
    return "ramp_not_updatable";
  }

  if (status && status >= 500) return "internal_error";

  if (message.includes("quote not found")) return "quote_not_found";
  if (message.includes("ramp not found")) return "ramp_not_found";
  if (message.includes("quote has expired") || message.includes("quote is expired")) return "quote_expired";
  if (message.includes("quote already consumed") || message.includes("quote is consumed")) return "quote_consumed";
  if (message.includes("no presigned transactions")) return "missing_presigned_transactions";
  if (message.includes("presigned")) return "invalid_presigned_transactions";
  if (message.includes("ephemeral")) return "invalid_ephemerals";
  if (message.includes("time window")) return "time_window_exceeded";
  if (message.includes("provider") || message.includes("failed to calculate quote")) return "provider_error";

  return "unknown_error";
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
