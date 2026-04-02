# Supabase OTP Authentication

## What This Does

Supabase OTP is the primary authentication mechanism for end-users (browser-based frontend). Users authenticate by entering their email address and receiving a one-time password (OTP). Supabase handles OTP generation, delivery, and verification — the Vortex API trusts Supabase-issued JWTs.

The flow:
1. Frontend calls Supabase directly to send OTP to user's email
2. User enters OTP in frontend
3. Supabase verifies OTP and issues a JWT access token
4. Frontend includes JWT in `Authorization: Bearer <token>` header on API requests
5. API middleware (`supabaseAuth.ts`) verifies the JWT via `SupabaseAuthService.verifyToken()` and attaches `userId` to the request

Two middleware variants exist:
- **`requireAuth`** — Returns 401 if token is missing or invalid. Used on protected endpoints.
- **`optionalAuth`** — Attaches `userId` if token is present and valid, but continues without auth if absent. Used on endpoints that behave differently for authenticated users.

## Security Invariants

1. **JWT verification MUST use Supabase's server-side verification** — The API MUST call `SupabaseAuthService.verifyToken()` which uses the `SUPABASE_SERVICE_KEY` (service role) to validate tokens. Client-side verification with the anon key is insufficient.
2. **Token extraction MUST require the `Bearer` prefix** — The middleware MUST reject tokens that don't start with `Bearer ` (note trailing space). Raw tokens in the header MUST be rejected.
3. **`userId` MUST only be set by auth middleware** — No controller or service may set `req.userId` directly. It MUST originate exclusively from the middleware's JWT verification result.
4. **`optionalAuth` MUST NOT fail the request on invalid tokens** — If a token is present but invalid/expired, `optionalAuth` logs a warning and continues with `userId` undefined. It MUST NOT return 401.
5. **`requireAuth` MUST fail closed** — Any error during token verification (network error to Supabase, malformed token, expired token) MUST result in a 401 response. Never proceed without valid auth.
6. **Auth errors MUST NOT leak token content** — Error responses must use generic messages ("Invalid or expired token"). Tokens must be truncated in logs (as implemented: first 15 + last 4 chars).
7. **Supabase configuration MUST be present** — If `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_KEY` are empty/missing, the auth system is non-functional. The service should fail to start rather than silently accept all tokens.
8. **JWT expiry MUST be enforced** — Supabase tokens have a configurable expiry. The verification MUST reject expired tokens, not just validate the signature.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Stolen JWT** | Attacker intercepts a user's JWT (XSS, network sniffing) and replays it | Short token expiry (Supabase default: 1 hour); TLS enforcement; HttpOnly cookies if applicable |
| **Supabase service key leak** | Attacker obtains `SUPABASE_SERVICE_KEY` and forges arbitrary JWTs | Key stored only in env vars; never exposed in responses or logs; rotation procedure in place |
| **Supabase outage** | Supabase is unreachable — verification calls fail | `requireAuth` fails closed (returns 401); no fallback to unverified access |
| **Email enumeration** | Attacker probes OTP endpoint to discover registered emails | OTP flow handled by Supabase — Vortex API never sees OTP requests; Supabase rate limits apply |
| **Token reuse after logout** | User "logs out" in frontend but JWT is still valid server-side | Supabase token invalidation on signout; short expiry window limits exposure |
| **userId injection** | Attacker sends crafted request with `userId` in body/headers to bypass auth | `req.userId` is set exclusively by middleware; controllers read from `req.userId` not from request body |

## Audit Checklist

- [ ] `requireAuth` is applied to all endpoints that mutate ramp state, access user data, or perform privileged operations
- [ ] `optionalAuth` is only used on endpoints where unauthenticated access is intentionally allowed (e.g., public quote lookup)
- [ ] `SupabaseAuthService.verifyToken()` uses the service role key, not the anon key
- [ ] The `Bearer ` prefix check uses `startsWith("Bearer ")` with the trailing space (not just `"Bearer"`)
- [ ] `req.userId` is never set by any code path other than the two auth middlewares
- [ ] Error responses from auth middleware contain no token fragments, user details, or internal error messages
- [ ] `optionalAuth` truncates tokens in warning logs (first 15 + last 4 characters)
- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_KEY` are validated at startup — empty strings are treated as missing
- [ ] Token expiry is enforced by the verification call (not just signature validity)
- [ ] No endpoint that should require auth is using `optionalAuth` as a shortcut
