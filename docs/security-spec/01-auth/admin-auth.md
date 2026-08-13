# Admin Authentication

## What This Does

This document is scoped to the shared-secret `/v1/admin/*` surface. A second, independent admin
surface exists at `/v1/admin-console/*`: it is Supabase-authenticated and gated by the
`vortex_admin` profile role rather than a shared secret, is identity-bearing by design, and
includes the ability for an operator to impersonate a customer profile. That surface is
documented separately in [`admin-impersonation.md`](admin-impersonation.md) — everything below
does not apply to it. The two surfaces are independent: an admin-console operator's Supabase
session does not grant `/v1/admin/*` access, and possession of `ADMIN_SECRET` does not by itself
grant `/v1/admin-console/*` access (Invariant 8).

Admin authentication protects internal/operational endpoints that can mutate system state,
manage partners, or configure managed-profile managers. It uses a single shared secret
(`ADMIN_SECRET` env var) compared via Bearer token. Read-only access to client
observability endpoints uses a separate `METRICS_DASHBOARD_SECRET` so a metrics token
compromise does not grant broader admin access.

The flow:
1. Admin includes `Authorization: Bearer <ADMIN_SECRET>` header
2. `adminAuth` middleware extracts the token
3. Token is compared against `config.adminSecret` using constant-time comparison
4. If valid, request proceeds. If invalid, 403 is returned.

This is the simplest auth mechanism in the system — a single static secret with no user identity, session management, or key rotation built in.

This identity-less design is an explicitly accepted risk for the current architecture
([risk register](../RISK-REGISTER.md), RISK-002).
It does not provide per-operator attribution, selective revocation, MFA, role separation,
or non-repudiation. Administrative changes remain attributable only to possession of
the shared credential; individual admin identities are out of scope for this change.

## Security Invariants

1. **Token comparison MUST use constant-time comparison** — The `safeCompare()` function XORs character codes and accumulates the result, preventing timing attacks that could leak the secret byte-by-byte.
2. **Missing `ADMIN_SECRET` MUST block all admin requests** — If `config.adminSecret` is empty or unconfigured, the middleware MUST return 500 (`ADMIN_AUTH_NOT_CONFIGURED`), never silently allow access.
3. **The admin token MUST NOT be derivable from other credentials** — `ADMIN_SECRET` must be independent of Supabase keys, API keys, funding secrets, or any other credential in the system.
4. **Admin endpoints MUST be limited in scope** — Admin auth grants access to operational endpoints only. It MUST NOT grant the ability to initiate ramps, access user funds, or sign transactions.
5. **Error responses MUST distinguish between missing auth (401) and invalid auth (403)** — This is the current behavior: missing header → 401, invalid token → 403.
6. **The `Authorization` header MUST use the `Bearer` scheme** — Other schemes (Basic, etc.) must be rejected.
7. **Admin auth on `/v1/admin/*` MUST NOT attach any identity to the request** — Unlike Supabase auth (which sets `userId`) or API key auth (which sets `authenticatedPartner`), admin auth on this surface is identity-less. No `req.adminUser` or similar should exist. This invariant is scoped to `/v1/admin/*`: the separate `/v1/admin-console/*` surface is intentionally identity-bearing — it authenticates via Supabase and carries the operator's profile ID — by design; see [`admin-impersonation.md`](admin-impersonation.md).
8. **`vortex_admin` MUST NOT be grantable through `POST /v1/admin/profile-roles`** — that
   route is guarded only by `ADMIN_SECRET`, and `vortex_admin` grants access to
   `/v1/admin-console/*` including FULL-depth customer impersonation
   ([`admin-impersonation.md`](admin-impersonation.md)). If the shared secret could grant that
   role, it would be sufficient by itself to gain money-movement rights over any customer,
   collapsing the separation this document's "What This Does" section describes. Granting
   `vortex_admin` must go through an out-of-band operator process outside this route.
   **Enforced**: `profileRole.model.ts` exports
   `HTTP_GRANTABLE_PROFILE_ROLES = ["discount_manager"]`; `addProfileRole`
   (`profileRoles.controller.ts`) returns `403 ROLE_NOT_HTTP_GRANTABLE` for `vortex_admin`
   (verified in `profileRoles.controller.test.ts`). `removeProfileRole` deliberately remains
   exempt as a safety valve; removing `vortex_admin` atomically revokes every live
   impersonation session owned by that profile. The sanctioned grant path is
   `apps/api/scripts/grant-vortex-admin.ts`, run as `bun run grant:vortex-admin <email>`.
