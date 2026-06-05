import { afterEach, describe, expect, it, mock } from "bun:test";
import { buildApiClientEventsUrl, fetchApiClientEvents, normalizeMetricsDashboardToken } from "./apiClientEvents";

describe("buildApiClientEventsUrl", () => {
  it("builds relative Netlify proxy URLs with query filters", () => {
    const url = buildApiClientEventsUrl({ limit: 50, offset: 0, partnerName: "Partner" }, "/api/staging");

    expect(url).toBe("/api/staging/v1/admin/api-client-events?limit=50&offset=0&partnerName=Partner");
  });
});

describe("fetchApiClientEvents", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends the metrics dashboard bearer token to the protected endpoint", async () => {
    const fetchMock = mock(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({
        events: [],
        limit: 50,
        offset: 0,
        summary: { byErrorType: {}, byOperation: {}, byStatus: {}, sampleSize: 0, total: 0 },
        total: 0
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchApiClientEvents({ limit: 50, offset: 0 }, "metrics-dashboard-secret");

    const firstFetchCall = fetchMock.mock.calls[0];
    expect(firstFetchCall).toBeDefined();

    const init = firstFetchCall?.[1];
    expect(init).toEqual({
      headers: {
        Authorization: "Bearer metrics-dashboard-secret"
      }
    });
  });

  it("normalizes a pasted bearer token before sending the auth header", async () => {
    const fetchMock = mock(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({
        events: [],
        limit: 50,
        offset: 0,
        summary: { byErrorType: {}, byOperation: {}, byStatus: {}, sampleSize: 0, total: 0 },
        total: 0
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchApiClientEvents({ limit: 50, offset: 0 }, "Bearer metrics-dashboard-secret");

    const firstFetchCall = fetchMock.mock.calls[0];
    expect(firstFetchCall).toBeDefined();

    const init = firstFetchCall?.[1];
    expect(init).toEqual({
      headers: {
        Authorization: "Bearer metrics-dashboard-secret"
      }
    });
  });
});

describe("normalizeMetricsDashboardToken", () => {
  it("accepts raw token values and pasted bearer header values", () => {
    expect(normalizeMetricsDashboardToken("metrics-dashboard-secret")).toBe("metrics-dashboard-secret");
    expect(normalizeMetricsDashboardToken("Bearer metrics-dashboard-secret")).toBe("metrics-dashboard-secret");
    expect(normalizeMetricsDashboardToken(" bearer   metrics-dashboard-secret ")).toBe("metrics-dashboard-secret");
  });
});
