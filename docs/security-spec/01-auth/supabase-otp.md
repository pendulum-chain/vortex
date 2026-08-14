# Supabase OTP Authentication

## What This Does

Supabase OTP is the primary authentication mechanism for end-users (browser-based frontend). Users authenticate by entering their email address and receiving a one-time password (OTP). Supabase handles OTP generation, delivery, and verification — the Vortex API trusts Supabase-issued JWTs.

The flow:
1. Frontend calls Supabase directly to send OTP to user's email
2. User enters OTP in frontend
3. Supabase verifies OTP and issues a JWT access token
4. Frontend includes JWT in `Authorization: Bearer <token>` header on API requests
5. API middleware (`supabaseAuth.ts`) verifies the JWT via `SupabaseAuthService.verifyToken()` and attaches `userId` to the request
6. Access tokens are short-lived. The widget and dashboard verify stored access tokens on startup and fall back to `POST /v1/auth/refresh` when verification fails. They also refresh through that endpoint just before expiry and after a `401` (single-flight refresh + one retry). The frontend never calls Supabase `refreshSession` directly with the anon key. The endpoint returns `401` **only** when the refresh token is confirmed invalid/revoked; transient upstream failures (Supabase unreachable / 5xx) return `503` so the frontend keeps the session and retries.

Two middleware variants exist:
- **`requireAuth`** — Returns 401 if token is missing or invalid. Used on protected endpoints.
- **`optionalAuth`** — Attaches `userId` if a token is present and valid, continues anonymously only when the header is absent, returns `401` for a present invalid credential, and returns `503` when verification is indeterminate.

## Security Invariants

1. **JWT verification MUST use authoritative Supabase Auth validation** — The API MUST call `SupabaseAuthService.verifyToken()` over a server-controlled channel. The configured Supabase project URL and anon key identify the trusted Auth project; the presented bearer token is authoritatively introspected by Supabase Auth. Service-role credentials are required only for operations that need service-role privileges and MUST NOT be a prerequisite merely to verify an access token.
2. **Token extraction MUST require the `Bearer` prefix** — The middleware MUST reject tokens that don't start with `Bearer ` (note trailing space). Raw tokens in the header MUST be rejected.
3. **`userId` MUST only be set by auth middleware** — No controller or service may set `req.userId` directly. It MUST originate exclusively from the middleware's JWT verification result.
4. **Optional authentication MUST NOT downgrade a presented credential** — No authorization header on an anonymous-eligible route continues anonymously. A present malformed, invalid, expired, or revoked credential returns `401`; it MUST NOT be converted into an anonymous request.
5. **Verification outcomes MUST remain distinct** — Missing credentials on protected routes and definitively invalid credentials return `401`; a valid identity without authority returns `403`; a provider/network failure that makes verification indeterminate returns `503`. Neither middleware may proceed anonymously after an indeterminate result.
6. **Auth errors MUST NOT leak token content** — Error responses use generic messages. Logs contain request ID, path, and an error category/message, but no full or truncated bearer-token fragment.
7. **Supabase configuration MUST be present** — If `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_KEY` are empty/missing, the auth system is non-functional. The service should fail to start rather than silently accept all tokens.
8. **JWT expiry MUST be enforced** — Supabase tokens have a configurable expiry. The verification MUST reject expired tokens, not just validate the signature.
9. **The sandbox demo restore MUST NOT alter authentication outcomes** — `verifyOTP` calls `restoreDemoAccountOnLogin(email)` after Supabase has already verified the OTP and the profile has been resolved. The hook returns immediately unless `DEPLOYMENT_ENV=sandbox` **and** the verified email equals `DEMO_ACCOUNT_EMAIL` (compared trimmed and lowercased), it never creates or elevates an identity — the profile must already exist, because `profiles.id` is the Supabase Auth UUID and cannot be forged — and every error it raises is caught and logged rather than propagated, so it can neither grant nor deny a login. See `docs/adr-0003-sandbox-demo-environment.md`.
10. **Session teardown MUST happen only on confirmed-invalid refresh** — The frontend clears the stored session (and forces re-login) only when `/v1/auth/refresh` returns `401` (refresh token invalid/revoked). Transient failures (network errors, 5xx, timeouts) MUST NOT clear the session; they are retried while the existing session is preserved. The backend enforces this contract: `/v1/auth/refresh` returns `401` only for a definite invalid-token error from Supabase and returns `503` for transient/transport failures (and any unexpected error), so a Supabase outage cannot masquerade as an invalid token and log users out.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Stolen JWT** | Attacker intercepts a user's JWT (XSS, network sniffing) and replays it | Configured token expiry (1 week); TLS enforcement; HttpOnly cookies if applicable |
| **Supabase service key leak** | Attacker obtains `SUPABASE_SERVICE_KEY` and gains broad administrative privileges | Access-token verification uses the least-privileged Auth client; service-role use is limited to administrative operations. The key remains server-only and independently rotatable. |
| **Supabase outage** | Supabase is unreachable — verification calls fail | Both middleware variants fail closed with `503`; no fallback to anonymous or unverified access and no false invalid-token signal. |
| **Email enumeration** | Attacker probes OTP endpoint to discover registered emails | OTP flow handled by Supabase — Vortex API never sees OTP requests; Supabase rate limits apply |
| **Token reuse after logout** | User "logs out" in frontend but JWT is still valid server-side | Supabase token invalidation on signout; short expiry window limits exposure |
| **userId injection** | Attacker sends crafted request with `userId` in body/headers to bypass auth | `req.userId` is set exclusively by middleware; controllers read from `req.userId` not from request body |
| **Demo restore reached in production** | An operator sets `DEMO_ACCOUNT_EMAIL` to a real user on a non-sandbox deployment, hoping the login hook rewrites that account's state | `restoreDemoAccountOnLogin` returns before any database access unless `DEPLOYMENT_ENV=sandbox`, and `restoreDemoAccount` itself throws on the same condition. Both guards are covered by tests. |

