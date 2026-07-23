// CORS origin helpers for the dashboard. Kept separate from express.ts so the
// whitelist logic is unit-testable without booting the app.

// Extra fixed origins for non-production dashboard deployments (comma-separated env
// var, e.g. a staging or preview URL). Resolved once at boot — this stays an explicit
// whitelist per the security spec; wildcards are dropped, never honored.
export function parseDashboardOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0 && !origin.includes("*"));
}

// Netlify site slugs are lowercase alphanumerics and hyphens.
const NETLIFY_SITE_SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// Netlify deploy-preview origins for the dashboard. The env var carries only the
// Netlify site slug (e.g. "vortex-dashboard"); the URL shape is fixed here so the
// operator cannot introduce an arbitrary pattern — only
// https://deploy-preview-<n>--<slug>.netlify.app matches. Never active in production;
// gate on config.deploymentEnv (DEPLOYMENT_ENV), not config.env (NODE_ENV) — staging
// runs with NODE_ENV=production, so NODE_ENV cannot tell staging from production.
export function buildDashboardPreviewOriginRegex(siteSlug: string | undefined, deploymentEnv: string): RegExp | null {
  if (deploymentEnv === "production" || !siteSlug || !NETLIFY_SITE_SLUG.test(siteSlug)) {
    return null;
  }
  return new RegExp(`^https://deploy-preview-\\d+--${siteSlug}\\.netlify\\.app$`);
}
