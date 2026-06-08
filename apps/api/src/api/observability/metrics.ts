import { ApiClientEventInput } from "./types";

export function recordApiClientMetricsSafe(_event: ApiClientEventInput): void {
  // Persistent api_client_events rows are the durable metric source for this phase.
  // This hook is intentionally kept as a safe extension point for Prometheus/Datadog exporters.
}
