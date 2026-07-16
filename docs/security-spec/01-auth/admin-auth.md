# Admin Authentication

## What This Does

Admin authentication protects internal/operational endpoints that can mutate system state or manage partners. It uses a single shared secret (`ADMIN_SECRET` env var) compared via Bearer token. Read-only access to client observability endpoints uses a separate `METRICS_DASHBOARD_SECRET` so a metrics token compromise does not grant broader admin access.

The flow:
1. Admin includes `Authorization: Bearer <ADMIN_SECRET>` header
2. `adminAuth` middleware extracts the token
3. Token is compared against `config.adminSecret` using constant-time comparison
4. If valid, request proceeds. If invalid, 403 is returned.

This is the simplest auth mechanism in the system — a single static secret with no user identity, session management, or key rotation built in.

## Security Invariants

1. **Token comparison MUST use constant-time comparison** — The `safeCompare()` function XORs character codes and accumulates the result, preventing timing attacks that could leak the secret byte-by-byte.
2. **Missing `ADMIN_SECRET` MUST block all admin requests** — If `config.adminSecret` is empty or unconfigured, the middleware MUST return 500 (`ADMIN_AUTH_NOT_CONFIGURED`), never silently allow access.
3. **The admin token MUST NOT be derivable from other credentials** — `ADMIN_SECRET` must be independent of Supabase keys, API keys, funding secrets, or any other credential in the system.
4. **Admin endpoints MUST be limited in scope** — Admin auth grants access to operational endpoints only. It MUST NOT grant the ability to initiate ramps, access user funds, or sign transactions.
5. **Error responses MUST distinguish between missing auth (401) and invalid auth (403)** — This is the current behavior: missing header → 401, invalid token → 403.
6. **The `Authorization` header MUST use the `Bearer` scheme** — Other schemes (Basic, etc.) must be rejected.
7. **Admin auth MUST NOT attach any identity to the request** — Unlike Supabase auth (which sets `userId`) or API key auth (which sets `authenticatedPartner`), admin auth is identity-less. No `req.adminUser` or similar should exist.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Timing attack on secret comparison** | Attacker sends varying tokens, measures response time to deduce correct secret | `safeCompare()` XORs all characters regardless of mismatch position; constant-time for equal-length strings |
| **Timing leak on length** | `safeCompare()` returns `false` immediately when lengths differ, leaking the secret length | **Known weakness in current implementation** — `safeCompare` short-circuits on length mismatch. Should use `crypto.timingSafeEqual` which pads or rejects without leaking length. |
| **ADMIN_SECRET in logs** | Secret accidentally logged via request logging middleware | Auth header should be excluded from request logging; verify no middleware logs full headers |
| **Shared secret rotation** | Need to rotate ADMIN_SECRET without downtime | Currently no dual-secret or graceful rotation — changing the env var immediately invalidates all admin sessions |
| **Brute force** | Attacker iterates possible ADMIN_SECRET values | Rate limiting on admin endpoints; sufficiently long secret (recommended: 64+ chars) |
| **Unauthorized admin endpoint discovery** | Attacker probes for admin routes | Admin routes should not be documented in public API docs; return 401 for unrecognized routes (not 404) |

## Audit Checklist

- [x] `adminAuth` middleware is applied to every admin-only endpoint — **PASS**
- [x] `safeCompare()` is the only comparison used for the admin secret — no `===` or `==` anywhere — **PASS**
- [x] **FINDING**: `safeCompare()` leaks secret length via early return on `a.length !== b.length` — verify this is acceptable or replace with `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` (which requires equal-length buffers but avoids the length-dependent branch) — **EXISTING F-010**
- [x] `config.adminSecret` is validated at startup — empty string defaults should be caught — **PARTIAL: Runtime check returns 500, but no startup validation**
- [x] No admin endpoint also accepts Supabase auth or API key auth as a fallback (admin is the only auth layer) — **PASS**
- [x] Admin endpoints are not reachable from the public frontend (verify CORS, route prefix separation) — **PASS (CORS allows all origins to all routes, but auth middleware protects)**
- [ ] `ADMIN_SECRET` is at least 32 characters in production — **N/A: Deployment config, not verifiable from code**
- [x] No logging middleware captures the full `Authorization` header for admin requests — **PASS**
- [x] Error response for invalid admin token does not include the expected token or any hint about the secret — **PASS**
- [x] Admin auth errors are logged server-side with request metadata (IP, path) for audit trail — **FAIL: Only exceptions logged, not intentional rejections (F-020)**
