import {
  GetRampErrorLogsRequest,
  GetRampErrorLogsResponse,
  GetRampHistoryRequest,
  GetRampHistoryResponse,
  GetRampStatusRequest,
  GetRampStatusResponse,
  ProviderHttpError,
  RampProcess,
  StartRampRequest,
  StartRampResponse,
  UpdateRampRequest,
  UpdateRampResponse
} from "@vortexfi/shared";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { APIError } from "../errors/api-error";
import { enrichAdditionalDataWithClientIp } from "../helpers/clientIp";
import { getEffectiveUserId } from "../middlewares/effectiveUser";
import { assertQuoteOwnership, assertRampOwnership } from "../middlewares/ownershipAuth";
import { buildApiClientRequestMetadata, observeApiClientEvent } from "../observability/apiClientEvent.service";
import { classifyApiClientError, getErrorMessage } from "../observability/errorClassifier";
import { getRequestDurationMs } from "../observability/requestContext";
import { ApiClientOperation } from "../observability/types";
import rampService from "../services/ramp/ramp.service";

/**
 * Translate a raw fiat-provider (Avenia/BRLA, Alfredpay) failure raised while handling a ramp
 * request into a caller-facing `APIError` plus structured log context.
 *
 * - Logging: for a `ProviderHttpError` we surface the exact `provider`/`endpoint`/`method`/
 *   `status` of the failing call plus a truncated response body (the reason, e.g. "user is
 *   blocked") so operators can tell *where* and *why* it failed without guessing. The body is
 *   logged server-side only and never returned to the caller. A transport failure carries
 *   `status: 0`, which maps to the same 502 as an upstream `5xx`.
 * - Caller message: the provider's raw body (e.g. `{"error":"user is blocked"}`) is never
 *   forwarded. A `4xx` means the account/request was rejected (unprocessable), a `5xx`/
 *   transport failure means the provider is unavailable (bad gateway). Both messages indicate
 *   the failing stage — the payment provider — without leaking internal detail. The word
 *   "provider" keeps `classifyApiClientError` reporting this as `provider_error`.
 *
 * Non-provider errors (validation, ownership, quote state, …) are returned unchanged.
 */
const MAX_LOGGED_PROVIDER_BODY_LENGTH = 300;

/**
 * Collapse control characters (CR/LF, ESC, etc.) in the untrusted provider response body to a
 * single space before it is embedded in a log line. The body is external input echoed from the
 * provider's HTTP response, so an embedded newline could split the line or forge a fake log
 * entry (CWE-117), and an ESC could inject terminal color codes. The other fields we log
 * (provider, endpoint, method, numeric status) are code-defined constants and need no escaping.
 */
function sanitizeProviderBody(body: string): string {
  return body.replace(/[\x00-\x1F\x7F]+/g, " ");
}

export function mapProviderFailure(error: unknown): { error: unknown; logContext: Record<string, unknown> } {
  if (!(error instanceof ProviderHttpError)) {
    return { error, logContext: {} };
  }

  const isClientRejection = error.status >= 400 && error.status < 500;
  const mapped = new APIError({
    isPublic: true,
    message: isClientRejection
      ? "The payment provider could not process this request for the associated account. Please verify the account status or contact support."
      : "The payment provider is temporarily unavailable. Please try again shortly.",
    status: isClientRejection ? httpStatus.UNPROCESSABLE_ENTITY : httpStatus.BAD_GATEWAY
  });

  return {
    error: mapped,
    logContext: {
      provider: error.provider,
      providerEndpoint: error.endpoint,
      providerMethod: error.method,
      providerResponseBody: sanitizeProviderBody(error.responseBody).slice(0, MAX_LOGGED_PROVIDER_BODY_LENGTH),
      providerStatus: error.status
    }
  };
}

/**
 * Render the provider log context as a message suffix.
 *
 * The app logger (`config/logger.ts`) formats only `{ timestamp, level, message, label }` and
 * drops any metadata object passed as the second argument. Provider context therefore has to
 * live in the message string itself to reach the logs — passing it as metadata (as we did
 * before) silently discarded it. Server-side only; the body is already truncated. Returns an
 * empty string for non-provider failures so their log line is unchanged.
 */
export function formatProviderContext(logContext: Record<string, unknown>): string {
  if (!logContext.provider) {
    return "";
  }
  return (
    ` — provider=${logContext.provider} call=${logContext.providerMethod} ${logContext.providerEndpoint}` +
    ` status=${logContext.providerStatus} body=${logContext.providerResponseBody}`
  );
}

/**
 * Register a new ramping process
 * @public
 */
