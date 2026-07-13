# Monerium Integration

## What This Does

The backend provides authenticated Monerium OAuth authorization-code endpoints for individual KYC and business KYB. It generates OAuth state and PKCE material server-side, exchanges codes directly with Monerium, keeps access and rotating refresh tokens only in backend memory, reads the authenticated Monerium context and API-v2 profile, and mirrors only normalized verification metadata into `provider_customers` and `kyc_cases`.

The endpoints are `POST /v1/monerium/oauth/start`, `POST /v1/monerium/oauth/complete`, and `GET /v1/monerium/status`. They use the Supabase-authenticated user identity. `MONERIUM_REDIRECT_URI` is the exact dashboard callback URI registered with Monerium and is never derived from request input. After a successful callback exchange, the callback route restores any refreshed dashboard session and replace-navigates to the overview with the EU onboarding modal open; callback failures remain on the callback route so their error is preserved.

Monerium replaces Mykobo as the EU dashboard onboarding provider and the EUR recipient-eligibility provider. This change does not restore the historical Monerium EURe payment rail. EUR ramp registration remains disabled, and the dormant Mykobo settlement path must not be re-enabled until its separate Mykobo-profile gate is reconciled with Monerium identity.

## Security Invariants

1. OAuth state and the PKCE verifier MUST be generated with a cryptographically secure random source on the backend.
2. Each OAuth transaction MUST expire after 10 minutes and be bound to the authenticated user, customer entity, customer type, and configured redirect URI.
3. OAuth state MUST be atomically consumed before code exchange. A foreign user MUST NOT be able to consume another user's transaction.
4. The authorization code, state, verifier, access token, refresh token, authorization URL query, and raw provider bodies MUST NOT be logged or persisted.
5. Access and rotating refresh tokens MUST remain in backend memory only and MUST never be returned by an API response.
6. The optional start email MUST match the canonical authenticated email; the backend MUST send only that canonical email to Monerium.
7. Code exchange and refresh MUST use the configured client ID and the same exact redirect URI used at authorization start.
8. All Monerium API calls MUST have an explicit timeout and request API v2 for context/profile reads.
9. Individual onboarding MUST select a profile with kind `personal` and business onboarding MUST select one with kind `corporate`. The matching `defaultProfile` is preferred; multiple matching profiles without a matching default MUST be rejected rather than choosing an arbitrary legal identity.
10. Starting OAuth MUST persist `PENDING` with `status_external = authorization_started` without downgrading an existing approval. Provider profile status MUST be normalized to `PENDING`, `APPROVED`, or `REJECTED`; the raw profile state belongs in `status_external`.
11. Monerium rows MUST use provider `monerium`, rail `eur`, customer type `individual` or `business`, the Monerium profile ID as the provider identifier, and KYC case type `kyc` or `kyb` respectively.
12. Production startup MUST fail without a Monerium auth-code client ID and exact callback URI. Credentials MUST NOT be accepted from client requests.
13. A persisted terminal approval or rejection MUST remain readable after in-memory credentials are lost. A pending profile requires reauthorization before its live state can be refreshed.
14. Dashboard onboarding-status polling SHOULD refresh pending Monerium profiles while credentials remain in memory, but a provider outage MUST NOT make the aggregate onboarding endpoint unavailable.
15. The requested customer type MUST match the authenticated legal entity; recipient eligibility MUST match the invitation type and MUST NOT rely on a Monerium approval older than five minutes.
16. Local `authorization_started` and Monerium `created` and `incomplete` profiles MUST remain awaiting-user states; only provider `pending` is displayed as in review.
17. Missing app-specific Monerium authorization MUST surface as `MONERIUM_REAUTHENTICATION_REQUIRED` on the affected onboarding account without failing aggregate status loading.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| OAuth login CSRF | An attacker submits a code from an unrelated authorization transaction | High-entropy state is bound to the authenticated owner/entity/type/redirect and consumed once |
| Code interception | An intercepted authorization code is exchanged by another client | S256 PKCE verifier remains backend-only and is required at token exchange |
| State replay | A callback is submitted repeatedly | `NodeCache.take` atomically removes state before the first token exchange |
| Ownership denial of service | A foreign authenticated user submits a stolen state first | Ownership is checked synchronously before atomic consumption |
| Email substitution | A client starts verification for another email | Backend derives email from authenticated identity and treats a supplied email only as an equality assertion |
| Token disclosure | Tokens leak through API responses, database records, or logs | Tokens are backend-memory-only; persisted mirrors contain profile identifiers and status metadata only |
| Refresh replay/race | Concurrent status reads use the same rotating refresh token | Refreshes are coalesced per entity/customer type and the rotated token replaces the prior in-memory value |
| Provider hangs | Monerium does not respond | Every provider fetch has an explicit 10-second abort timeout |
| Wrong profile association | A context contains multiple legal profiles | Requested customer type is enforced, the matching default is preferred, and ambiguous matches are rejected |

## Audit Checklist

- [x] All three Monerium endpoints require Supabase authentication.
- [x] State and PKCE are generated server-side with `crypto.randomBytes`; S256 is used.
- [x] OAuth start creates or updates the Monerium account to `PENDING`/`authorization_started` without downgrading an approved account.
- [x] OAuth transactions have a 10-minute TTL and bind owner, entity, type, and redirect URI.
- [x] Foreign ownership is rejected before state is consumed; owner completion consumes state atomically before exchange.
- [x] Canonical authenticated email is used and optional request email is equality-only.
- [x] Tokens and OAuth transaction secrets use backend `NodeCache`; no credential table or encryption-at-rest mechanism exists because credentials are never persisted.
- [x] Access and refresh tokens are absent from API responses and model writes.
- [x] Expired access tokens are refreshed server-side and rotated refresh tokens replace previous values.
- [x] Missing Monerium authorization is isolated to the affected onboarding account so the dashboard can offer reauthentication without hiding other corridors.
- [x] Context/profile calls request API v2 and all provider calls use an explicit timeout.
- [x] Profile selection and status normalization are covered by focused unit tests.
- [x] `provider_customers` and `kyc_cases` constraints include `monerium` through a forward migration; migration 040 remains unchanged.
- [x] Production configuration requires the client ID and exact callback URI.
- [x] Persisted terminal statuses remain available after restart; pending profiles require reauthorization when credentials are lost.
- [x] Pending Monerium profiles refresh through dashboard onboarding polling without making aggregation depend on provider availability.
