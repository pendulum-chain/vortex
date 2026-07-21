# API Surface

## What This Does

This spec covers the external-facing attack surface of the Vortex API (`apps/api/`): how requests enter the system, what validation is applied, how errors are returned, and what network-level protections exist.

**Express configuration** (`config/express.ts`):
- CORS: Explicit origin whitelist — `app.vortexfinance.co`, `dashboard.vortexfinance.co`, `metrics.vortexfinance.co`, staging Netlify, `localhost` (dev only), plus the optional `DASHBOARD_ORIGINS` env var (comma-separated fixed origins for non-production dashboard deployments; resolved once at boot, wildcard entries dropped)
- Rate limiting: 100 requests per minute per IP (global, all endpoints)
- Helmet: Standard HTTP security headers
- Body parser: JSON with **20MB limit**
- Cookie parser: Enabled (for Supabase auth tokens)

**Input validation** (`middlewares/validators.ts`):
- Hand-written validators for each endpoint (no schema library like Zod/Joi)
- Validators check field presence, type, and basic format (e.g., valid address, valid enum)
- Applied as Express middleware on route definitions

**Error handling** (`middlewares/error.ts`):
- Global error handler converts all errors to `APIError` format
- Stack traces stripped in non-development environments
- 404 handler for unmatched routes
- Error responses include an `errors` array with validation details
- Fiat-provider failures raised while handling the mutating ramp endpoints (`POST /v1/ramp/register`, `POST /v1/ramp/update`, `POST /v1/ramp/start`) are normalized before they reach the caller (`mapProviderFailure` in `controllers/ramp.controller.ts`). Both providers throw a `ProviderHttpError` (`BrlaApiError` for Avenia/BRLA, `AlfredpayApiError` for Alfredpay; base class in `packages/shared/src/services/providerHttpError.ts` — named to avoid colliding with the price-layer `ProviderApiError` in `api/errors/providerErrors.ts`), covering both non-ok HTTP responses and transport failures (DNS/timeout/connection reset, carried as `status: 0`). The handler maps these to a `422` (upstream `4xx` — account/request rejected) or `502` (upstream `5xx`/transport — provider unavailable) with a generic "payment provider" message. The raw upstream body (e.g. `{"error":"user is blocked"}`) is **never** forwarded to the caller; it is logged server-side only, **truncated** to 300 chars, alongside the failing `provider`/`endpoint`/`method`/`status` (never query parameters, which may carry a PIX key or other PII) so operators can pinpoint which provider call failed and why. This context is embedded in the error log message itself (`formatProviderContext`) because the app logger (`config/logger.ts`) formats only `{ timestamp, level, message, label }` and drops metadata objects. The Avenia and Alfredpay controllers under `controllers/` handle their own errors inline and do not route through this path.

**Request correlation and client observability** (`api/observability/`):
- Incoming requests receive or propagate a non-secret request ID.
- The API returns `X-Request-ID` so clients can include it in support/debug reports.
- Partner-facing quote/ramp/auth outcomes are recorded as sanitized operational events; see `07-operations/client-observability.md`.

**Maintenance-window enforcement** (`middlewares/maintenanceGuard.ts`):
- Active maintenance windows are sourced from the `maintenance_schedules` table via `MaintenanceService`.
- During an active window, mutable quote/ramp operations return HTTP `503 Service Unavailable` before controller/service work starts.
- Rejections include `Retry-After`, `Cache-Control: no-store`, and downtime metadata (`maintenance_start`, `maintenance_end`, affected operations) in the error payload so direct API clients can pause and retry after the window.

**Route structure:** 27 TypeScript route files under `api/routes/v1/` including `index.ts`, each mounting controllers with appropriate auth middleware.

## Security Invariants

