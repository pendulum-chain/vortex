import type { CorsOptions } from "cors";
import { buildDashboardPreviewOriginRegex, parseFixedOrigins } from "./corsOrigins";
import { config } from "./vars";

// DASHBOARD_ORIGINS is an explicit whitelist (wildcards dropped);
// DASHBOARD_PREVIEW_SITE enables Netlify deploy-preview origins outside production.
const dashboardOrigins = parseFixedOrigins(process.env.DASHBOARD_ORIGINS);
const browserSdkOrigins = parseFixedOrigins(process.env.BROWSER_SDK_ORIGINS);
const dashboardPreviewOriginRegex = buildDashboardPreviewOriginRegex(process.env.DASHBOARD_PREVIEW_SITE, config.deploymentEnv);

export const corsOptions: CorsOptions = {
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-API-Key",
    "X-Public-Key",
    "X-Managed-Profile-Id",
    "X-Request-ID",
    "X-Correlation-ID",
    "Idempotency-Key"
  ],
  credentials: true,
  exposedHeaders: ["X-Request-ID"],
  maxAge: 86400,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  origin: [
    "https://app.vortexfinance.co",
    "https://dashboard.vortexfinance.co",
    "https://metrics.vortexfinance.co",
    ...dashboardOrigins,
    ...browserSdkOrigins,
    dashboardPreviewOriginRegex,
    config.deploymentEnv !== "production" ? "https://staging--vortexfi.netlify.app" : null,
    config.deploymentEnv !== "production" ? "http://localhost:5173" : null,
    config.deploymentEnv !== "production" ? "http://127.0.0.1:5173" : null,
    config.deploymentEnv !== "production" ? "http://localhost:5174" : null,
    config.deploymentEnv !== "production" ? "http://127.0.0.1:5174" : null,
    config.env === "development" ? "http://localhost:6006" : null
  ].filter(Boolean) as (string | RegExp)[]
};
