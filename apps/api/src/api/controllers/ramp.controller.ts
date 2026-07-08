import {
  GetRampErrorLogsRequest,
  GetRampErrorLogsResponse,
  GetRampHistoryRequest,
  GetRampHistoryResponse,
  GetRampStatusRequest,
  GetRampStatusResponse,
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
    logger.error("Error registering ramp", { errorType: classifyApiClientError(error), requestId: req.requestId });
    observeRampFailure(req, "ramp_register", error, { quoteId: req.body?.quoteId || null });
    next(error);
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
    logger.error("Error updating ramp", { errorType: classifyApiClientError(error), requestId: req.requestId });
    observeRampFailure(req, "ramp_update", error, { rampId: req.body?.rampId || null });
    next(error);
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
    logger.error("Error starting ramp", { errorType: classifyApiClientError(error), requestId: req.requestId });
    observeRampFailure(req, "ramp_start", error, { rampId: req.body?.rampId || null });
    next(error);
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