9. **Only admin auth may configure managed-profile managers** — `PUT /v1/admin/managed-profile-managers/:profileId` creates or replaces activation and a non-empty set of supported corridors for an existing authenticated profile. It may also set `allowedCustomerTypes` to a non-empty, duplicate-free subset of `individual` and `business`; missing or null leaves customer types unrestricted beyond the canonical corridor capability matrix. `GET` reads that configuration. Deactivation uses `isActive = false`; configuration is retained rather than physically deleted.
10. **Admin headless provisioning MUST remain separate from legacy managed-user provisioning** — `POST /v1/admin/managed-profile-managers/:profileId/managed-profiles` requires admin auth and invokes the shared null-login-email provisioning service with `creation_source = vortex`. It requires an immutable provider `contactEmail` separate from the child's login identity, and the manager path parameter must identify an active configured manager. This route MUST NOT reuse or alter legacy `POST /v1/admin/managed-profiles`, which provisions an email-backed Supabase identity.
11. **Managed children MUST NOT become managers** — Manager configuration rejects `profiles.kind = managed`, preserving the direct, non-nested management model.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Timing attack on secret comparison** | Attacker sends varying tokens, measures response time to deduce correct secret | `safeCompare()` XORs all characters regardless of mismatch position; constant-time for equal-length strings |
| **Timing leak on length mismatch** | A naive comparison returns immediately when lengths differ | `safeCompare` performs a dummy `timingSafeEqual` operation before rejecting a different-length token; equal-length values use `crypto.timingSafeEqual`. |
| **ADMIN_SECRET in logs** | Secret accidentally logged via request logging middleware | Auth header should be excluded from request logging; verify no middleware logs full headers |
| **Shared secret rotation** | Need to rotate ADMIN_SECRET without downtime | Currently no dual-secret or graceful rotation — changing the env var immediately invalidates all admin sessions |
| **ADMIN_SECRET escalates to customer impersonation** | Holder of `ADMIN_SECRET` calls `POST /v1/admin/profile-roles` to grant themselves (or a colluding profile) `vortex_admin`, then impersonates any customer via `/v1/admin-console/*` | `vortex_admin` excluded from `HTTP_GRANTABLE_PROFILE_ROLES`; the route returns `403 ROLE_NOT_HTTP_GRANTABLE` for it (Invariant 8). The only grant path is `scripts/grant-vortex-admin.ts`, which requires deployment/database access. |
| **No individual administrative principal** | A privileged change cannot be attributed to, selectively revoked from, or constrained to one operator | **ACCEPTED RISK.** Retain the shared `ADMIN_SECRET` model for now; protect and rotate it operationally. Individual identities and role separation require a later architectural change. |
| **Brute force** | Attacker iterates possible ADMIN_SECRET values | Rate limiting on admin endpoints; sufficiently long secret (recommended: 64+ chars) |
| **Unauthorized admin endpoint discovery** | Attacker probes for admin routes | Admin routes should not be documented in public API docs; return 401 for unrecognized routes (not 404) |

## Audit Checklist

- [x] `adminAuth` middleware is applied to every admin-only endpoint — **PASS**
- [x] `safeCompare()` is the only comparison used for the admin secret — no `===` or `==` anywhere — **PASS**
- [x] `safeCompare()` uses `crypto.timingSafeEqual` for equal-length values and performs a dummy constant-time comparison before rejecting a different length. **PASS**
- [x] `config.adminSecret` is validated at production startup, and the middleware also fails closed at runtime if absent. **PASS**
- [x] No `/v1/admin/*` endpoint also accepts Supabase auth or API key auth as a fallback (`adminAuth` is the only auth layer on this surface) — **PASS**. (`/v1/admin-console/*` is a separate, intentionally Supabase-authenticated surface by design — see [`admin-impersonation.md`](admin-impersonation.md) — and is out of scope for this check.)
- [x] Admin endpoints are not reachable from the public frontend (verify CORS, route prefix separation) — **PASS (CORS allows all origins to all routes, but auth middleware protects)**
- [ ] `ADMIN_SECRET` is at least 32 characters in production — **N/A: Deployment config, not verifiable from code**
- [x] No logging middleware captures the full `Authorization` header for admin requests — **PASS**
- [x] Error response for invalid admin token does not include the expected token or any hint about the secret — **PASS**
- [x] Missing and invalid admin-auth attempts are logged with request IP/path; secret values are not logged. **PASS**
- [x] `vortex_admin` cannot be granted via `POST /v1/admin/profile-roles` — **PASS**: `addProfileRole` returns `403 ROLE_NOT_HTTP_GRANTABLE` for `vortex_admin` (`profileRoles.controller.test.ts`); the sanctioned grant path is `scripts/grant-vortex-admin.ts`. See Invariant 8.
- [x] Managed-profile manager configuration routes require `adminAuth`, validate non-empty duplicate-free corridor and optional customer-type sets, and retain deactivated configurations. **PASS**
- [x] Admin headless provisioning requires `adminAuth`, targets an active configured manager, and remains distinct from legacy email-backed provisioning. **PASS**
