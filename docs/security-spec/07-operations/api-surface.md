# API Surface

## What This Does

This spec covers the external-facing attack surface of the Vortex API (`apps/api/`): how requests enter the system, what validation is applied, how errors are returned, and what network-level protections exist.

**Express configuration** (`config/express.ts`):
- CORS: Explicit origin whitelist — `app.vortexfinance.co`, `metrics.vortexfinance.co`, staging Netlify, `localhost` (dev only)
- Rate limiting: 100 requests per minute per IP (global, all endpoints)
- Helmet: Standard HTTP security headers
- Body parser: JSON with **50MB limit**
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

**Route structure:** 27 route files under `api/routes/v1/`, each mounting controllers with appropriate auth middleware.

## Security Invariants

1. **CORS MUST only allow explicit origins** — The whitelist is defined in `express.ts`. No wildcard (`*`) origins. No dynamic origin reflection (echoing back the `Origin` header).
2. **Rate limiting MUST be enforced on all endpoints** — 100 req/min per IP applies globally via `express-rate-limit`. No endpoint should bypass this.
3. **Body size MUST be bounded** — The JSON body parser has a limit. **⚠️ FINDING: The limit is 50MB (`"50mb"`), which is excessively large for a JSON API.** A typical API allows 1-10MB. 50MB enables memory exhaustion attacks.
4. **All user input MUST be validated before reaching controllers** — Validators run as middleware before the controller function. Missing validation on an endpoint means raw user input reaches business logic.
5. **Error responses MUST NOT leak internal details in production** — Stack traces are stripped when `NODE_ENV !== "development"`. Error messages should be generic. The `errors` array should contain only user-facing validation messages.
6. **404 responses MUST be returned for unmatched routes** — The 404 handler prevents Express from returning default HTML error pages that could reveal framework information.
7. **Helmet MUST be enabled** — Adds `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, and other security headers.
8. **Input validation MUST cover all mutable endpoints** — Every POST/PUT/PATCH/DELETE endpoint should have a validator middleware. GET endpoints with query parameters should also validate.
9. **No endpoint MUST accept and process fields not explicitly validated** — Hand-written validators check specific fields but don't reject unknown fields. Extra fields pass through to controllers, which could lead to mass assignment or unexpected behavior.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **⚠️ Memory exhaustion via large request body** — Attacker sends a 50MB JSON payload repeatedly to exhaust server memory | Rate limiting (100 req/min) provides some protection, but 100 requests × 50MB = 5GB of memory pressure per minute per IP. **The 50MB limit should be reduced to 1-10MB.** |
| **CORS bypass** — Attacker's site makes cross-origin requests to the API | Explicit origin whitelist prevents this. However, the whitelist includes `staging--pendulum-pay.netlify.app` — if the staging site is compromised or has XSS, it becomes a CORS-allowed origin in production. |
| **Rate limit bypass via IP rotation** — Attacker uses multiple IPs to exceed per-IP rate limits | No mitigation beyond the per-IP limit. No account-based rate limiting, no endpoint-specific limits, no progressive penalties. High-value endpoints (ramp creation, quote generation) get the same limit as read-only endpoints. |
| **Input validation bypass** — Validator doesn't check a field that the controller uses | Hand-written validators are prone to omissions. No schema library enforces completeness. New fields added to controllers may not get corresponding validators. |
| **Mass assignment** — Extra fields in the request body are passed to database operations | Validators check for expected fields but don't strip unknown fields. If a controller passes `req.body` directly to a database query (e.g., Sequelize `create(req.body)`), extra fields could set unintended columns. |
| **Error response information leak** — The `errors` array in error responses reveals internal validation logic or database field names | Error handler wraps errors in `APIError`. The `errors` array content depends on what validators put there. Validator messages reference field names from the API schema, not necessarily database internals, but should be audited. |
| **Staging CORS origin in production** — `staging--pendulum-pay.netlify.app` is in the CORS whitelist | If the staging site has an XSS vulnerability, an attacker could use it to make authenticated cross-origin requests to the production API. Staging origins should ideally be removed from production CORS config. |
| **No per-endpoint rate limiting** — Sensitive endpoints (ramp creation, admin operations) have the same rate limit as public read endpoints | An attacker can create 100 ramps per minute per IP. For endpoints that trigger expensive operations (XCM, SquidRouter), this could amplify costs. |
| **Cookie-based auth without CSRF protection** — Cookie parser is enabled for Supabase auth tokens | If auth tokens are stored in cookies (not just headers), cross-site requests from CORS-allowed origins could carry auth cookies automatically. Verify whether CSRF tokens or `SameSite` cookie attributes are used. |

## Audit Checklist

- [ ] **⚠️ FINDING**: `bodyParser.json({ limit: "50mb" })` — verify this limit is intentional. Recommend reducing to 1-10MB for a JSON API.
- [ ] **FINDING**: `staging--pendulum-pay.netlify.app` is in the production CORS whitelist — verify this is intentional and assess the risk of staging-site compromise
- [ ] **FINDING**: All validators are hand-written (no Zod/Joi) — verify every mutable endpoint has a corresponding validator middleware
- [ ] Verify CORS does not use wildcard (`*`) or dynamic origin reflection — check `express.ts` for `origin: true` or callback patterns
- [ ] Verify rate limiting cannot be bypassed by removing or spoofing `X-Forwarded-For` headers — check how `express-rate-limit` identifies clients
- [ ] Verify `Helmet` is configured with secure defaults — check for any disabled protections
- [ ] Verify `NODE_ENV` is set to `"production"` in production — stack traces are only stripped when not in development mode
- [ ] Verify error responses do not include internal error types, database error codes, or SQL fragments
- [ ] Verify the `errors` array in `APIError` contains only user-facing messages, not internal field names or database column names
- [ ] Map all 27 route files and verify each has appropriate auth middleware (Supabase, API key, admin, or public)
- [ ] Verify no route accidentally uses `publicKeyAuth` (public key only, no secret key) for operations that should require `apiKeyAuth` (secret key)
- [ ] Verify controllers do not pass raw `req.body` to database operations — check for Sequelize `.create(req.body)` or `.update(req.body)` patterns
- [ ] Verify no endpoint returns `process.env`, server config, or internal paths in responses
- [ ] Check whether Supabase auth cookies use `SameSite=Strict` or `SameSite=Lax` — and whether CSRF tokens are required for state-changing operations
- [ ] Verify the 404 handler does not reveal Express version or framework information
- [ ] Check all 27 route files for endpoints that accept file uploads — verify file size limits and type validation if present
