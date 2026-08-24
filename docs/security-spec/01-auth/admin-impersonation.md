# Admin Impersonation

## What This Does

`vortex_admin` operators can act as a customer's profile through the `/v1/admin-console/*`
surface — the per-operator, Supabase-identity-bearing counterpart to the shared-secret
`/v1/admin/*` surface documented in [`admin-auth.md`](admin-auth.md). Authenticated profiles
are direct session targets. Managed headless profiles are reached by impersonating their
authenticated manager and composing that session with the existing managed-profile selector.

Depth is broad but excludes ramp money movement. While impersonating, the operator may create
quotes and inspect ramp status, history, and errors, but `POST /v1/ramp/register`, `POST
/v1/ramp/update`, and `POST /v1/ramp/start` reject the request. Other customer-account mutations
remain available, so this is not a general read-only impersonation mode (see the risk register,
RISK-018).

### Routes

All routes live under `/v1/admin-console/*` (`accounts.route.ts`, `impersonation.route.ts`).

| Route | Guard | Success | Notable errors |
|---|---|---|---|
| `GET /accounts?search=&cursor=&limit=` | `requireVortexAdmin` | `200` — paginated account list; search matches login email, managed contact/external ID, or controlling-manager email; managed rows include child contact identity and controlling-manager identity | — |
| `GET /accounts/:profileId` | `requireVortexAdmin` | `200` — profile kind, managed relationship when present, entities, provider customers, KYC cases, and recent direct impersonation sessions targeting this profile | `400 INVALID_PROFILE_ID`; `404 USER_NOT_FOUND` |
| `POST /impersonation` `{ targetProfileId }` | `requireVortexAdmin` | `201 { token, sessionId, expiresAt, target: { id, email } }` | `400 INVALID_IMPERSONATION_INPUT` (malformed `targetProfileId`); `400 IMPERSONATION_TARGET_INVALID` (self-target, unknown target — from `ImpersonationTargetError`); `403 VORTEX_ADMIN_REQUIRED` if the role is removed during creation; `503 IMPERSONATION_DISABLED` (kill switch off — the caller is authorized, the capability is off, so this is a capability error, not an auth error) |
| `GET /impersonation?limit=` | `requireVortexAdmin` | `200 { sessions: [...] }` — active-first audit view; a non-positive or malformed limit falls back to the default | — |
| `DELETE /impersonation/:sessionId` | see Invariant 12 | `204` | `400 INVALID_IMPERSONATION_SESSION_ID`; `403 IMPERSONATION_NOT_ALLOWED`; `403 VORTEX_ADMIN_REQUIRED`; `404 IMPERSONATION_SESSION_NOT_FOUND` |

`requireVortexAdmin` (`vortexAdminAuth.ts`) is the chain `requireAuth → rejectImpersonation →
checkVortexAdminRole`: Supabase auth, then no impersonation chaining, then the `vortex_admin`
capability role (`ProfileRole` with `role = "vortex_admin"`). The authenticated operator remains
in `req.userId` for downstream controllers. `GET /accounts` pagination is offset-based:
`nextCursor` is the next numeric offset serialized as a string; clients should treat it as
opaque rather than compute their own.

`DELETE /impersonation/:sessionId` is deliberately **not** behind `requireVortexAdmin` — see
Invariant 12 for the exact self-revoke mechanism this enables.

### Session lifecycle

1. `POST /v1/admin-console/impersonation` with `{ targetProfileId }` mints a session
   (`impersonation.service.ts::createSession`) and returns `{ token, sessionId, expiresAt,
   target }`. The token is `vtx_imp_` followed by 32 random bytes (256 bits), base64url-encoded.
   Only its SHA-256 hash is persisted to `admin_impersonation_sessions`; the raw value is
   returned exactly once and never stored server-side.
2. The operator presents the token as an ordinary `Authorization: Bearer` header on subsequent
   requests. `resolveBearerPrincipal()` (`bearerPrincipal.ts`) is the single seam that resolves
   any bearer token to a principal: it routes on the `vtx_imp_` prefix before doing any
   database work, so ordinary Supabase tokens are unaffected in cost or behavior.
