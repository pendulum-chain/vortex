export type ApiClientOperation =
  | "auth_api_key"
  | "auth_public_key"
  | "auth_dual"
  | "auth_ownership"
  | "quote_create"
  | "quote_create_best"
  | "quote_get"
  | "ramp_register"
  | "ramp_update"
  | "ramp_start"
  | "ramp_status"
  | "ramp_errors";

export type ApiClientEventStatus = "success" | "failure";

export type ApiClientErrorType =
  | "none"
  | "validation_error"
  | "auth_missing_api_key"
  | "auth_invalid_api_key"
  | "auth_invalid_public_key"
  | "auth_partner_mismatch"
  | "auth_inactive_partner"
  | "ownership_denied"
  | "quote_not_found"
  | "quote_expired"
  | "quote_consumed"
  | "invalid_ephemerals"
  | "invalid_presigned_transactions"
  | "missing_presigned_transactions"
  | "time_window_exceeded"
  | "ramp_not_found"
  | "ramp_not_updatable"
  | "ramp_not_in_initial_state"
  | "service_unavailable"
  | "provider_error"
  | "internal_error"
  | "unknown_error";

export interface ApiClientEventInput {
  requestId?: string | null;
  operation: ApiClientOperation;
  status: ApiClientEventStatus;
  httpStatus?: number | null;
  errorType?: ApiClientErrorType | null;
  errorMessage?: string | null;
  partnerId?: string | null;
  partnerName?: string | null;
  apiKeyPrefix?: string | null;
  userId?: string | null;
  quoteId?: string | null;
  rampId?: string | null;
  rampType?: string | null;
  network?: string | null;
  paymentMethod?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
}
