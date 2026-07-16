# API Key Authentication

## What This Does

The API key system provides authentication for partner integrations (SDK users, third-party platforms). It uses a dual-key architecture:

- **Public keys (`pk_live_*`, `pk_test_*`)** — Included in client-side code (SDK, frontend). Used for tracking which partner initiated a request. Stored in plaintext in the database. Validated via direct DB lookup.
- **Secret keys (`sk_live_*`, `sk_test_*`)** — Server-side only. Used for authenticated operations (creating ramps, managing partner resources). Stored as bcrypt hashes in the database. Validated via prefix lookup + bcrypt comparison.

Key format: `{pk|sk}_{live|test}_{32 alphanumeric characters}` (generated from 32 bytes of `crypto.randomBytes`).

Three middleware components:
- **`apiKeyAuth(options)`** — Factory that returns middleware. Reads `X-API-Key` header. Validates secret keys (sk\_). Optionally validates partner match.
- **`validatePublicKey()`** — Validates public keys from query params or body. For tracking only, not authentication.
- **`enforcePartnerAuth()`** — When `partnerId` is in the request body, enforces that the request is authenticated and the partner matches.

### Optional user binding (`api_keys.user_id`)

A nullable `user_id` column on `api_keys` (FK to `profiles.id`, `ON DELETE SET NULL`) lets an admin bind a secret key to a specific profile. The binding is propagated to the request as `req.apiKeyUserId` (set by `setApiKeyUserId` in the auth middleware). Controllers and services derive the **effective user id** with `getEffectiveUserId(req)`, which prefers `req.userId` (Supabase) and falls back to `req.apiKeyUserId`. Public keys never populate `req.apiKeyUserId`. Use of the effective user is required for Alfredpay quote creation, ramp registration on Avenia/BRL or Alfredpay corridors, Alfredpay fiat-account management, and the BRLA pre-flight endpoints.

### Partner binding (`api_keys.partner_id`) and user-scoped keys

Partner attribution resolves through the `api_keys.partner_id` FK (migration `041-add-partner-id-to-api-keys`, backfilled from the legacy `partner_name` string against the now-unique `partners.name`). `partner_name` remains in the table as a backup column that also marks a key's origin: a key with `partner_name` set but `partner_id = NULL` is an **orphaned partner key** (its partner row was deleted — the FK is `ON DELETE SET NULL`) and is rejected outright, never degraded into a user-scoped key. A key with *both* partner columns NULL is a **user-scoped key**: it authenticates purely as the linked `user_id` and never resolves to an `AuthenticatedPartner`. The self-serve endpoints under `POST/GET/DELETE /v1/api-keys` (guarded by `requireAuth`) let any Supabase-authenticated user mint a public + secret pair bound to their own `req.userId` with `partner_id = NULL`. The admin endpoints under `/v1/admin/partners/:partnerName/api-keys` resolve the path's partner name to the unique `partners` row and bind keys via `partner_id`. Revocation is `is_active = false` plus a `revoked_at` timestamp; `scopes` (JSONB) is reserved and unused.

### Self-serve API key endpoints

`/v1/api-keys` is guarded by `requireAuth` (Supabase Bearer). The flow for a headless integrator is:
1. `POST /v1/auth/request-otp` with `{ email }` — Supabase sends a one-time code.
2. `POST /v1/auth/verify-otp` with `{ email, token }` — returns `{ access_token, refresh_token, user_id }`.
3. `POST /v1/api-keys` with `Authorization: Bearer <access_token>` — creates a `pk_*`/`sk_*` pair bound to `user_id`, with `partner_name = NULL`. The secret key is returned once.
4. Use `X-API-Key: <sk_*>` on quote/ramp endpoints. The request authenticates as the linked user (no partner attribution, no partner discount — defaults to the `vortex` partner fee configuration).

## Security Invariants