3. For a live impersonation token, `resolveSession()` looks the token up by hash, checks it is
   unexpired and unrevoked, and re-checks that the actor still holds `vortex_admin` before it
   returns an `ImpersonationContext`. `resolveBearerPrincipal()`
   then sets `userId` to the **target's** profile ID and `userEmail` to the **target's** email —
   not the operator's. `bearerPrincipal.ts` is the only substitution point: `getEffectiveUserId()`
   (`req.userId ?? req.credential?.profileId`), ownership middleware, and every controller
   downstream run unmodified against the target. See
   [`architecture-identity-model.md`](../../architecture-identity-model.md) for how this seam fits
   the rest of principal resolution.
4. `req.impersonation` (`{ sessionId, actorProfileId, targetProfileId, targetEmail, expiresAt }`)
   carries the operator's identity alongside the substituted principal, for audit and for
   `rejectImpersonation` to gate on.
5. `GET /v1/admin-console/impersonation` lists sessions for audit (active first, then recent);
   `DELETE /v1/admin-console/impersonation/:sessionId` revokes one immediately.

For a managed child, the dashboard starts the session against the authenticated manager returned
by the account lookup, then stores the child profile ID as the managed-profile selection. The
impersonation audit target remains the manager. Delegated requests carry `X-Managed-Profile-Id`
and continue through the normal active-manager, direct-relationship, entity, customer-type, and
corridor authorization checks. No impersonation token directly targets a headless profile.

Both `requireAuth`/`optionalAuth` (`supabaseAuth.ts`) and the dual-auth handlers
(`dualAuth.ts`) call `resolveBearerPrincipal()`, so an impersonation token is honored on any
route reachable by a Supabase bearer token — not only a dedicated impersonation-only path. The
`X-API-Key` credential path is a distinct credential type and is not affected.

### Granting `vortex_admin`

`vortex_admin` is not grantable through `POST /v1/admin/profile-roles` — that route is guarded
only by the shared `ADMIN_SECRET`, and holding `vortex_admin` is sufficient to impersonate any
customer with broad read and mutation rights, so that secret must never be sufficient by itself
to grant it.
`HTTP_GRANTABLE_PROFILE_ROLES` (`profileRole.model.ts`) lists only `discount_manager`;
`addProfileRole` returns `403 ROLE_NOT_HTTP_GRANTABLE` for anything else. `removeProfileRole`
deliberately still revokes any role, including `vortex_admin`, as a safety valve; removing that
role atomically revokes every non-revoked session minted by the operator. Token resolution also
checks the role on every use, so an out-of-band role deletion invalidates outstanding tokens.
The sanctioned grant path is out-of-band: `apps/api/scripts/grant-vortex-admin.ts`, run as
`bun run grant:vortex-admin <email>` from `apps/api`. It is idempotent (`ProfileRole.findOrCreate`)
and requires deployment/database access rather than an HTTP credential — see
[`admin-auth.md`](admin-auth.md) Invariant 8.

## Security Invariants

1. **Impersonation tokens MUST be routed by prefix before any credential lookup** —
   `isImpersonationToken()` checks the `vtx_imp_` prefix; a non-matching token never triggers an
   `admin_impersonation_sessions` query (verified: `resolveSession` short-circuits and
   `AdminImpersonationSession.findOne` is not called for non-prefixed input).
2. **Only the token's SHA-256 hash MUST be persisted** — `tokenHash` is a unique-indexed
   `CHAR(64)` column; the raw token exists only in the `createSession()` return value at mint
   time. A leaked database row cannot be replayed.
