import { config } from "../../config/vars";
import { bearerSecretAuth } from "./bearerSecretAuth";

/**
 * Authenticates internal observability dashboard requests with a dedicated bearer token.
 */
export const metricsDashboardAuth = bearerSecretAuth({
  codes: {
    error: "METRICS_DASHBOARD_AUTH_ERROR",
    invalidToken: "INVALID_METRICS_DASHBOARD_TOKEN",
    notConfigured: "METRICS_DASHBOARD_AUTH_NOT_CONFIGURED",
    required: "METRICS_DASHBOARD_AUTH_REQUIRED"
  },
  envName: "METRICS_DASHBOARD_SECRET",
  getSecret: () => config.metricsDashboardSecret,
  label: "Metrics dashboard"
});