## Audit Checklist

- [x] `requireAuth` is applied to all endpoints that mutate ramp state, access user data, or perform privileged operations — **PASS: F-013 resolved. `/v1/ramp/*` endpoints now use `requirePartnerOrUserAuth()` (sk_ partner key OR Supabase Bearer) with ownership guards; `/v1/brla/*` uses `requireAuth`; `/v1/mykobo/profiles` (GET + POST) uses `requireAuth` (F-068 resolved); admin and webhook routes use `adminAuth`/`apiKeyAuth`.**
- [x] `optionalAuth` is only used on endpoints where unauthenticated access is intentionally allowed (e.g., public quote lookup) — **PASS**
- [x] `SupabaseAuthService.verifyToken()` uses authoritative Supabase Auth validation without requiring service-role privilege — **PASS**
- [x] The `Bearer ` prefix check uses `startsWith("Bearer ")` with the trailing space (not just `"Bearer"`) — **PASS**
- [x] `req.userId` is never set by any code path other than the two auth middlewares — **PASS**
- [x] Error responses from auth middleware contain no token fragments, user details, or internal error messages — **PASS**
- [x] Authentication logs contain no bearer-token fragments — **PASS**
- [x] A present invalid optional credential returns `401`, while an indeterminate provider failure returns `503` without anonymous fallback — **PASS**
- [x] `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_KEY` are validated at production startup — empty strings are treated as missing. **PASS**
- [x] Token expiry is enforced by the verification call (not just signature validity) — **PASS**
- [x] Frontend refresh goes through `/v1/auth/refresh` (not the anon-key client) and clears the session only on a `401`, retrying transient failures — **PASS**
- [x] `/v1/auth/refresh` returns `401` only for a confirmed-invalid refresh token and `503` for transient/unexpected failures (so an outage cannot force logout) — **PASS**
- [x] Optional auth is limited to anonymous quote discovery and non-mutating BRLA preflight endpoints; protected KYC/resource mutations require authentication, and an indeterminate presented credential never falls back to anonymous. **PASS**
- [x] The demo restore hook in `verifyOTP` runs after verification, is gated on `DEPLOYMENT_ENV=sandbox` plus an exact demo-email match, and cannot change the login result — **PASS** (`demo-account.integration.test.ts`).
