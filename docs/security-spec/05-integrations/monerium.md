# Monerium Integration

> **B2B onramp:** the whitelabel attestor/webhook onramp is specified in [monerium-b2b.md](./monerium-b2b.md); it consumes the shared white-label client specified below. This file covers the shared white-label API client, the active direct-API Polygon EUR onramp built on it, and the legacy consumer OAuth onboarding flow.

## White-Label API Client And Active Polygon EUR Onramp

### What This Does

`@vortexfi/shared` provides a server-to-server Monerium white-label API client authenticated with
the `client_credentials` grant. It maps profile status, linked addresses, IBAN provisioning and
movement, EURe redemption orders, supporting-document uploads, and webhook subscriptions. All
white-label credentials, tokens, and API calls remain backend-only.

The client supplies profile status, wallet ownership, and IBAN data for the active Polygon EUR
onramp. Registration resolves the user's profile through the white-label app first and falls back
to the same read operations with the user's backend-held OAuth token when the white-label app cannot
see the profile (`MoneriumApiService.forUserAccessToken`), so users onboarded through either
Monerium application can ramp. New SEPA/EUR BUY quotes resolve exclusively to `MoneriumOnrampPolygonCrossChain` (other EVM
destinations) or `MoneriumOnrampPolygonSameChain` (Polygon destinations); Mykobo flows remain executable only for persisted legacy quotes and ramps. New SEPA/EUR SELL quotes are
rejected with public `400 Bad Request` because no active EUR offramp exists.

The Polygon onramp issues EURe to the profile-linked owner, funds the ephemeral, transfers the exact
quoted post-fee EURe from the owner, swaps it through the pinned Polygon Uniswap V3 EURe/USDC pool,
distributes fees and applies any bounded post-swap subsidy in Polygon USDC, then uses Squid for
destination settlement. Registration snapshots the owner's Polygon EURe balance before releasing
the SEPA instruction. Execution advances when the balance reaches that baseline plus the quoted
post-fee EURe amount. This is balance-delta attribution, not provider-order correlation.

Monerium's token APIs currently list Ethereum, Gnosis, Polygon, Arbitrum, Linea, Base, and Noble in
production, plus Sepolia, Chiado, Amoy, Arbitrum Sepolia, Linea Sepolia, Base Sepolia, Scroll Sepolia,
and Grand in sandbox. Scroll Sepolia is token-discovery-only and is not accepted by Monerium's
operational address, IBAN, or order schemas. The reusable Vortex blocks support only the intersection
with existing Vortex EVM networks and clients: Ethereum, Polygon, Arbitrum, Base, Polygon Amoy, and
Base Sepolia. Adding another Monerium chain requires an explicit Vortex network/client configuration
and official EURe token metadata; the block MUST NOT silently substitute a different chain. EURe is
an internal route asset and remains outside the shared public token registry.