1. **CORS MUST only allow explicit origins** — The whitelist is defined in `express.ts`. No wildcard (`*`) origins. No dynamic origin reflection (echoing back the `Origin` header). The `DASHBOARD_ORIGINS` env var extends the whitelist with additional *fixed* origins only: it is parsed once at boot and entries containing `*` are silently discarded, so it cannot be used to introduce a wildcard.
2. **Rate limiting MUST be enforced on all endpoints** — 100 req/min per IP applies globally via `express-rate-limit`. No endpoint should bypass this.
3. **Body size MUST be bounded** — The JSON body parser has a limit. **⚠️ FINDING: The limit is 20MB (`"20mb"`), which is still large for a JSON API.** A typical API allows 1-10MB. 20MB still enables avoidable memory pressure.
4. **All user input MUST be validated before reaching controllers** — Validators run as middleware before the controller function. Missing validation on an endpoint means raw user input reaches business logic.
5. **Error responses MUST NOT leak internal details in production** — Stack traces are stripped when `NODE_ENV !== "development"`. Error messages should be generic. The `errors` array should contain only user-facing validation messages.
6. **404 responses MUST be returned for unmatched routes** — The 404 handler prevents Express from returning default HTML error pages that could reveal framework information.
7. **Helmet MUST be enabled** — Adds `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, and other security headers.
8. **Input validation MUST cover all mutable endpoints** — Every POST/PUT/PATCH/DELETE endpoint should have a validator middleware. GET endpoints with query parameters should also validate.
9. **No endpoint MUST accept and process fields not explicitly validated** — Hand-written validators check specific fields but don't reject unknown fields. Extra fields pass through to controllers, which could lead to mass assignment or unexpected behavior.
10. **Request IDs MUST be correlation-only** — Request IDs may be accepted from clients or generated by the API, but they must not grant access, alter authorization, or be treated as trusted identity.
11. **API observability MUST NOT change request outcomes** — Client event persistence/logging must be best-effort and must not change controller response bodies, status codes, or ramp/quote state.
12. **Maintenance windows MUST be backend-enforced on mutable ramp entrypoints** — `POST /v1/quotes`, `POST /v1/quotes/best`, `POST /v1/ramp/register`, `POST /v1/ramp/update`, and `POST /v1/ramp/start` must reject during active maintenance with `503`, `Retry-After`, and explicit downtime start/end metadata. UI disabling is not sufficient because partners may call the API directly.
13. **Provider-backed ramp endpoints MUST reject callers without an effective user** — Alfredpay and Avenia/BRL flows derive their provider customer/subaccount from `api_keys.user_id -> profiles.id -> alfredpay_customers.user_id` / `tax_ids.user_id`. Quote creation is anonymous-eligible on every corridor (Alfredpay quotes carry only a tracking-metadata customer id — the `"anonymous"` sentinel for non-KYC'd callers), but `POST /v1/ramp/register` requires Supabase or secret-key credentials and `RampService.registerRamp` rejects missing effective users with `400 Invalid quote`. Quotes owned by a *different* user are rejected with `403`; anonymous quotes (no owner) may be claimed, with provider identity always derived from the claimer's own KYC records.
14. **Active customer-entity selection MUST be authenticated, owner-scoped, and immutable** — `PUT /v1/onboarding/active-entity` accepts only `individual` or `business`, locks the authenticated profile while selecting, and may bind only an active `customer_entities` row owned by that profile. An identical retry returns the existing selection. A different later type, an ownership mismatch, or multiple active owned entities of the requested type is rejected with `409`; no arbitrary row is selected.
15. **Legacy active-entity backfill MUST be unambiguous** — Migration 048 selects only one active entity that already owns provider or recipient data. Empty automatically-created individual entities do not force the selection. Profiles with multiple meaningful entities or no meaningful entity remain null and `GET /v1/onboarding/status` returns `selectionRequired: true`.
16. **Authenticated all-wallet ramp history MUST be user-scoped** — `GET /v1/ramp/history` requires a principal with an effective user and filters directly on `RampState.userId`. The endpoint MUST NOT accept a client-supplied owner ID, include null-owned or foreign-user ramps, infer ownership from a destination wallet or pricing partner, or fall back to partner-wide history for an unlinked partner key. The legacy `/v1/ramp/history/:walletAddress` route remains available under its existing user-or-partner ownership rules.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **⚠️ Memory exhaustion via large request body** — Attacker sends a 20MB JSON payload repeatedly to exhaust server memory | Rate limiting (100 req/min) provides some protection, but 100 requests × 20MB = 2GB of memory pressure per minute per IP. **The 20MB limit should be reduced to 1-10MB.** |
| **CORS bypass** — Attacker's site makes cross-origin requests to the API | Explicit origin whitelist prevents this. However, the whitelist includes `staging--pendulum-pay.netlify.app` — if the staging site is compromised or has XSS, it becomes a CORS-allowed origin in production. |
| **Rate limit bypass via IP rotation** — Attacker uses multiple IPs to exceed per-IP rate limits | No mitigation beyond the per-IP limit. No account-based rate limiting, no endpoint-specific limits, no progressive penalties. High-value endpoints (ramp creation, quote generation) get the same limit as read-only endpoints. |
| **Input validation bypass** — Validator doesn't check a field that the controller uses | Hand-written validators are prone to omissions. No schema library enforces completeness. New fields added to controllers may not get corresponding validators. |
| **Mass assignment** — Extra fields in the request body are passed to database operations | Validators check for expected fields but don't strip unknown fields. If a controller passes `req.body` directly to a database query (e.g., Sequelize `create(req.body)`), extra fields could set unintended columns. |
| **Error response information leak** — The `errors` array in error responses reveals internal validation logic or database field names | Error handler wraps errors in `APIError`. The `errors` array content depends on what validators put there. Validator messages reference field names from the API schema, not necessarily database internals, but should be audited. |
| **Staging CORS origin in production** — `staging--pendulum-pay.netlify.app` is in the CORS whitelist | If the staging site has an XSS vulnerability, an attacker could use it to make authenticated cross-origin requests to the production API. Staging origins should ideally be removed from production CORS config. |
| **No per-endpoint rate limiting** — Sensitive endpoints (ramp creation, admin operations) have the same rate limit as public read endpoints | An attacker can create 100 ramps per minute per IP. For endpoints that trigger expensive operations (XCM, SquidRouter), this could amplify costs. |
| **Cookie-based auth without CSRF protection** — Cookie parser is enabled for Supabase auth tokens | If auth tokens are stored in cookies (not just headers), cross-site requests from CORS-allowed origins could carry auth cookies automatically. Verify whether CSRF tokens or `SameSite` cookie attributes are used. |
| **Observability side effects** — Event persistence failure breaks a partner-facing API call | Observability helpers must catch persistence/logging errors and run best-effort only. See `client-observability.md`. |
| **Direct API bypass of UI maintenance mode** — Partner SDK or custom API clients ignore the frontend and continue creating quotes or mutating ramps during planned downtime | Mutable quote/ramp routes run the maintenance guard server-side and fail closed with `503 Service Unavailable`, `Retry-After`, and the active window's start/end timestamps. |
| **Cross-user history disclosure** — A caller requests account-wide ramp history and receives ramps belonging to another profile or to a pricing partner | The controller requires `getEffectiveUserId(req)` and the service query adds `RampState.userId = effectiveUserId`; wallet addresses and partner pricing never grant ownership. |

## Audit Checklist

- [FAIL] **⚠️ FINDING F-035**: `bodyParser.json({ limit: "20mb" })` — verify this limit is intentional. Recommend reducing to 1-10MB for a JSON API. **FAIL F-035** — 20MB limit remains high for a JSON API.
- [FAIL] **FINDING F-036**: `staging--pendulum-pay.netlify.app` is in the production CORS whitelist — verify this is intentional and assess the risk of staging-site compromise. **FAIL F-036** — staging origin always in CORS whitelist regardless of `NODE_ENV`.
- [PARTIAL] **FINDING**: All validators are hand-written (no Zod/Joi) — verify every mutable endpoint has a corresponding validator middleware. **PARTIAL F-037** — hand-written validators exist but multiple sensitive endpoints lack authentication/validation entirely.
- [x] Verify CORS does not use wildcard (`*`) or dynamic origin reflection — check `express.ts` for `origin: true` or callback patterns. **PASS** — explicit origin whitelist used; no wildcard or dynamic reflection.
- [x] Verify rate limiting cannot be bypassed by removing or spoofing `X-Forwarded-For` headers — check how `express-rate-limit` identifies clients. **PASS** — `express-rate-limit` uses IP-based identification.
- [x] Verify `Helmet` is configured with secure defaults — check for any disabled protections. **PASS** — Helmet enabled with default security headers.
- [N/A] Verify `NODE_ENV` is set to `"production"` in production — stack traces are only stripped when not in development mode. **N/A** — requires deployment configuration inspection.
- [x] Verify error responses do not include internal error types, database error codes, or SQL fragments. **PASS** — error handler wraps errors in generic `APIError` format.
- [x] Verify the `errors` array in `APIError` contains only user-facing messages, not internal field names or database column names. **PASS** — error messages are user-facing validation messages.
- [x] Map all 28 TypeScript route files and verify each has appropriate auth middleware (Supabase, API key, admin, metrics dashboard, or public). **PASS** — F-013 resolved (legacy `/pendulum/fundEphemeral`, `/moonbeam/execute-xcm`, `/subsidize/*` endpoints removed); `/v1/ramp/*` and `/v1/ramp/quotes(/best)` use `requirePartnerOrUserAuth()` with ownership guards; `/v1/brla/*` uses `requireAuth`; `/v1/mykobo/profiles` (GET + POST) use `requireAuth` (F-068 resolved); `/v1/maintenance/*`, `/v1/admin/partners/:partnerName/api-keys`, and `/v1/admin/profile-partner-assignments` use `adminAuth`; `/v1/admin/api-client-events` uses `metricsDashboardAuth`; `/v1/webhook/*` uses `apiKeyAuth`.
- [x] Active customer-entity selection is Supabase-authenticated, serialized on the profile row, owner-scoped, idempotent for an identical retry, and rejects mutation or ambiguity.
- [x] Verify no route accidentally uses `publicKeyAuth` (public key only, no secret key) for operations that should require `apiKeyAuth` (secret key). **PASS** — auth middleware usage reviewed per route.
- [N/A] Verify controllers do not pass raw `req.body` to database operations — check for Sequelize `.create(req.body)` or `.update(req.body)` patterns. **N/A** — deferred; requires comprehensive Sequelize usage audit.
- [x] Verify no endpoint returns `process.env`, server config, or internal paths in responses. **PASS** — no endpoint exposes internal configuration.
- [PARTIAL] Check whether Supabase auth cookies use `SameSite=Strict` or `SameSite=Lax` — and whether CSRF tokens are required for state-changing operations. **PARTIAL** — cookie parser enabled but cookie attributes not explicitly configured for `SameSite`.
- [x] Verify the 404 handler does not reveal Express version or framework information. **PASS** — custom 404 handler returns generic JSON error.
- [x] Check all 27 route files for endpoints that accept file uploads — verify file size limits and type validation if present. **PASS** — no file upload endpoints found.
- [ ] Verify request ID middleware runs before routes and returns `X-Request-ID` without using request IDs for authorization.
- [ ] Verify partner-facing API observability writes are best-effort and cannot alter response status, response body, or quote/ramp state.
- [x] Verify active maintenance windows are enforced by the backend on quote creation and ramp register/update/start, not only by frontend UI state.
- [x] `GET /v1/ramp/history` precedes the dynamic `/:id` route, requires an effective user, and returns only non-initial ramps whose `RampState.userId` matches that user. HTTP tests cover multiple destination wallets, cross-user isolation, user-scoped API keys, and anonymous rejection.
