# Monerium Integration

> **B2B onramp:** the whitelabel attestor/webhook onramp is specified in [monerium-b2b.md](./monerium-b2b.md); it consumes the shared white-label client specified below. This file covers the shared white-label API client and the legacy consumer OAuth onboarding flow.

## White-Label API Client (`@vortexfi/shared`)

### What This Does

`@vortexfi/shared` provides a server-to-server Monerium white-label API client authenticated with
the `client_credentials` grant. It maps profile status, linked addresses, IBAN provisioning and
movement, EURe redemption orders, supporting-document uploads, and webhook subscriptions. Users
interact only with Vortex; all Monerium credentials, tokens, and API calls remain backend-only.

This client establishes the integration baseline for API-managed EU KYC/KYB, wallet ownership,
IBANs, and SEPA/EURe payments. Its only consumer today is the Monerium B2B onramp
([monerium-b2b.md](./monerium-b2b.md)), which wraps it in its own audited orchestration. It is not
connected to a public Vortex route or ramp phase, and EUR ramp registration remains disabled until
that orchestration and its tests are implemented.

### Security Invariants

1. White-label credentials MUST use `MONERIUM_WHITELABEL_CLIENT_ID` and `MONERIUM_WHITELABEL_CLIENT_SECRET`, remain backend-only, and never be accepted from caller input.
2. `MONERIUM_API_URL` MUST use HTTPS. Every authenticated call MUST request API v2, encode dynamic path/query values, and use an explicit 10-second timeout.
3. Authentication MUST send form-encoded `client_credentials`. Access tokens MUST be cached only in memory, coalesced across concurrent requests, renewed before expiry, and reacquired at most once after `401`.
4. Client secrets, access tokens, signatures, request bodies, and raw provider response bodies MUST NOT appear in logs, structured errors, or Vortex API responses. Error endpoint fields MUST use route templates rather than customer identifiers.
5. Successful provider responses MUST be validated against consumed wire schemas. Malformed successful responses MUST surface as contract violations, not trusted typed values or provider-availability errors.
6. Profile kinds and states MUST preserve Monerium's documented values. A profile UUID MUST remain bound to the correct Vortex legal entity when orchestration is added.
7. The wallet-ownership message MUST remain exactly `I hereby declare that I am the address owner.` Callers SHOULD obtain it through `buildMoneriumWalletLinkMessage`.
8. EOA signatures and off-chain EIP-1271 combined signature bytes MUST be sent unchanged. Vortex MUST NOT hash, split, recover, reorder, or assemble smart-wallet owner signatures. The wallet integration owns signature assembly; Monerium owns `isValidSignature` verification.
9. Address results MUST preserve `201` immediate success and `202` pending on-chain verification. IBAN creation MUST preserve `202` provisioning and `304` already-provisioned semantics. Order creation MUST preserve `200` placed and `202` pending semantics.
10. SEPA redemption messages MUST bind currency, exact amount, recipient IBAN, and an RFC3339 minute timestamp no more than five minutes old. Only the full normalized IBAN or its deterministic first-four/last-four shortened form is valid.
11. Redemption orders of EUR 15,000 or more MUST include `supportingDocumentId`. Uploads MUST remain PDF/JPEG, at most 5 MB, with filenames no longer than 100 characters.
12. Webhook subscription secrets MUST contain 24-64 random bytes encoded as documented, callback URLs MUST use HTTPS, and event types MUST stay within the consumed Monerium enum.
13. Live contract mutations MUST target exactly `https://api.monerium.dev` and remain independently opt-in. An order contract test MUST NOT run from credentials alone because it can move sandbox EURe.
14. No public route or ramp phase may rely on this client until ownership checks, persistence, webhook verification, idempotency, and end-to-end corridor tests are implemented. The Monerium B2B onramp ([monerium-b2b.md](./monerium-b2b.md)) consumes this client for its provider calls through its own audited orchestration (attestor-signed linking, HMAC-verified webhooks, exactly-once financial operations).

### Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| White-label credential disclosure | A provider error echoes a secret, token, signature, or profile data | The client never logs bodies and replaces upstream/transport response bodies with a fixed redacted value |
| Token stampede | Concurrent requests receive a delayed `401` and repeatedly request tokens | Token acquisition is coalesced and a rejected token is cleared only if it is still the active cached token |
| Provider hangs | Monerium does not respond | Every provider fetch has an explicit 10-second abort timeout |
| Provider contract drift | Monerium renames a consumed field or changes an enum/status body | Runtime schemas reject malformed successes and the API contract suite exercises the same schemas |
| Smart-wallet proof corruption | Vortex hashes or reassembles Safe owner signatures differently from the wallet contract | Combined off-chain EIP-1271 bytes are opaque; the exact fixed message and hex-byte envelope are validated, then sent unchanged |
| Signed-order substitution | Amount, IBAN, or timestamp differs between the signature and submitted order | Request validation binds the exact documented message to the request fields before transmission |
| Production test mutation | A live contract check links a wallet or submits an order against real money | Every mutation asserts the exact sandbox origin and requires its own explicit run flag |
| Accidental contract-test settlement | A routine live check submits a signed redemption | Every persistent or value-moving sandbox flow has its own explicit `MONERIUM_CONTRACT_RUN_*` gate |

### Audit Checklist

- [x] White-label authentication uses form-encoded `client_credentials`; access tokens are coalesced, memory-only, and retried once after `401`.
- [x] White-label requests use API v2, encoded parameters, 10-second abort signals, and redacted structured provider errors.
- [x] Successful profile, address, IBAN, order, file, and webhook responses are validated before return.
- [x] Address linking preserves externally assembled EIP-1271 signature bytes and the documented `201`/`202` distinction.
- [x] IBAN and order methods preserve documented `304`/`202` semantics; signed SEPA messages and the EUR 15,000 evidence threshold are validated before submission.
- [x] Monerium wire schemas have shared unit coverage and an environment-gated API sandbox contract suite; mutating probes are separately opt-in.
- [x] Contract-test mutations refuse production and non-root sandbox URLs.
- [ ] Public white-label onboarding and ramp orchestration are not implemented; ownership, persistence, webhook verification, idempotency, and corridor coverage remain required before exposure.

## Legacy OAuth Onboarding (dashboard KYC/KYB)

### What This Does

The backend provides authenticated Monerium OAuth authorization-code endpoints for individual KYC and business KYB. It generates OAuth state and PKCE material server-side, exchanges codes directly with Monerium, keeps access and rotating refresh tokens only in backend memory, reads the authenticated Monerium context and API-v2 profile, and mirrors only normalized verification metadata into `provider_customers` and `kyc_cases`.

The endpoints are `POST /v1/monerium/oauth/start`, `POST /v1/monerium/oauth/complete`, and `GET /v1/monerium/status`. They use the Supabase-authenticated user identity. `MONERIUM_REDIRECT_URI` is the exact dashboard callback URI registered with Monerium and is never derived from request input. After a successful callback exchange, the callback route restores any refreshed dashboard session and replace-navigates to the overview with the EU onboarding modal open; callback failures remain on the callback route so their error is preserved.

Monerium replaces Mykobo as the EU dashboard onboarding provider and the EUR recipient-eligibility provider. This change does not restore the historical Monerium EURe payment rail. EUR ramp registration remains disabled, and the dormant Mykobo settlement path must not be re-enabled until its separate Mykobo-profile gate is reconciled with Monerium identity.

### Security Invariants