The cataloged route is a parameterized flow factory with a canonical executor instance. Its Polygon
conversion is pinned to EURe `0x18ec0A6E18E5bc3784fDd3a3634b31245ab704F6`,
native USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`, the 500-fee pool
`0x368A930B71326e3f640Df36378d931DbE3D03746`, factory
`0x1F98431c8aD98523631AE4a59f267346ea31F984`, router
`0xE592427A0AEce92De3Edee1F18E0157C05861564`, and quoter
`0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6`.

### Release Boundary

The active product boundary is the EUR BUY flow for a legal entity whose Monerium profile is
readable through either Monerium application ([adr-0006](../../adr-0006-monerium-dual-app.md)).
Both individual and business entities are eligible when they have a `monerium`/`eur`
provider-customer binding, the bound profile is approved, exactly one Polygon EOA/IBAN destination
resolves for it, and the ramping client can collect a permit from that EOA. Profiles reach that
state either by out-of-band provisioning into the white-label app or by Monerium OAuth onboarding
in the dashboard or widget followed by the Vortex wallet-link step (`POST /v1/monerium/wallet`),
which links the connected EOA and requests or moves the profile's IBAN. The caller may select its
own legal profile by `customerType`; profile UUID, address, and IBAN are still server-derived. When
both legal types are bound, a missing selector fails with `MONERIUM_CUSTOMER_TYPE_REQUIRED`. The
SDK, dashboard, and widget all complete the owner-permit journey;
direct API clients submit the permit themselves.

The following remain deferred and MUST NOT be inferred from the shared client's endpoint coverage:
EUR SELL, profile creation through the white-label API, OAuth-to-white-label migration, external
profile import, KYC/KYB lifecycle orchestration through the white-label API, and automatic permit
recovery.

### OAuth Profiles And Imported Profiles

- Vortex operates a sibling authorization-code/PKCE Monerium application for KYC/KYB onboarding
  (specified below). Its profiles are invisible to the white-label application and are read only
  through the user's backend-held token; the identity resolver covers both apps at registration.
  Migration of such profiles into the white-label application is still undefined.
- Profiles may also be imported from other trusted external sources. Every source MUST associate the
  correct Monerium profile UUID with the correct Vortex legal entity; no caller-controlled profile
  adoption may be exposed while the import contract is undefined.
- The migration/import trigger, identifiers, persistence transitions, and status reconciliation are
  TBD. This specification does not decide whether the OAuth and white-label paths share or reuse
  `provider_customers` or `kyc_cases`.
- Profile-scoped persistence MUST remain limited to the Monerium profile identifier and compliance
  status. Addresses and IBANs remain provider-authoritative; any selected values needed by a ramp
  belong in quote or ramp state, not a permanent Monerium profile table.
- A Monerium mint address MUST belong exclusively to one Monerium profile and MUST never be shared
  across profiles. Incoming deposits are attributed to that profile through its dedicated address.

### Security Invariants

1. White-label credentials MUST use `MONERIUM_WHITELABEL_CLIENT_ID` and `MONERIUM_WHITELABEL_CLIENT_SECRET`, remain backend-only, and never be accepted from caller input.
2. `MONERIUM_API_URL` MUST use HTTPS. Every authenticated call MUST request API v2, encode dynamic path/query values, and use an explicit 10-second timeout.
3. Authentication MUST send form-encoded `client_credentials`. Access tokens MUST be cached only in memory, coalesced across concurrent requests, renewed before expiry, and reacquired at most once after `401`.
4. Client secrets, access tokens, signatures, request bodies, and raw provider response bodies MUST NOT appear in logs, structured errors, or Vortex API responses. Error endpoint fields MUST use route templates rather than customer identifiers.
5. Successful provider responses MUST be validated against consumed wire schemas. Malformed successful responses MUST surface as contract violations, not trusted typed values or provider-availability errors.
6. Profile kinds and states MUST preserve Monerium's documented values. The profile UUID used by active registration MUST remain bound to the correct Vortex legal entity.
7. The wallet-ownership message MUST remain exactly `I hereby declare that I am the address owner.` Callers SHOULD obtain it through `buildMoneriumWalletLinkMessage`.
8. EOA signatures and off-chain EIP-1271 combined signature bytes MUST be sent unchanged. Vortex MUST NOT hash, split, recover, reorder, or assemble smart-wallet owner signatures. The wallet integration owns signature assembly; Monerium owns `isValidSignature` verification.
9. Address results MUST preserve `201` immediate success and `202` pending on-chain verification. IBAN creation MUST preserve `202` provisioning and `304` already-provisioned semantics. Order creation MUST preserve `200` placed and `202` pending semantics.
10. SEPA redemption messages MUST bind currency, exact amount, recipient IBAN, and an RFC3339 minute timestamp no more than five minutes old. Only the full normalized IBAN or its deterministic first-four/last-four shortened form is valid.
11. Redemption orders of EUR 15,000 or more MUST include `supportingDocumentId`. Uploads MUST remain PDF/JPEG, at most 5 MB, with filenames no longer than 100 characters.
12. Webhook subscription secrets MUST contain 24-64 random bytes encoded as documented, callback URLs MUST use HTTPS, and event types MUST stay within the consumed Monerium enum.
13. Live contract mutations MUST target exactly `https://api.monerium.dev` and remain independently opt-in. An order contract test MUST NOT run from credentials alone because it can move sandbox EURe.
14. New SEPA/EUR BUY quotes MUST resolve only to the Polygon Monerium flows. A direct EUR BUY quote for a destination they cannot serve (a non-EVM network, `doesNetworkSupportEurOnramp`) MUST return the public `400` `QuoteError.EurOnrampNetworkUnsupported`; the dashboard and widget pickers MUST NOT offer those destinations for EUR. New EUR SELL quotes MUST return a public `400` and MUST NOT fall back to a Mykobo flow. `EUR_ONRAMP_ENABLED=false` is the operational kill switch: direct and best-quote EUR BUY requests MUST return the public `503` `QuoteError.AnchorTemporarilyUnavailable`, while ramps already registered keep executing.
15. Production startup MUST fail without a Monerium auth-code client ID, exact callback URI, and explicit non-negative `MONERIUM_ISSUE_FEE_EUR`. The issue fee MUST NOT silently default to zero. The white-label credential pair is optional outside the B2B onramp; when it is absent, every Monerium read uses the user's OAuth token. Credentials MUST NOT be accepted from client requests.
16. Issue registration MUST derive the Monerium profile UUID from the authenticated effective user's `monerium`/`eur` provider-customer binding for the requested `customerType` (`individual` or `business`); the widget supplies its individual type and the dashboard supplies the selected account type. With one bound profile, legacy type-less calls may use it; with more than one, they MUST fail with a public `409` `MONERIUM_CUSTOMER_TYPE_REQUIRED`. When white-label credentials are configured, the resolver MUST read the selected profile through the white-label app first and, only when that app answers `403` or `404`, through the user's backend-held OAuth token (`resolveMoneriumIdentity`); without them it MUST use the OAuth token directly. A missing binding MUST fail with `MONERIUM_ONBOARDING_REQUIRED`; a missing or rejected OAuth session MUST fail with `MONERIUM_REAUTHENTICATION_REQUIRED`; any other white-label failure MUST NOT switch apps. The live profile MUST be `approved`. Which app served the profile is logged, never persisted. Registration MUST reject caller-supplied profile, address, or IBAN identity, perform no IBAN mutation, and accept exactly one provider-returned IBAN whose valid EVM address matches an address linked to Polygon on that profile. Because the self-transfer uses an EOA-signed ERC-2612 permit, registration MUST reject a destination with deployed contract code. Registration MUST hold transaction-scoped profile and owner advisory locks through the active-ramp check and ramp insert. It MUST reject registration with a public `409` while another Monerium ramp for the same owner is live (`findActiveMoneriumRampForOwner`: any non-terminal ramp except an unstarted one whose start window has closed), because permits for one owner share an ERC-2612 nonce and the mint executor attributes by balance delta. It MUST read and persist the owner's Polygon EURe balance baseline; inability to obtain an authoritative baseline fails registration. Quote simulation MUST perform no Monerium API or authentication read.
17. Self-transfer registration MUST copy only owner, token, chain, and amount from trusted `monerium-issue` facts and MUST reject an owner that is also the EVM ephemeral. Its EURe permit and exact `transferFrom` MUST be independently validated and reconciled; strict presign completeness MUST require both the user-signed permit and ephemeral-signed transfer. A still-current permit MUST be consumed even when allowance already exists, while an advanced nonce or expired deadline may prove it non-replayable. Permit and transfer hashes MUST remain in namespaced block state, and successful execution MUST verify receipts and the exact allowance reduction.
18. The Polygon conversion MUST verify the pinned pool's tokens, fee, and factory and verify that the pinned factory, router, and quoter resolve to that deployment before quoting or execution. It MUST quote and execute exact-input EURe-to-USDC only, approve only the exact input, bind the swap recipient to the ephemeral, enforce the standard AMM hard minimum and soft execution threshold, validate both raw signed transactions against their unsigned blueprints and route semantics, verify successful receipts, and reconcile the post-swap allowance and output balance. Polygon USDC fee distribution and post-swap subsidy MUST use the existing configured fee recipients and EVM funding account respectively; neither may substitute the Monerium owner or ephemeral as a treasury destination.
19. Issue execution MUST wait for `currentOwnerBalance >= persistedBaseline + quotedPostFeeEureRaw`. Timeouts and exhausted RPC reads are recoverable. Missing or malformed settlement facts are unrecoverable corruption. The executor MUST transfer only the quoted post-fee amount; excess EURe remains in the owner wallet. This non-deterministic attribution exception is accepted only under RISK-023.
20. The owner permit carries the same deadline as the downstream swap presign (`config.swap.deadlineMinutes`, one week) from transaction preparation; its spender is the ramp's own ephemeral and its value exact, so the window bounds time only. An expired permit or consumed nonce MUST stop automatic self-transfer unless a sufficient safe allowance remains, and MUST pause the ramp for reconciliation (not a recoverable retry) when no allowance remains; the API MUST NOT fabricate or broaden authorization. The absence of automatic reauthorization/recovery is accepted under RISK-024.
21. `POST /v1/monerium/wallet` MUST verify the EOA signature over the fixed ownership message server-side before any provider call, MUST reject addresses with deployed code, MUST select the same legal profile type as the status read, MUST link through the app that can read that profile, and MUST request its single IBAN only when it has none. `POST /v1/monerium/iban/move` MUST hold the same profile and current-owner advisory locks through the active-ramp check and provider mutation, and MUST reject with a public `409` while a live Monerium ramp still waits on the IBAN's current wallet, because the mint executor watches only the registered owner. Status reads (`GET /v1/monerium/status`, `GET /v1/onboarding/status`) MUST NOT mutate provider state; they report readiness for that legal type from the same list reads registration uses. OAuth-user API reads returning `401` at any point MUST surface `MONERIUM_REAUTHENTICATION_REQUIRED` so clients can reconnect.
22. An IBAN destination MUST change only through `POST /v1/monerium/iban/move`, an explicit request by the authenticated owner naming an address already linked on that chain, because it redirects the profile's future SEPA deposits. First-party UIs MUST ask for informed confirmation before that request and explain that other services using the IBAN may depend on the old wallet. The backend MUST NOT move an IBAN as a side effect of linking, status, or registration.
23. The OAuth redirect URI MUST come from the configured allowlist (`MONERIUM_REDIRECT_URI`, `MONERIUM_WIDGET_REDIRECT_URI`) selected by the `client` field, never from caller-supplied URLs, and MUST be bound into the OAuth transaction so the code exchange reuses the same exact URI.

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
| Balance-delta misattribution | An unrelated or duplicate EURe credit increases the linked owner's balance enough to satisfy a ramp | Accepted under RISK-023: the executor advances on the persisted balance delta, then transfers only the quoted amount. No claim of deterministic SEPA-order correlation is made; excess remains with the owner. |
| Permit becomes unusable before settlement | SEPA settlement arrives after the one-week permit deadline or after its nonce is consumed | Accepted under RISK-024: execution proves the permit unusable and stops rather than broadening authorization; manual resolution is required when no sufficient allowance remains. |
| Polygon swap route substitution | A stale or malicious endpoint points the conversion at a different pool, token, fee tier, router, or recipient | Deployment checks pin the pool/factory/router/quoter relationships; quote metadata and signed calldata are validated against constants, exact amounts, the ephemeral recipient, and bounded fee fields before broadcast |
| Forged wallet link | A caller links an address it does not control to a profile | The backend verifies the EOA signature over the fixed ownership message and rejects contract code before any provider call; Monerium verifies the signature again |
| IBAN redirection | A link, status, or registration call moves the profile's IBAN to another wallet | Only `POST /v1/monerium/iban/move`, an explicit owner request naming an already-linked address, calls `PATCH /ibans`; reads never mutate provider state |
| OAuth session loss | The backend restarts or Monerium revokes the refresh token, so an OAuth-onboarded profile cannot be read | Readiness and registration fail closed with `MONERIUM_REAUTHENTICATION_REQUIRED`; clients prompt a reconnect; tokens are never persisted (RISK-025) |

