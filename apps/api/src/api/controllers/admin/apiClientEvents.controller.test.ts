import { afterEach, describe, expect, it, mock } from "bun:test";
import express from "express";
import httpStatus from "http-status";
import { config } from "../../../config/vars";
import ApiClientEvent from "../../../models/apiClientEvent.model";
import apiClientEventsRoutes from "../../routes/v1/admin/api-client-events.route";
import { listApiClientEvents } from "./apiClientEvents.controller";

type ResponseRecorder = {
  body: unknown;
  statusCode: number;
  json: ReturnType<typeof mock>;
  status: ReturnType<typeof mock>;
};

function createResponse() {
  const res: ResponseRecorder = {
    body: undefined,
    json: mock((body: unknown) => {
      res.body = body;
      return res;
    }),
    status: mock((statusCode: number) => {
      res.statusCode = statusCode;
      return res;
    }),
    statusCode: Number(httpStatus.OK)
  };

  return res;
}

describe("api client events admin route", () => {
  const originalAdminSecret = config.adminSecret;
  const originalMetricsDashboardSecret = config.metricsDashboardSecret;

  afterEach(() => {
    config.adminSecret = originalAdminSecret;
    config.metricsDashboardSecret = originalMetricsDashboardSecret;
  });

  async function fetchFromTestRoute(authorization?: string) {
    const app = express();
    app.use("/v1/admin/api-client-events", apiClientEventsRoutes);

    const server = app.listen(0);
    const address = server.address();

    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Could not bind test server");
    }

    try {
      return await fetch(`http://127.0.0.1:${address.port}/v1/admin/api-client-events`, {
        ...(authorization ? { headers: { Authorization: authorization } } : {})
      });
    } finally {
      server.close();
    }
  }

  it("rejects requests without metrics dashboard authentication before querying events", async () => {
    const response = await fetchFromTestRoute();
    const body = await response.json();

    expect(response.status).toBe(httpStatus.UNAUTHORIZED);
    expect(body.error.code).toBe("METRICS_DASHBOARD_AUTH_REQUIRED");
  });

  it("rejects the admin secret because metrics access has a dedicated secret", async () => {
    config.adminSecret = "admin-secret";
    config.metricsDashboardSecret = "metrics-dashboard-secret";

    const response = await fetchFromTestRoute("Bearer admin-secret");
    const body = await response.json();

    expect(response.status).toBe(httpStatus.FORBIDDEN);
    expect(body.error.code).toBe("INVALID_METRICS_DASHBOARD_TOKEN");
  });
});

describe("listApiClientEvents", () => {
  const originalFindAndCountAll = ApiClientEvent.findAndCountAll;
  const originalFindAll = ApiClientEvent.findAll;

  afterEach(() => {
    ApiClientEvent.findAndCountAll = originalFindAndCountAll;
    ApiClientEvent.findAll = originalFindAll;
  });

  it("returns safe event fields, pagination, filters, and summary counts", async () => {
    const findAndCountAllMock = mock(async (_options: unknown) => ({
      count: 2,
      rows: [
        {
          apiKeyPrefix: "sk_live_1234",
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
          durationMs: 25,
          errorMessage: null,
          errorType: "none",
          httpStatus: 200,
          id: "event-1",
          metadata: { endpoint: "/v1/quotes" },
          operation: "quote_create",
          partnerName: "Partner",
          quoteId: "quote-1",
          rampId: null,
          requestId: "request-1",
          status: "success"
        }
      ]
    }));
    const findAllMock = mock(async (_options: unknown) => [
      { errorType: "none", operation: "quote_create", status: "success" },
      { errorType: "internal_error", operation: "ramp_start", status: "failure" }
    ]);

    ApiClientEvent.findAndCountAll = findAndCountAllMock as unknown as typeof ApiClientEvent.findAndCountAll;
    ApiClientEvent.findAll = findAllMock as unknown as typeof ApiClientEvent.findAll;

    const res = createResponse();
    await listApiClientEvents(
      {
        query: {
          endDate: "2026-01-03T00:00:00.000Z",
          limit: "500",
          offset: "5",
          operation: "quote_create",
          partnerName: "Partner",
          startDate: "2026-01-01T00:00:00.000Z",
          status: "success"
        }
      } as Parameters<typeof listApiClientEvents>[0],
      res as unknown as Parameters<typeof listApiClientEvents>[1]
    );

    const firstFindCall = findAndCountAllMock.mock.calls[0];
    expect(firstFindCall).toBeDefined();

    const findOptions = firstFindCall?.[0] as {
      attributes: string[];
      limit: number;
      offset: number;
      where: Record<string, unknown>;
    };

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(findOptions.limit).toBe(200);
    expect(findOptions.offset).toBe(5);
    expect(findOptions.attributes).not.toContain("partnerId");
    expect(findOptions.attributes).not.toContain("userId");
    expect(findOptions.where.operation).toBe("quote_create");
    expect(findOptions.where.partnerName).toBe("Partner");
    expect(findOptions.where.status).toBe("success");
    expect(res.body).toEqual({
      events: [
        {
          apiKeyPrefix: "sk_live_1234",
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
          durationMs: 25,
          errorMessage: null,
          errorType: "none",
          httpStatus: 200,
          id: "event-1",
          metadata: { endpoint: "/v1/quotes" },
          operation: "quote_create",
          partnerName: "Partner",
          quoteId: "quote-1",
          rampId: null,
          requestId: "request-1",
          status: "success"
        }
      ],
      limit: 200,
      offset: 5,
      summary: {
        byErrorType: { internal_error: 1, none: 1 },
        byOperation: { quote_create: 1, ramp_start: 1 },
        byStatus: { failure: 1, success: 1 },
        sampleSize: 2,
        total: 2
      },
      total: 2
    });
  });
});