export const registerRamp = async (req: Request, res: Response<RampProcess>, next: NextFunction): Promise<void> => {
  try {
    const { quoteId, signingAccounts, additionalData } = req.body;

    // Validate required fields
    if (!quoteId || !signingAccounts || signingAccounts.length === 0) {
      throw new APIError({
        message: "Missing required fields",
        status: httpStatus.BAD_REQUEST
      });
    }

    await assertQuoteOwnership(req, quoteId);

    const enrichedAdditionalData = await enrichAdditionalDataWithClientIp(additionalData, req);

    const effectiveUserId = getEffectiveUserId(req);

    const ramp = await rampService.registerRamp({
      additionalData: enrichedAdditionalData,
      quoteId,
      signingAccounts,
      userId: effectiveUserId
    });

    observeRampSuccess(req, "ramp_register", httpStatus.CREATED, {
      paymentMethod: ramp.paymentMethod,
      quoteId,
      rampId: ramp.id,
      rampType: ramp.type
    });

    res.status(httpStatus.CREATED).json(ramp);
  } catch (error) {
    const { error: mappedError, logContext } = mapProviderFailure(error);
    logger.error(`Error registering ramp${formatProviderContext(logContext)}`, {
      errorType: classifyApiClientError(mappedError),
      requestId: req.requestId
    });
    observeRampFailure(req, "ramp_register", mappedError, { quoteId: req.body?.quoteId || null });
    next(mappedError);
  }
};

/**
 * Update a ramping process with presigned transactions and additional data
 * @public
 */
export const updateRamp = async (
  req: Request<unknown, unknown, UpdateRampRequest>,
  res: Response<UpdateRampResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { rampId, presignedTxs, additionalData } = req.body;

    // Validate required fields
    if (!rampId || !presignedTxs) {
      throw new APIError({
        message: "Missing required fields",
        status: httpStatus.BAD_REQUEST
      });
    }

    // Check for the additional data field
    if (additionalData && typeof additionalData !== "object") {
      throw new APIError({
        message: "Invalid additional data format",
        status: httpStatus.BAD_REQUEST
      });
    }

    await assertRampOwnership(req, rampId);

    // Update ramping process
    const ramp = await rampService.updateRamp({
      additionalData,
      presignedTxs,
      rampId
    });

    observeRampSuccess(req, "ramp_update", httpStatus.OK, {
      paymentMethod: ramp.paymentMethod,
      quoteId: ramp.quoteId,
      rampId,
      rampType: ramp.type
    });

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    const { error: mappedError, logContext } = mapProviderFailure(error);
    logger.error(`Error updating ramp${formatProviderContext(logContext)}`, {
      errorType: classifyApiClientError(mappedError),
      requestId: req.requestId
    });
    observeRampFailure(req, "ramp_update", mappedError, { rampId: req.body?.rampId || null });
    next(mappedError);
  }
};

/**
 * Start a new ramping process
 * @public
 */
export const startRamp = async (
  req: Request<unknown, unknown, StartRampRequest>,
  res: Response<StartRampResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { rampId } = req.body;

    // Validate required fields
    if (!rampId) {
      throw new APIError({
        message: "Missing required fields",
        status: httpStatus.BAD_REQUEST
      });
    }

    await assertRampOwnership(req, rampId);

    // Start ramping process
    const ramp = await rampService.startRamp({
      rampId
    });

    observeRampSuccess(req, "ramp_start", httpStatus.OK, {
      paymentMethod: ramp.paymentMethod,
      quoteId: ramp.quoteId,
      rampId,
      rampType: ramp.type
    });

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    const { error: mappedError, logContext } = mapProviderFailure(error);
    logger.error(`Error starting ramp${formatProviderContext(logContext)}`, {
      errorType: classifyApiClientError(mappedError),
      requestId: req.requestId
    });
    observeRampFailure(req, "ramp_start", mappedError, { rampId: req.body?.rampId || null });
    next(mappedError);
  }
};

/**
 * Get the status of a ramping process
 * @public
 */
export const getRampStatus = async (
  req: Request<GetRampStatusRequest, unknown, unknown, { showUnsignedTxs?: string }>,
  res: Response<GetRampStatusResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const showUnsignedTxs = req.query.showUnsignedTxs === "true";

    await assertRampOwnership(req, id);

    const ramp = await rampService.getRampStatus(id, showUnsignedTxs);

    if (!ramp) {
      throw new APIError({
        message: "Ramp not found",
        status: httpStatus.NOT_FOUND
      });
    }

    observeRampSuccess(req, "ramp_status", httpStatus.OK, {
      paymentMethod: ramp.paymentMethod,
      quoteId: ramp.quoteId,
      rampId: id,
      rampType: ramp.type
    });

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    logger.error("Error getting ramp status", { errorType: classifyApiClientError(error), requestId: req.requestId });
    observeRampFailure(req, "ramp_status", error, { rampId: req.params.id });
    next(error);
  }
};

