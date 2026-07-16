import {afterAll, afterEach, describe, expect, it, mock} from "bun:test";
import type {NextFunction, Request, Response} from "express";
import express from "express";
import httpStatus from "http-status";
import {APIError} from "../errors/api-error";
// Real modules are captured (value copies, not live bindings) before the
// mock.module calls below so afterAll can restore them — bun keeps module
// mocks for the whole process otherwise, poisoning every later test file.
import * as authServiceReal from "../services/auth";
import * as quoteControllerReal from "../controllers/quote.controller";
import * as rampControllerReal from "../controllers/ramp.controller";
import * as apiClientEventServiceReal from "../observability/apiClientEvent.service";
import type {ApiClientEventInput} from "../observability/types";
import {MaintenanceService} from "../services/maintenance.service";
import {handler as errorHandler} from "./error";

const realModules: Array<[string, Record<string, unknown>]> = [
  ["../observability/apiClientEvent.service", { ...apiClientEventServiceReal }],
  ["../controllers/quote.controller", { ...quoteControllerReal }],
  ["../controllers/ramp.controller", { ...rampControllerReal }],
  ["../services/auth", { ...authServiceReal }]
];

afterAll(() => {
  for (const [path, real] of realModules) {
    mock.module(path, () => real);
  }
});

const observedEvents: ApiClientEventInput[] = [];
const controllerCalls: string[] = [];

mock.module("../observability/apiClientEvent.service", () => ({
  buildApiClientRequestMetadata: mock(() => ({})),
  getSafeApiKeyPrefix: mock((apiKey: string | null | undefined) => apiKey?.slice(0, 16) || null),
  observeApiClientEvent: mock((event: ApiClientEventInput) => {
    observedEvents.push(event);
  })
}));

function controllerHandler(name: string) {
  return (_req: Request, res: Response) => {
    controllerCalls.push(name);
    res.status(httpStatus.IM_A_TEAPOT).json({ reached: name });
  };
}

mock.module("../controllers/quote.controller", () => ({
  createBestQuote: mock(controllerHandler("quote_create_best_controller")),
  createQuote: mock(controllerHandler("quote_create_controller")),
  getQuote: mock(controllerHandler("quote_get_controller"))
}));

mock.module("../controllers/ramp.controller", () => ({
  getErrorLogs: mock(controllerHandler("ramp_errors_controller")),
  getRampHistory: mock(controllerHandler("ramp_history_controller")),
  getRampStatus: mock(controllerHandler("ramp_status_controller")),
  registerRamp: mock(controllerHandler("ramp_register_controller")),
  startRamp: mock(controllerHandler("ramp_start_controller")),
  updateRamp: mock(controllerHandler("ramp_update_controller"))
}));

mock.module("../services/auth", () => ({
  SupabaseAuthService: {
    verifyToken: mock(async () => ({ valid: false }))
  }
}));

const { rejectDuringActiveMaintenance } = await import("./maintenanceGuard");
const { default: quoteRoutes } = await import("../routes/v1/quote.route");
const { default: rampRoutes } = await import("../routes/v1/ramp.route");

type MaintenanceStatus = Awaited<ReturnType<MaintenanceService["getMaintenanceStatus"]>>;
type MaintenanceHttpResponse = {
  code: number;
  errors?: Record<string, unknown>[];
  statusCode?: number;
  type?: string;
};

const maintenanceService = MaintenanceService.getInstance();
const originalGetMaintenanceStatus = maintenanceService.getMaintenanceStatus;

function buildResponse() {
  const headers: Record<string, string> = {};
  const res: Partial<Response> & { headers: Record<string, string> } = { headers };

  res.setHeader = mock((name: string, value: number | string | readonly string[]) => {
    headers[name] = Array.isArray(value) ? value.join(", ") : String(value);
    return res as Response;
  }) as Response["setHeader"];

  return res as Response & { headers: Record<string, string> };
}

function mockMaintenanceStatus(status: MaintenanceStatus) {
  maintenanceService.getMaintenanceStatus = mock(async () => status) as unknown as MaintenanceService["getMaintenanceStatus"];
}