### Audit Checklist

- [x] White-label authentication uses form-encoded `client_credentials`; access tokens are coalesced, memory-only, and retried once after `401`.
- [x] White-label requests use API v2, encoded parameters, 10-second abort signals, and redacted structured provider errors.
- [x] Successful profile, address, IBAN, order, file, and webhook responses are validated before return.
- [x] Address linking preserves externally assembled EIP-1271 signature bytes and the documented `201`/`202` distinction.
- [x] IBAN and order methods preserve documented `304`/`202` semantics; signed SEPA messages and the EUR 15,000 evidence threshold are validated before submission.
- [x] Monerium wire schemas have shared unit coverage and an environment-gated API sandbox contract suite; mutating probes are separately opt-in.
- [x] Contract-test mutations refuse production and non-root sandbox URLs.
- [x] Production configuration requires the auth-code client ID, exact callback URI, and explicit non-negative issue fee; the white-label pair is optional and its absence routes reads through the OAuth token (`identity.test.ts`). `EUR_ONRAMP_ENABLED=false` stops new EUR BUY quotes with a public `503` (`eur-onramp-network.test.ts`).
- [x] Issue simulation is auth-free and fee-injected; registration resolves the bound profile through the white-label app or, when invisible there, the user's OAuth token (`identity.test.ts`), requires exactly one existing Polygon EOA IBAN/address match, rejects contract wallets, and persists the owner's EURe baseline.
- [x] Issue execution waits recoverably for the owner's EURe balance to increase by the quoted post-fee amount and documents the accepted non-deterministic attribution limitation.
- [x] Self-transfer preparation binds an owner permit and ephemeral exact `transferFrom`; execution consumes or proves the permit non-replayable and reconciles both operations independently.
- [x] Polygon conversion verifies the pinned EURe/USDC Uniswap V3 deployment, quotes exact input, prepares exact approval and `exactInputSingle` transactions, validates their signed semantics, and reconciles allowance, receipt, and output thresholds.
- [x] The complete Polygon-to-destination topology is cataloged for supported EVM outputs, same-chain Polygon included; Mykobo definitions are legacy-recovery-only and EUR offramps are rejected.
- [x] Strict transaction completeness requires the user-signed typed-data permit as well as every ephemeral-signed transaction before payment instructions are released.
- [x] Wallet linking verifies the owner signature and the EOA requirement server-side, links through the resolving app, and requests at most one IBAN; IBAN moves need an explicit owner request to an already-linked address; status reads never mutate provider state (`wallet.test.ts`).
- [x] The OAuth callback is selected from the configured dashboard/widget allowlist and bound into the transaction.
- [ ] OAuth-to-white-label migration, KYC/KYB lifecycle orchestration through the white-label API, and external profile import are deferred; their trust boundary, persistence model, and status reconciliation remain TBD.
- [x] The SDK returns the owner permit as a user-owned transaction; the dashboard and widget sign it with the connected Monerium-linked wallet, and SEPA instructions are released only after that update.
- [ ] OAuth-onboarded users depend on a backend-memory Monerium session for readiness and registration; a restart forces a reconnect (RISK-025).
- [ ] A permit collected before SEPA settlement can expire or become stale. If no sufficient allowance remains, the ramp stops for manual resolution; no automatic reauthorization path is implemented (RISK-024).
- [x] The post-issue conversion route is fixed-pool Polygon EURe-to-USDC followed by the regular EVM fee, subsidy, Squid settlement, and destination-transfer blocks.
- [ ] Provider-order correlation is not implemented. The active flow intentionally uses the accepted owner-balance-delta attribution model under RISK-023 instead.

