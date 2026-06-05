import { config } from "../config";

export type ApiClientEvent = {
  apiKeyPrefix: string | null;
  createdAt: string;
  durationMs: number | null;
  errorMessage: string | null;
  errorType: string | null;
  httpStatus: number | null;
  id: string;
  metadata: Record<string, unknown> | null;
  network: string | null;
  operation: string;
  partnerName: string | null;
  paymentMethod: string | null;
  quoteId: string | null;
  rampId: string | null;
  rampType: string | null;
  requestId: string | null;
  status: "success" | "failure";
};

export type ApiClientEventsFilters = {
  apiKeyPrefix?: string;
  endDate?: string;
  errorType?: string;
  limit: number;
  offset: number;
  operation?: string;
  partnerName?: string;
  quoteId?: string;
  rampId?: string;
  requestId?: string;
  startDate?: string;
  status?: string;
};

export type ApiClientEventsResponse = {
  events: ApiClientEvent[];
  limit: number;
  offset: number;
  summary: {
    byErrorType: Record<string, number>;
    byOperation: Record<string, number>;
    byStatus: Record<string, number>;
    sampleSize: number;
    total: number;
  };
  total: number;
};

export function buildApiClientEventsUrl(filters: ApiClientEventsFilters, apiBaseUrl = config.apiBaseUrl): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }

  const queryString = params.toString();
  const baseUrl = apiBaseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/v1/admin/api-client-events`;
  return queryString ? `${url}?${queryString}` : url;
}

export async function fetchApiClientEvents(
  filters: ApiClientEventsFilters,
  metricsDashboardToken: string
): Promise<ApiClientEventsResponse> {
  const response = await fetch(buildApiClientEventsUrl(filters), {
    headers: {
      Authorization: `Bearer ${metricsDashboardToken}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with status ${response.status}`);
  }

  return response.json();
}
