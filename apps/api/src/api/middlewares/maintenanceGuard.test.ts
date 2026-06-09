import { afterEach, describe, expect, it, mock } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { APIError } from "../errors/api-error";
import { MaintenanceService } from "../services/maintenance.service";
import { rejectDuringActiveMaintenance } from "./maintenanceGuard";

type MaintenanceStatus = Awaited<ReturnType<MaintenanceService["getMaintenanceStatus"]>>;

const maintenanceService = MaintenanceService.getInstance();
const originalGetMaintenanceStatus = maintenanceService.getMaintenanceStatus;

function buildResponse() {
  const headers: Record<string, string> = {};
  const res: Partial<Response> & { headers: Record<string, string>; sentContentType?: string } = { headers };

  res.setHeader = mock((name: string, value: number | string | readonly string[]) => {
    headers[name] = Array.isArray(value) ? value.join(", ") : String(value);
    return res as Response;
  }) as Response["setHeader"];

  res.type = mock((contentType: string) => {
    res.sentContentType = contentType;
    return res as Response;
  }) as Response["type"];

  return res as Response & { headers: Record<string, string>; sentContentType?: string };
}

function mockMaintenanceStatus(status: MaintenanceStatus) {
  maintenanceService.getMaintenanceStatus = mock(async () => status) as unknown as MaintenanceService["getMaintenanceStatus"];
}

describe("rejectDuringActiveMaintenance", () => {
  afterEach(() => {
    maintenanceService.getMaintenanceStatus = originalGetMaintenanceStatus;
  });

  it("passes through when there is no active maintenance window", async () => {
    mockMaintenanceStatus({ is_maintenance_active: false, maintenance_details: null });

    const res = buildResponse();
    const next: NextFunction = mock(() => undefined) as unknown as NextFunction;

    await rejectDuringActiveMaintenance({} as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(res.headers["Retry-After"]).toBeUndefined();
  });

  it("rejects with 503 and downtime metadata during active maintenance", async () => {
    const start = new Date(Date.now() - 60_000).toISOString();
    const end = new Date(Date.now() + 30 * 60_000).toISOString();

    mockMaintenanceStatus({
      is_maintenance_active: true,
      maintenance_details: {
        end_datetime: end,
        estimated_time_remaining_seconds: 1800,
        message: "Scheduled database maintenance",
        start_datetime: start,
        title: "Database upgrade"
      }
    });

    const res = buildResponse();
    const next: NextFunction = mock(() => undefined) as unknown as NextFunction;

    await rejectDuringActiveMaintenance({} as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = (next as ReturnType<typeof mock>).mock.calls[0][0] as APIError;

    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(503);
    expect(error.message).toContain("scheduled maintenance");
    expect(error.errors).toEqual([
      {
        detail: "Scheduled database maintenance",
        maintenance_end: end,
        maintenance_start: start,
        operations: ["create_quote", "ramp_register", "ramp_update", "ramp_start"],
        retry_after_seconds: expect.any(Number),
        title: "Database upgrade",
        type: "https://api.vortexfinance.co/problems/maintenance-window"
      }
    ]);
    expect(res.headers["Retry-After"]).toBe(new Date(end).toUTCString());
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.sentContentType).toBe("application/problem+json");
  });
});