1. OAuth state and the PKCE verifier MUST be generated with a cryptographically secure random source on the backend.
2. Each OAuth transaction MUST expire after 10 minutes and be bound to the authenticated user, customer entity, customer type, and configured redirect URI.
3. OAuth state MUST be atomically consumed before code exchange. A foreign user MUST NOT be able to consume another user's transaction.
4. The authorization code, state, verifier, access token, refresh token, authorization URL query, and raw provider bodies MUST NOT be logged or persisted.
5. Access and rotating refresh tokens MUST remain in backend memory only and MUST never be returned by an API response.
6. The optional start email MUST match the canonical authenticated email; the backend MUST send only that canonical email to Monerium. Because Monerium documents the authorization `email` parameter as a prefill rather than an identity restriction, the callback MUST also match the authoritative `/auth/context.email` to the canonical authenticated email before accepting credentials or profile data.
7. Code exchange and refresh MUST use the configured client ID and the same exact redirect URI used at authorization start.
8. All Monerium API calls MUST have an explicit timeout and request API v2 for context/profile reads.
9. Individual onboarding MUST select a profile with kind `personal` and business onboarding MUST select one with kind `corporate`. The matching `defaultProfile` is preferred; multiple matching profiles without a matching default MUST be rejected rather than choosing an arbitrary legal identity.
10. Starting OAuth for an unbound account MUST persist canonical `started` with `status_external = authorization_started`. Starting reauthorization for an account with a profile ID MUST preserve its status. Provider profile state MUST map to the shared canonical verification enum; the raw profile state belongs unmodified in `status_external`. Monerium-specific API responses may continue returning `PENDING`, `APPROVED`, or `REJECTED` for compatibility.
11. Monerium rows MUST use provider `monerium`, rail `eur`, customer type `individual` or `business`, the Monerium profile ID as the provider identifier, and KYC case type `kyc` or `kyb` respectively. Once a row has a Monerium profile ID, later authorization MUST match that ID and MUST NOT replace the binding.
12. Production startup MUST fail without a Monerium auth-code client ID and exact callback URI. Credentials MUST NOT be accepted from client requests.
13. A persisted terminal approval or rejection MUST remain readable after in-memory credentials are lost. A pending profile requires reauthorization before its live state can be refreshed.
14. Dashboard onboarding-status polling SHOULD refresh pending Monerium profiles while credentials remain in memory, but a provider outage MUST NOT make the aggregate onboarding endpoint unavailable.
15. The requested customer type MUST match the authenticated legal entity; recipient eligibility MUST match the invitation type and MUST NOT rely on a Monerium approval older than five minutes.
16. Local `authorization_started` and Monerium `created` and `incomplete` profiles MUST map to `started`; only provider `pending` is displayed as in review.
17. Missing app-specific Monerium authorization MUST surface as `MONERIUM_REAUTHENTICATION_REQUIRED` on the affected onboarding account without failing aggregate status loading.
18. Starting reauthorization for an account that already has a bound Monerium profile MUST preserve its canonical verification status. The account status changes to `started` only before the first profile is bound.
19. Admin impersonation MUST NOT start or complete Monerium OAuth. `GET /status` remains available so an operator can inspect the target's persisted verification state.
20. Managed-profile selection is unsupported on these legacy routes. `X-Managed-Profile-Id` is ignored and every operation remains scoped to the Supabase-authenticated manager. Managed clients MUST NOT send the selector; the dashboard omits it and disables Monerium actions in child mode.

### Threat Vectors & Mitigations

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
| Different Monerium login | A user ignores the prefilled email and authorizes a different Monerium account or profile | The callback matches `/auth/context.email` to the authenticated Vortex email and rejects replacement of an existing Monerium profile ID |

### Audit Checklist

- [x] All three Monerium endpoints require Supabase authentication.
- [x] State and PKCE are generated server-side with `crypto.randomBytes`; S256 is used.
- [x] OAuth start creates or updates an unbound Monerium account to `started`/`authorization_started`; reauthorization preserves the status of an account that already has a profile ID.
- [x] OAuth transactions have a 10-minute TTL and bind owner, entity, type, and redirect URI.
- [x] Foreign ownership is rejected before state is consumed; owner completion consumes state atomically before exchange.
- [x] Canonical authenticated email is used and optional request email is equality-only.
- [x] Callback context email matches the authenticated Vortex email, and an existing Monerium profile binding is immutable.
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
- [x] OAuth start and completion reject admin impersonation while status remains readable.
- [x] Dashboard Monerium requests omit managed selection and child mode disables Monerium actions; the legacy API remains manager-scoped if a direct client supplies the ignored selector.
