import type { NextFunction, Request, RequestHandler, Response } from "express";
import httpStatus from "http-status";
import { APIError } from "../errors/api-error";
import { observeApiClientEvent } from "../observability/apiClientEvent.service";
import { classifyApiClientError, getErrorMessage } from "../observability/errorClassifier";
import { getRequestDurationMs } from "../observability/requestContext";
import type { ApiClientOperation } from "../observability/types";
import { MaintenanceService } from "../services/maintenance.service";

const MAINTENANCE_PROBLEM_TYPE = "https://api.vortexfinance.co/problems/maintenance-window";
const BLOCKED_OPERATIONS = [
  "quote_create",
  "quote_create_best",
  "ramp_register",
  "ramp_update",
  "ramp_start"
] as const satisfies readonly ApiClientOperation[];
type BlockedMaintenanceOperation = (typeof BLOCKED_OPERATIONS)[number];

export function rejectDuringActiveMaintenance(operation: BlockedMaintenanceOperation): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await MaintenanceService.getInstance().getMaintenanceStatus();

      if (!status.is_maintenance_active || !status.maintenance_details) {
        next();
        return;
      }

      const maintenanceEnd = new Date(status.maintenance_details.end_datetime);
      const retryAfterSeconds = Math.max(0, Math.ceil((maintenanceEnd.getTime() - Date.now()) / 1000));

      res.setHeader("Retry-After", maintenanceEnd.toUTCString());
      res.setHeader("Cache-Control", "no-store");
      const message = `Vortex services are temporarily unavailable during scheduled maintenance: ${status.maintenance_details.title} - ${status.maintenance_details.message}`;

      const error = new APIError({
        errors: [
          {
            detail: status.maintenance_details.message,
            maintenance_end: status.maintenance_details.end_datetime,
            maintenance_start: status.maintenance_details.start_datetime,
            operations: BLOCKED_OPERATIONS,
            retry_after_seconds: retryAfterSeconds,
            title: status.maintenance_details.title,
            type: MAINTENANCE_PROBLEM_TYPE
          }
        ],
        message,
        status: httpStatus.SERVICE_UNAVAILABLE,
        type: MAINTENANCE_PROBLEM_TYPE
      });

      observeMaintenanceDenial(req, operation, error, status.maintenance_details);
      next(error);
    } catch (error) {
      next(error);
    }
  };
}

function observeMaintenanceDenial(
  req: Request,
  operation: BlockedMaintenanceOperation,
  error: APIError,
  maintenanceDetails: {
    end_datetime: string;
    message: string;
    start_datetime: string;
    title: string;
  }
): void {
  const body = getRequestBody(req);
  const publicApiKey = getString(body.apiKey) || req.validatedPublicKey?.apiKey;
  const secretApiKey = getHeaderValue(req.headers?.["x-api-key"]);

  observeApiClientEvent({
    apiKeyPrefix: getSafeApiKeyPrefix(secretApiKey || publicApiKey),
    durationMs: getRequestDurationMs(req),
    errorMessage: getErrorMessage(error),
    errorType: classifyApiClientError(error, httpStatus.SERVICE_UNAVAILABLE),
    httpStatus: httpStatus.SERVICE_UNAVAILABLE,
    metadata: {
      maintenance_end: maintenanceDetails.end_datetime,
      maintenance_start: maintenanceDetails.start_datetime,
      maintenance_title: maintenanceDetails.title
    },
    operation,
    partnerId: req.authenticatedPartner?.id || getString(body.partnerId),
    partnerName: req.authenticatedPartner?.name || req.validatedPublicKey?.partnerName || null,
    paymentMethod: getString(body.paymentMethod),
    quoteId: getString(body.quoteId),
    rampId: getString(body.rampId),
    rampType: getString(body.rampType),
    requestId: req.requestId,
    status: "failure",
    userId: req.userId || null
  });
}

function getRequestBody(req: Request): Record<string, unknown> {
  return typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function getSafeApiKeyPrefix(apiKey: string | null | undefined): string | null {
  if (!apiKey?.startsWith("pk_") && !apiKey?.startsWith("sk_")) return null;
  return apiKey.slice(0, 8);
}