async function fetchFromGuardedRoutes(path: string) {
  const app = express();
  app.use(express.json());
  app.use("/v1/quotes", quoteRoutes);
  app.use("/v1/ramp", rampRoutes);
  app.use(errorHandler);

  const server = app.listen(0);
  const address = server.address();

  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not bind test server");
  }

  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, {
      body: JSON.stringify({ malformed: true }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
  } finally {
    server.close();
  }
}

describe("rejectDuringActiveMaintenance", () => {
  afterEach(() => {
    controllerCalls.length = 0;
    observedEvents.length = 0;
    maintenanceService.getMaintenanceStatus = originalGetMaintenanceStatus;
  });

  it("passes through when there is no active maintenance window", async () => {
    mockMaintenanceStatus({ is_maintenance_active: false, maintenance_details: null });

    const res = buildResponse();
    const next: NextFunction = mock(() => undefined) as unknown as NextFunction;

    await rejectDuringActiveMaintenance("quote_create")({} as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(observedEvents).toEqual([]);
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

    await rejectDuringActiveMaintenance("quote_create")(
      {
        body: {
          apiKey: "pk_live_1234567890abcdef",
          paymentMethod: "pix",
          quoteId: "quote-1",
          rampType: "BUY"
        },
        requestId: "request-1",
        requestStartedAt: Date.now() - 50
      } as Request,
      res,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    const error = (next as ReturnType<typeof mock>).mock.calls[0][0] as APIError;

    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(503);
    expect(error.type).toBe("https://api.vortexfinance.co/problems/maintenance-window");
    expect(error.message).toContain("scheduled maintenance");
    expect(error.message).toContain("Database upgrade");
    expect(error.message).toContain("Scheduled database maintenance");
    expect(error.errors).toEqual([
      {
        detail: "Scheduled database maintenance",
        maintenance_end: end,
        maintenance_start: start,
        operations: ["quote_create", "quote_create_best", "ramp_register", "ramp_update", "ramp_start"],
        retry_after_seconds: expect.any(Number),
        title: "Database upgrade",
        type: "https://api.vortexfinance.co/problems/maintenance-window"
      }
    ]);
    expect(res.headers["Retry-After"]).toBe(new Date(end).toUTCString());
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(observedEvents).toEqual([
      expect.objectContaining({
        apiKeyPrefix: "pk_live_",
        errorType: "service_unavailable",
        httpStatus: 503,
        metadata: {
          maintenance_end: end,
          maintenance_start: start,
          maintenance_title: "Database upgrade"
        },
        operation: "quote_create",
        paymentMethod: "pix",
        quoteId: "quote-1",
        rampType: "BUY",
        requestId: "request-1",
        status: "failure"
      })
    ]);
  });

  it("rejects every guarded quote and ramp route before controllers run", async () => {
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

    const guardedPaths = ["/v1/quotes", "/v1/quotes/best", "/v1/ramp/register", "/v1/ramp/update", "/v1/ramp/start"];

    for (const path of guardedPaths) {
      const response = await fetchFromGuardedRoutes(path);
      const body = (await response.json()) as MaintenanceHttpResponse;

      expect(response.status).toBe(httpStatus.SERVICE_UNAVAILABLE);
      expect(response.headers.get("Retry-After")).toBe(new Date(end).toUTCString());
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(body.code).toBe(httpStatus.SERVICE_UNAVAILABLE);
      expect(body.statusCode).toBe(httpStatus.SERVICE_UNAVAILABLE);
      expect(body.type).toBe("https://api.vortexfinance.co/problems/maintenance-window");
      expect(body.errors?.[0]).toEqual(
        expect.objectContaining({
          maintenance_end: end,
          maintenance_start: start,
          operations: ["quote_create", "quote_create_best", "ramp_register", "ramp_update", "ramp_start"],
          retry_after_seconds: expect.any(Number),
          type: "https://api.vortexfinance.co/problems/maintenance-window"
        })
      );
    }

    expect(controllerCalls).toEqual([]);
  });
});