3. **Session creation MUST require the kill switch on, a current admin actor, and a real,
   distinct target** — `createSession()` throws `ImpersonationDisabledError` when
   `config.impersonationEnabled` is false, re-checks the actor's `vortex_admin` role inside the
   creation transaction, and throws `ImpersonationTargetError` for a non-existent target profile or
   `actorProfileId === targetProfileId`. The actor-≠-target check is additionally enforced by a
   database `CHECK` constraint (`chk_admin_impersonation_sessions_distinct`), independent of the
   application layer. Sessions carry no operator-supplied justification: attribution rests on the
   actor identity and timestamps recorded on the session row and stamped onto every event raised
   during the request (Invariant 13).
4. **Sessions MUST be short-lived and non-renewable** — `IMPERSONATION_TTL_MS` is 30 minutes,
   fixed at creation (`expiresAt = now + 30m`). No code path extends `expiresAt`; continuing past
   it requires a fresh `POST /v1/admin-console/impersonation` call, itself separately audited.
5. **Token resolution MUST re-check liveness and actor authorization on every use, not cache a
   prior verdict** — `resolveSession()` re-reads `revokedAt` and `expiresAt` and verifies that the
   actor still holds `vortex_admin` on each call. It returns `null` for anything not currently
   live (unknown, expired, revoked, role removed, or minted while the kill switch was on but
   resolved after it was flipped off).
6. **The kill switch MUST invalidate in-flight sessions, not just block new ones** — `resolveSession()`
   returns `null` whenever `config.impersonationEnabled` is false, regardless of a session's own
   `revokedAt`/`expiresAt`. Setting `IMPERSONATION_ENABLED=false` makes every outstanding token
   stop resolving immediately, with no per-row revocation pass required.
7. **Starting a new session for the same (actor, target) MUST supersede the prior one** —
   `createSession()` revokes any existing non-revoked session for that exact `(actorProfileId,
   targetProfileId)` pair with `revokedReason: "superseded"` before minting the new token. This
   is serialized by a row lock on the actor profile and backed by the partial unique index
   `uq_admin_impersonation_sessions_active`, so concurrent starts cannot leave two non-revoked
   sessions for the same pair.
8. **Revocation MUST be immediate and idempotent** — `revokeSession()` performs one
   `UPDATE ... WHERE id = :id AND revoked_at IS NULL`, returning whether it revoked anything; a
   second revoke of the same session is a no-op that preserves the original `revokedAt` and
   `revokedReason`. Removing `vortex_admin` shares the actor-profile row lock with session
   creation and revokes all of that actor's outstanding sessions in the same transaction.
9. **The substituted principal MUST be the target on every field a controller can observe** —
   `resolveBearerPrincipal()` sets both `userId` and `userEmail` to the target's values. This
   matters concretely: controllers that key provider enrollment (Mykobo/Alfredpay/Monerium) off
   `req.userEmail` must observe the target's email, never the operator's.
10. **`req.impersonation` MUST be set only by `resolveBearerPrincipal()`**, mirroring the
    single-writer invariant Supabase auth already holds for `req.userId`
    ([`supabase-otp.md`](supabase-otp.md) invariant 3) — no controller or service sets it
    directly.
11. **An impersonated request MUST NOT be able to mint durable credentials** —
    `rejectImpersonation` is applied ahead of `/v1/api-credentials` (`api-credentials.route.ts`):
    a credential minted while acting as someone else would outlive the 30-minute session and
    become a standing backdoor into the target's account.
12. **An impersonated request MUST NOT be able to reach the admin console, except to end its own
    session** — There is exactly one carve-out, and it is narrow by construction:
    `DELETE /v1/admin-console/impersonation/:sessionId` is mounted behind `requireAuth` only, not
    the shared `requireVortexAdmin` chain every other admin-console route uses. Inside
    `deleteImpersonationSession`, a request is treated as ending its own session only when
    `req.impersonation.sessionId === req.params.sessionId` — i.e., the `:sessionId` path
    parameter names exactly the session the caller's own bearer token resolved to. That case
    skips both the `rejectImpersonation` check and the `vortex_admin` role check and proceeds
    straight to revocation. Any other impersonated request to that same route — a different
    `sessionId`, including a different session belonging to the same operator — is rejected with
    `403 IMPERSONATION_NOT_ALLOWED` before any role check runs. Every other route (`GET
    /accounts`, `GET /accounts/:profileId`, `POST /impersonation`, `GET /impersonation`) sits
    behind `requireVortexAdmin` = [`requireAuth`, `rejectImpersonation`, role check], so an
    impersonated caller is refused at the `rejectImpersonation` step, before role or business
    logic runs at all. **Verified**: `admin-console.route.test.ts` — an impersonated caller can
    end its own session (`204`), is refused ending a different session (`403
    IMPERSONATION_NOT_ALLOWED`), and is refused `GET /accounts` and `POST /impersonation`
    (`403`).