1. **Secret keys MUST be transmitted via the `X-API-Key` header only** — Never in query parameters, request body, or URL path. The middleware reads exclusively from `req.headers["x-api-key"]`.
2. **Secret keys MUST be stored as bcrypt hashes** — The raw secret key is never persisted. Only the `keyPrefix` (first 8 chars) and `keyHash` (bcrypt) are stored.
3. **Public keys MUST NOT grant authentication** — The `validateApiKey()` function returns `null` for public keys, explicitly denying authentication. Public keys are for tracking/identification only.
4. **Key format validation MUST precede database lookup** — Both `isValidSecretKeyFormat()` and `isValidApiKeyFormat()` use regex to reject malformed keys before any DB query, preventing injection and unnecessary load.
5. **Partner resolution MUST go through the `partner_id` FK** — `validateSecretApiKey` resolves `api_keys.partner_id` to the (unique-name) `partners` row; the legacy `partner_name` column is never read for authorization. `validatePartnerMatch`/`enforcePartnerAuth` may still compare by name — with `partners.name` unique, name equality and id equality are equivalent — and both UUID and string name formats for `partnerId` remain supported in request bodies.
6. **Expired keys MUST be rejected** — Both public and secret key validation check `expiresAt` against the current time. Expired keys are treated as invalid.
7. **Key lookup narrows by prefix, but the prefix does NOT bound the scan** — Secret key validation narrows by `keyPrefix` (first 8 chars) and then iterates with bcrypt comparison. Since the first 8 chars are the constant `sk_live_`/`sk_test_` for every secret key, the scan covers **all** active secret keys in that environment; auth latency grows linearly with the number of active secret keys. This is why self-serve key creation is capped (see invariant 17). A future format change embedding a random key-id in the key string would restore O(1) lookup.
8. **`enforcePartnerAuth` MUST block unauthenticated requests when `partnerId` is present** — If a request includes `partnerId` but has no authenticated partner, it MUST be rejected with 403.
9. **`lastUsedAt` updates MUST be fire-and-forget** — The `keyRecord.update({ lastUsedAt })` call is intentionally not awaited, with errors caught and logged. This MUST NOT block or fail the auth flow.
10. **Key generation MUST use cryptographically secure randomness** — `crypto.randomBytes(32)` is the source. Base64 encoding with character stripping is used to produce the 32-char alphanumeric portion.
11. **Secret keys MAY carry a nullable `api_keys.user_id` to identify a delegated user context** — The binding is consumed by the `apiKeyUserId` request field and is the only path for partner secret keys to provide a non-Supabase user identity. Public keys never carry or surface a user binding.
12. **`ON DELETE SET NULL` for `api_keys.user_id` is intentional** — Deleting a profile must not silently revoke partner keys; partner keys are operational assets and binding loss is a soft-state change.
13. **All ramp registration MUST be rejected when no effective user is present** — `POST /v1/ramp/register` requires a Supabase user or linked secret key and `RampService.registerRamp` rejects missing effective users with `400 Invalid quote: this route requires an API key linked to a user or Supabase user authentication.`. Quote creation remains anonymous-eligible for every corridor: Alfredpay quote engines use `resolveAlfredpayQuoteCustomerId`, which puts the sentinel `"anonymous"` (or the caller's real customer id when KYC-completed) into the tracking-only quote `metadata`; the KYC-gated `resolveAlfredpayCustomerId` runs at registration before any Alfredpay *order* is created. An anonymous quote (`quote.userId = NULL`) may be claimed at registration by any authenticated caller — it carries no owner, and provider identity is derived from the claimer's own KYC records. Unlinked secret keys are not a valid identity for registration.
14. **Only a key with no partner binding at all is user-scoped** — `validateSecretApiKey` treats a key as user-scoped only when *both* `partner_id` and `partner_name` are NULL and `user_id` is set, returning `{ partner: null, apiKeyUserId }`; the middleware leaves `req.authenticatedPartner` unset, so the request authenticates purely as the linked user. A key with `partner_name` set but `partner_id = NULL` (partner row deleted) is rejected — partner deletion is key revocation, in both `validateSecretApiKey` and `validatePublicApiKey` (the public path also rejects a dangling `partner_id` whose partner row is missing). A secret key with neither partner binding nor `user_id` is unusable and rejected as invalid.
15. **User-scoped keys MUST interpolate no partner pricing** — When `req.authenticatedPartner` is unset, `resolveQuotePartner` finds no partner (`source: "none"`), and `calculatePartnerAndVortexFees` falls through to the default `vortex` partner's pricing config (`partner_pricing_configs`, per ramp direction). User-scoped keys never receive partner-specific discounts.
16. **`POST/GET/DELETE /v1/api-keys` MUST require a Supabase user (`requireAuth`)** — The endpoints bind the created keys to `req.userId`; partner keys (with `partner_id`) remain admin-only under `/v1/admin/partners/:partnerName/api-keys` (`adminAuth`).
17. **Self-serve key creation MUST be capped per user** — `createUserApiKey` rejects with `409 API_KEY_LIMIT_REACHED` when the user already has `MAX_ACTIVE_KEYS_PER_USER` (10) active keys, and rejects `expiresAt` values more than 2 years out. Because of the linear bcrypt scan (invariant 7), an unbounded self-serve endpoint would let any user degrade auth latency for the whole system. The key pair is created in a single DB transaction so a failure cannot leave an orphaned half.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Secret key exposure in client code** | Partner accidentally ships sk\_ key in frontend bundle | Middleware rejects pk\_ keys for authentication; documentation emphasizes server-only usage for sk\_ keys |
| **Brute force secret key** | Attacker iterates over possible sk\_ values | 32 chars of alphanumeric = ~190 bits entropy; bcrypt cost factor 10 for comparison; rate limiting on API |
| **Timing attack on key validation** | Attacker measures response time to distinguish "key not found" from "bcrypt mismatch" | Prefix lookup returns all matching keys → bcrypt runs for each → timing varies by key count, not by correctness |
| **Partner impersonation** | Attacker uses one partner's API key with another partner's `partnerId` | `enforcePartnerAuth` compares the authenticated partner (resolved via `api_keys.partner_id`) against the requested partner; with unique partner names, name and id comparison are equivalent; rejects mismatches with 403 |
| **Stale/revoked key usage** | Partner's key is deactivated but still being used | `isActive` flag checked on every validation; expired keys rejected by `expiresAt` check |
| **Key hash enumeration** | Attacker with DB read access tries to use key hashes | bcrypt hashes are one-way; raw keys cannot be recovered from hashes |
| **Unlinked key creating provider resources anonymously** | Partner uses a generic (unbound) sk\_ key to mint provider-side resources, then registers with a linked secret key or Supabase session to claim them | Quotes are estimates and carry no provider resources beyond a tracking-metadata customer id (`"anonymous"` sentinel for non-KYC'd callers). All provider *orders* are created at registration, where `POST /v1/ramp/register` requires credentials, `RampService.registerRamp` rejects missing effective users, and provider identity is derived from the registering user's own KYC records — so claiming an anonymous quote yields no access to anyone else's resources. |
| **Self-serve key flooding (auth DoS)** | A user mints thousands of key pairs via `POST /v1/api-keys`, inflating the bcrypt scan for every secret-key auth | Per-user cap of `MAX_ACTIVE_KEYS_PER_USER` (10) active keys enforced with `409`; revocation frees slots. |
| **One linked key operating on another user's quote/ramp** | Partner with a valid linked key targets a different linked user's provider-bound quote | `assertQuoteOwnership`/`assertRampOwnership` enforce `quote.userId === req.apiKeyUserId` when a linked key is in scope. The `RampService.registerRamp` cross-user check rejects the same scenario at registration time with `403`. |
| **Anonymous subaccount creation DoS** | Unauthenticated caller hits `POST /v1/brla/createSubaccount` to spawn stranded Avenia subaccounts | The route now requires `requirePartnerOrUserAuth()`; controllers require an effective user id before calling the Avenia API. |

## Audit Checklist

- [x] All endpoints requiring partner auth use `apiKeyAuth({ required: true })` or `enforcePartnerAuth()` — **PASS: `enforcePartnerAuth()` is active on `POST /v1/ramp/quotes` and `POST /v1/ramp/quotes/best`. `POST /v1/ramp/register` now requires sk_ OR Supabase via `requirePartnerOrUserAuth()`. Update/start/status/errors still use `optionalPartnerOrUserAuth()` so legacy fully-anonymous ramps can be inspected or advanced only when ownership checks allow it.**
- [x] Secret key validation (`validateSecretApiKey`) always uses bcrypt comparison, never plaintext comparison — **PASS**
- [x] Public key validation (`validatePublicApiKey`) stores keys in plaintext (by design for lookup) but never returns auth credentials — **PASS**
- [x] `getKeyType()` correctly identifies `pk_` as public, `sk_` as secret, and anything else as `null` — **PASS**
- [x] Regex patterns in `isValidApiKeyFormat` and `isValidSecretKeyFormat` match the documented format exactly: `^(pk|sk)_(live|test)_[a-zA-Z0-9]{32}$` — **PASS**
- [x] `generateApiKey()` uses `crypto.randomBytes(32)` — not `Math.random()` or other weak sources — **PASS**
- [x] `hashApiKey()` uses bcrypt with salt rounds ≥ 10 — **PASS (saltRounds = 10)**
- [x] Expiration check (`expiresAt`) uses `new Date() > keyRecord.expiresAt`, correctly handling `null` expiresAt (no expiration) — **PASS**
- [x] `enforcePartnerAuth` returns 403 (not 401) when partnerId is present but no auth provided — **PASS (active on `POST /v1/ramp/quotes` and `POST /v1/ramp/quotes/best`)**
- [x] Partner name comparison is case-sensitive and exact (no normalization that could be exploited) — **PASS**
- [x] No endpoint accepts secret keys from query parameters or request body — **PASS**
- [x] Error responses from key validation use distinct error codes (`API_KEY_REQUIRED`, `INVALID_SECRET_KEY`, `INVALID_API_KEY`, `PARTNER_MISMATCH`) without revealing which step failed for valid key formats — **PARTIAL: `PARTNER_MISMATCH` leaks authenticated partner name in response details**
- [x] `api_keys.user_id` migration (`034-add-user-id-to-api-keys`) added with `ON DELETE SET NULL`, `idx_api_keys_user_id`, and `idx_api_keys_active_user_lookup`. — **PASS**
- [x] `api_keys.partner_name` is nullable (migration `035-make-api-key-partner-name-nullable`) and is a legacy backup column — authorization never reads it. — **PASS**
- [x] `api_keys.partner_id` FK (migration `041-add-partner-id-to-api-keys`, backfilled from `partner_name`) is the sole partner-resolution path in `validateSecretApiKey`/`validatePublicApiKey`; user-scoped keys have `partner_id = NULL` and authenticate purely as `user_id`. — **PASS**
- [x] Revocation stamps `revoked_at` alongside `is_active = false` (self-serve and admin revoke paths). — **PASS**
- [x] `validateSecretApiKey` returns a `ValidatedSecretKey` wrapper `{ apiKeyId, apiKeyUserId, partner: AuthenticatedPartner | null }`; `partner` is null for user-scoped keys. — **PASS**
- [x] `validatePublicApiKey` returns a `ValidatedPublicKey` wrapper `{ partnerName: string | null }`; `partnerName` is null for user-scoped public keys. — **PASS**
- [x] `apiKeyAuth` and `dualAuth` populate `req.apiKeyUserId` from the validated secret key; `req.authenticatedPartner` is left unset for user-scoped keys. Public keys do not populate `req.apiKeyUserId`. — **PASS**
- [x] `getEffectiveUserId` returns `req.userId ?? req.apiKeyUserId`. — **PASS**
- [x] User-scoped keys interpolate no partner pricing (`resolveQuotePartner` returns `source: "none"`, fee engine falls through to default `vortex` Partner rows). — **PASS**
- [x] `POST/GET/DELETE /v1/api-keys` require `requireAuth` (Supabase Bearer); bind created keys to `req.userId` with `partner_name = NULL`. Admin partner-key endpoints still require `adminAuth`. — **PASS**
- [x] Quote creation is anonymous-eligible for every corridor; Alfredpay quote engines use the sentinel `"anonymous"` in tracking-only quote metadata for non-KYC'd callers (`resolveAlfredpayQuoteCustomerId`), and provider orders always resolve via the strict `resolveAlfredpayCustomerId`. — **PASS**
- [x] `POST /v1/ramp/register` and `RampService.registerRamp` reject ramp registration without an effective user with `401` at the route or `400 Invalid quote` at the service boundary. — **PASS**
- [x] `RampService.registerRamp` rejects registration of a quote owned by a *different* user with `403`; anonymous quotes (no owner) may be claimed by any authenticated caller, with provider identity derived from the claimer's own KYC records. — **PASS**
- [x] `createUserApiKey` enforces `MAX_ACTIVE_KEYS_PER_USER` (10) with `409`, caps `expiresAt` at 2 years, and creates the key pair in a single transaction. — **PASS**
- [x] `assertQuoteOwnership` and `assertRampOwnership` reject linked-key callers who try to operate on a different linked user's quote/ramp. — **PASS**
