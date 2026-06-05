type Environment = "development" | "staging" | "production" | "sandbox";

const nodeEnv = process.env.NODE_ENV as Environment;
const env = (import.meta.env.VITE_ENVIRONMENT || nodeEnv || "development") as Environment;
const explicitApiBase = import.meta.env.VITE_DASHBOARD_API_BASE;

function getDefaultApiBase(environment: Environment): string {
  if (environment === "production") return "/api/production";
  if (environment === "staging") return "/api/staging";
  if (environment === "sandbox") return "/api/sandbox";
  return "http://localhost:3000";
}

export const config = {
  apiBaseUrl: explicitApiBase || getDefaultApiBase(env),
  env,
  isDev: env === "development",
  isProd: env === "production"
};