13. **Every `api_client_events` row raised during an impersonated request MUST carry both
    identities** — `buildApiClientRequestMetadata()` stamps `metadata.impersonationSessionId` and
    `metadata.impersonatorProfileId` whenever `req.impersonation` is set, while the event's own
    `userId` field is the effective (target) user. An action is therefore always attributable to
    the operator even though it is recorded against the target's account.
14. **`vortex_admin` MUST NOT be grantable through the `ADMIN_SECRET`-guarded
    `POST /v1/admin/profile-roles` route** — that shared secret must not, by itself, be sufficient
    to gain broad read and mutation rights over any customer; granting
    `vortex_admin` requires an out-of-band operator process outside the shared-secret surface.
    **Enforced**: `HTTP_GRANTABLE_PROFILE_ROLES = ["discount_manager"]` in `profileRole.model.ts`;
    `addProfileRole` checks membership and returns `403 ROLE_NOT_HTTP_GRANTABLE` for `vortex_admin`
    (verified in `profileRoles.controller.test.ts`, "rejects granting vortex_admin via HTTP but
    still allows discount_manager"). `removeProfileRole` is intentionally exempt from this list —
    revocation of any role, including `vortex_admin`, remains available via that route as a safety
    valve (verified: "still allows revoking vortex_admin even though it cannot be granted via
    HTTP"). See [`admin-auth.md`](admin-auth.md) Invariant 8.
15. **Session audit history MUST NOT disappear when an actor or target profile is deleted** —
    both profile foreign keys in migration 068 use `ON DELETE RESTRICT`. Operators must resolve
    retention/deletion policy explicitly instead of erasing security history through a profile
    cascade.
16. **An impersonated request MUST NOT register, update, or start a ramp** — the three mutating
    ramp routes apply `rejectImpersonation` after optional or required bearer authentication and
    before managed-profile authorization or controller execution. During active maintenance, the
    existing maintenance guard returns `503` before authentication; it still prevents controller
    execution and mutation. Quote creation and ramp GET routes deliberately omit the impersonation
    guard, so support operators can discover rates and inspect target-owned ramps without
    initiating or advancing money movement.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| Database dump exposes usable tokens | Attacker reads `admin_impersonation_sessions` from a backup or replica | Only a SHA-256 hash is stored; the raw token is never persisted (Invariant 2) |
| Stolen or leaked impersonation token replayed after the operator's intent has ended | Token captured via logs, browser history, or a compromised operator device | 30-minute non-renewable TTL (Invariant 4); instant hash-based revocation via `DELETE /impersonation/:sessionId` (Invariant 8); re-checked liveness on every use (Invariant 5) |
| Impersonation used to mint a permanent backdoor | Operator (or an attacker who obtained an operator's token) mints an API secret key while impersonating, which outlives the session | `rejectImpersonation` on `/v1/api-credentials` (Invariant 11) |
| Privilege re-escalation / impersonation chaining | An impersonated request is used to start a second impersonation session, list sessions, or browse accounts | `requireVortexAdmin`'s `rejectImpersonation` step refuses `GET /accounts`, `GET /accounts/:profileId`, `POST /impersonation`, and `GET /impersonation` outright (Invariant 12) |
| Impersonated caller abuses the self-revoke carve-out to end someone else's session | Operator impersonating profile A presents that token against profile B's `sessionId` | Rejected with `403 IMPERSONATION_NOT_ALLOWED`: the carve-out only matches when the path `:sessionId` equals the caller's own `req.impersonation.sessionId` (Invariant 12) |
| Impersonation initiates or advances money movement | Operator calls ramp register, update, or start while acting as a customer | All three mutating ramp routes apply `rejectImpersonation` after principal resolution and before controller execution (Invariant 16); quote creation and ramp inspection remain available |
| Self-impersonation used to launder attribution | Operator targets their own profile to blur operator/target identity | Rejected at both the application layer and a database `CHECK` constraint (Invariant 3) |
| Stale sessions surviving an incident response kill switch | Operator response to a suspected compromise is "disable impersonation", but existing tokens keep working | `IMPERSONATION_ENABLED=false` invalidates all live sessions on next resolution, not just new mints (Invariant 6) |
| Removed operator role leaves previously minted tokens usable | An operator is deprovisioned while one or more impersonation sessions remain live | Role removal atomically revokes all non-revoked sessions, and token resolution independently re-checks `vortex_admin` on every use (Invariants 5 and 8) |
| Token brute force / guessing | Attacker attempts to guess a valid `vtx_imp_*` value | 256 bits of randomness in the token; lookup requires an exact SHA-256 hash match |
| Shared-secret surface used to self-grant impersonation rights | An operator (or anyone) with `ADMIN_SECRET` calls `POST /v1/admin/profile-roles` to grant themselves `vortex_admin`, turning a shared secret into broad customer-account access | `vortex_admin` excluded from `HTTP_GRANTABLE_PROFILE_ROLES` (Invariant 14); the only grant path is `scripts/grant-vortex-admin.ts`, which requires deployment/database access, not an HTTP credential |
| Concurrent session creation races the supersession check | Two near-simultaneous `POST /impersonation` calls for the same (actor, target) both attempt to supersede and mint | Actor-row transaction locking serializes creation; the partial unique index rejects any second non-revoked row if locking regresses (Invariant 7) |
| Profile deletion erases the impersonation audit trail | Deleting a target or operator cascades into session history | Both foreign keys use `ON DELETE RESTRICT`, preserving the audit record until retention is handled explicitly (Invariant 15) |

## Gaps Identified During This Review

- Ramp money movement is denied, but impersonation is still broader than a read-only support
  mode: provider onboarding, KYC/KYB, recipient, active-entity, and notification mutations remain
  available. A compromised operator account can therefore still make sensitive changes to a
  customer's account. Tracked as an accepted risk in the risk register (RISK-018).
- The operator-facing frontend that consumes `/v1/admin-console/*` lives in `apps/dashboard`
  (account search UI, and a non-dismissible banner naming the impersonated account while a
  session is active). Its behavior is tracked in
  [`docs/product-dashboard.md`](../../product-dashboard.md), not here — this document only covers
  the API surface. The dashboard additionally hides the Admin nav entry while a session is
  active; that is presentation only, and carries no security weight — `rejectImpersonation`
  (Invariant 12) is the enforcement boundary and refuses those routes regardless of what the
  client renders.
- Client-reported session state is not authoritative. The dashboard stores the complete session
  as one atomic record, subscribes to cross-tab changes, and clears account-scoped caches on
  every identity transition. Its "Exit" clears the banner immediately even when the best-effort
  `DELETE /impersonation/:sessionId` fails, deliberately, so a failed network call
  cannot strand an operator in a customer's account. A session may therefore appear closed to the
  operator while the row stays live until its TTL expires. `GET /impersonation` is the
  authoritative view; the bounded exposure is the same 30-minute TTL as Invariant 4.

## Audit Checklist

- [x] `isImpersonationToken()` prefix routing precedes any database lookup — **PASS**
      (`impersonation.service.test.ts`: "returns null for a non-`vtx_imp_` string without hitting
      the database").
- [x] Only `tokenHash` (SHA-256) is persisted; the raw token is returned once and not stored —
      **PASS**.
- [x] `createSession()` enforces the kill switch, a current `vortex_admin` actor, distinct
      actor/target, and an existing target profile — **PASS**.
- [x] A database `CHECK` constraint independently enforces actor ≠ target —
      **PASS**.
- [x] Session TTL is fixed at 30 minutes with no renewal path — **PASS**.
- [x] `resolveSession()` rejects unknown, expired, revoked, and deauthorized-actor tokens, and
      rejects all tokens the instant `IMPERSONATION_ENABLED` is false, independent of each
      session's own state — **PASS**.
- [x] Creating a new session for an existing (actor, target) pair revokes the prior one as
      `superseded`; concurrent starts leave exactly one live row, enforced by an actor-row lock and
      partial unique index — **PASS** (`impersonation.service.test.ts`).
- [x] `revokeSession()` is a single scoped, idempotent update — **PASS**.
- [x] `resolveBearerPrincipal()` sets `userId`/`userEmail` to the target's values for a resolved
      impersonation token, and leaves them and `impersonation` untouched for an ordinary Supabase
      token — **PASS**.
- [x] `req.impersonation` is set only within `resolveBearerPrincipal()`, consumed by
      `supabaseAuth.ts` and `dualAuth.ts` — **PASS**.
- [x] `rejectImpersonation` blocks `/v1/api-credentials` (credential minting) — **PASS**.
- [x] `rejectImpersonation` blocks `POST /v1/ramp/register`, `POST /v1/ramp/update`, and `POST
      /v1/ramp/start`, while quote creation reaches normal validation and ramp history remains
      readable — **PASS** (`ramp.route.test.ts`).
- [x] `requireVortexAdmin` (`requireAuth → rejectImpersonation → role check`) gates `GET
      /accounts`, `GET /accounts/:profileId`, `POST /impersonation`, and `GET /impersonation`; an
      impersonated caller is refused all four — **PASS** (`admin-console.route.test.ts`, "refuses
      an impersonated caller from reaching GET /accounts or POST /impersonation").
- [x] `DELETE /impersonation/:sessionId` allows an impersonated caller to end only its own session
      (`req.impersonation.sessionId === :sessionId`) and rejects any other target with `403
      IMPERSONATION_NOT_ALLOWED`, while a non-impersonated caller still needs `vortex_admin` to
      revoke any session — **PASS** (`admin-console.route.test.ts`, all four cases under "DELETE
      /impersonation/:sessionId while impersonating").
- [x] Every `api_client_events` row raised while `req.impersonation` is set carries
      `impersonationSessionId` and `impersonatorProfileId` in `metadata`, including quote
      operations and maintenance denials — **PASS** (`quote.controller.test.ts`,
      `maintenanceGuard.test.ts`).
- [x] `vortex_admin` is excluded from grant via `POST /v1/admin/profile-roles`
      (`403 ROLE_NOT_HTTP_GRANTABLE`), while revocation of any role including `vortex_admin`
      remains available via `DELETE` on that same route — **PASS**
      (`profileRoles.controller.test.ts`).
- [x] Removing `vortex_admin` atomically revokes every live session, while `resolveSession()` also
      rejects a token after an out-of-band role deletion — **PASS** (`profileRoles.controller.test.ts`,
      `impersonation.service.test.ts`).
- [x] Actor and target deletions are `RESTRICT`ed so session audit rows cannot be cascade-deleted —
      **PASS** (`impersonation.service.test.ts`).
- [x] An out-of-band, idempotent operator process for granting `vortex_admin` exists and is
      documented — **PASS** (`scripts/grant-vortex-admin.ts`, `bun run grant:vortex-admin
      <email>`).
- [x] The operator-facing frontend that consumes `/v1/admin-console/*` presents a
      non-dismissible banner naming the impersonated account and warning that money movement is
      disabled while a session is active —
      **PASS** (`apps/dashboard/src/components/layout/ImpersonationBanner.tsx`, rendered from
      `routes/_app.tsx`); behavior tracked in `docs/product-dashboard.md`.