## Legacy OAuth Onboarding (dashboard KYC/KYB)

### What This Does

The backend provides authenticated Monerium OAuth authorization-code endpoints for individual KYC and business KYB. It generates OAuth state and PKCE material server-side, exchanges codes directly with Monerium, keeps access and rotating refresh tokens only in backend memory, reads the authenticated Monerium context and API-v2 profile, and mirrors only normalized verification metadata into `provider_customers` and `kyc_cases`.

The endpoints are `POST /v1/monerium/oauth/start`, `POST /v1/monerium/oauth/complete`, `GET /v1/monerium/status`, and the wallet-readiness routes `POST /v1/monerium/wallet` and `POST /v1/monerium/iban/move` specified above. They use the Supabase-authenticated user identity. `MONERIUM_REDIRECT_URI` (dashboard) and `MONERIUM_WIDGET_REDIRECT_URI` (widget) are the exact callback URIs registered with Monerium; the start request's `client` selector picks one and it is never derived from request input. After a successful callback exchange, the dashboard callback route restores any refreshed session and replace-navigates to the overview with the EU onboarding modal open, and the widget's persisted ramp hands the callback to its restored verification step; callback failures preserve their error.

Monerium replaces Mykobo as the EU onboarding provider in the dashboard and widget and as the EUR recipient-eligibility provider. Profiles onboarded here are readable only through the user's backend-held token; the EUR onramp resolves them through the identity resolver (invariant 16 above) and the wallet-link step provisions their IBAN. The dormant Mykobo settlement path stays legacy-recovery-only.

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
| Revoked refresh token | Monerium rejects the refresh grant (4xx), so the cached credential can never be renewed | The stale credential is evicted and the call fails with `MONERIUM_REAUTHENTICATION_REQUIRED` so clients prompt a reconnect instead of a generic 502; a 5xx keeps the credential and surfaces as an upstream error |
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
