import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { APIError } from "../errors/api-error";
import type { ApiClientOperation } from "../observability/types";
import { MaintenanceService } from "../services/maintenance.service";

const MAINTENANCE_PROBLEM_TYPE = "https://api.vortexfinance.co/problems/maintenance-window";
const BLOCKED_OPERATIONS: ApiClientOperation[] = [
  "quote_create",
  "quote_create_best",
  "ramp_register",
  "ramp_update",
  "ramp_start"
];

export async function rejectDuringActiveMaintenance(_req: Request, res: Response, next: NextFunction): Promise<void> {
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

    next(
      new APIError({
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
        status: httpStatus.SERVICE_UNAVAILABLE
      })
    );
  } catch (error) {
    next(error);
  }
}