/**
 * Get the error logs for a ramping process
 * @public
 */
export const getErrorLogs = async (
  req: Request<GetRampErrorLogsRequest>,
  res: Response<GetRampErrorLogsResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    await assertRampOwnership(req, id);

    const errorLogs = await rampService.getErrorLogs(id);

    if (!errorLogs) {
      throw new APIError({
        message: "Ramp not found",
        status: httpStatus.NOT_FOUND
      });
    }

    observeRampSuccess(req, "ramp_errors", httpStatus.OK, { rampId: id });

    res.status(httpStatus.OK).json(errorLogs);
  } catch (error) {
    logger.error("Error getting error logs", { errorType: classifyApiClientError(error), requestId: req.requestId });
    observeRampFailure(req, "ramp_errors", error, { rampId: req.params.id });
    next(error);
  }
};

/**
 * Get ramp history for a wallet address
 * @public
 */
export const getRampHistory = async (
  req: Request<GetRampHistoryRequest, unknown, unknown, { limit?: string; offset?: string }>,
  res: Response<GetRampHistoryResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { walletAddress } = req.params;
    let limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset) : undefined;

    // Cap the limit to a maximum of 100
    if (limit > 100) {
      limit = 100;
    }

    if (!walletAddress) {
      throw new APIError({
        message: "Wallet address is required",
        status: httpStatus.BAD_REQUEST
      });
    }

    const effectiveUserId = getEffectiveUserId(req);
    const owner = req.authenticatedPartner
      ? { partnerId: req.authenticatedPartner.id }
      : effectiveUserId
        ? { userId: effectiveUserId }
        : null;
    if (!owner) {
      throw new APIError({ message: "Authentication required", status: httpStatus.UNAUTHORIZED });
    }

    const history = await rampService.getRampHistory(walletAddress, owner, limit, offset);
    res.status(httpStatus.OK).json(history);
  } catch (error) {
    logger.error("Error getting transaction history:", error);
    next(error);
  }
};

type RampObservedOperation = Extract<
  ApiClientOperation,
  "ramp_register" | "ramp_update" | "ramp_start" | "ramp_status" | "ramp_errors"
>;

interface RampObservationContext {
  paymentMethod?: string | null;
  quoteId?: string | null;
  rampId?: string | null;
  rampType?: string | null;
}

interface ObservedRampRequest {
  authenticatedPartner?: { id: string; name: string };
  body?: unknown;
  method?: string;
  params?: unknown;
  path?: string;
  query?: unknown;
  requestId?: string;
  requestStartedAt?: number;
  userId?: string;
}

function observeRampSuccess(
  req: ObservedRampRequest,
  operation: RampObservedOperation,
  status: number,
  context: RampObservationContext
): void {
  observeApiClientEvent({
    ...context,
    durationMs: getRequestDurationMs(req),
    httpStatus: status,
    operation,
    partnerId: req.authenticatedPartner?.id || null,
    partnerName: req.authenticatedPartner?.name || null,
    requestId: req.requestId,
    status: "success",
    userId: req.userId || null
  });
}

function observeRampFailure(
  req: ObservedRampRequest,
  operation: RampObservedOperation,
  error: unknown,
  context: RampObservationContext
): void {
  const status = getHttpStatus(error);
  observeApiClientEvent({
    ...context,
    durationMs: getRequestDurationMs(req),
    errorMessage: getErrorMessage(error),
    errorType: classifyApiClientError(error, status),
    httpStatus: status,
    metadata: buildRampRequestMetadata(req, operation),
    operation,
    partnerId: req.authenticatedPartner?.id || null,
    partnerName: req.authenticatedPartner?.name || null,
    requestId: req.requestId,
    status: "failure",
    userId: req.userId || null
  });
}

function buildRampRequestMetadata(req: ObservedRampRequest, operation: RampObservedOperation): Record<string, unknown> {
  if (operation === "ramp_register") {
    return buildApiClientRequestMetadata(req, { bodyKeys: ["quoteId", "signingAccounts", "additionalData"] });
  }

  if (operation === "ramp_update") {
    return buildApiClientRequestMetadata(req, { bodyKeys: ["rampId", "presignedTxs", "additionalData"] });
  }

  if (operation === "ramp_start") {
    return buildApiClientRequestMetadata(req, { bodyKeys: ["rampId"] });
  }

  if (operation === "ramp_status") {
    return buildApiClientRequestMetadata(req, { paramKeys: ["id"], queryKeys: ["showUnsignedTxs"] });
  }

  return buildApiClientRequestMetadata(req, { paramKeys: ["id"] });
}

function getHttpStatus(error: unknown): number {
  return error instanceof APIError ? error.status || httpStatus.INTERNAL_SERVER_ERROR : httpStatus.INTERNAL_SERVER_ERROR;
}
