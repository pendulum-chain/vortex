# Proposal: Dual Monerium App Support (OAuth + White-Label)

Status: proposed implementation plan for a stacked PR on top of
[PR #1359](https://github.com/pendulum-chain/vortex/pull/1359) (`monerium-reintegration`).
Decision sought: run the Monerium OAuth application and the Monerium white-label
application in parallel for the EUR corridor, resolving the user's profile through the
white-label app first and the OAuth app second. Last updated: 2026-09-14.

Related material:

- [`Monerium Interface`](operations-monerium-interface.md)
- [`Monerium Integration (security spec)`](security-spec/05-integrations/monerium.md)
- [`Identity, Customer, and Partner Model`](architecture-identity-model.md)
- [`ADR-0005 Monerium B2B onramp`](adr-0005-monerium-b2b-onramp.md) (unaffected, uses the
  white-label client through its own attestor orchestration)

## Objective

Give users the EUR/SEPA rail back without white-label onboarding, which is blocked until
KYC sharing exists. At EUR ramp time Vortex resolves the authenticated user's Monerium
profile in this order:

1. the profile is visible to the **white-label** app (client credentials);
2. otherwise the profile is reachable through the **OAuth** app (the user's backend-held
   token);
3. otherwise the user is not onboarded and the client offers OAuth onboarding.

Both paths feed the same on-chain flow shipped by PR #1359 (mint to the user's linked EOA,
owner permit, self-transfer, Uniswap, Squid). Only the credential used to read profile,
linked address, and IBAN differs.

## Decisions already taken

| Topic | Decision |
|---|---|
| Difference between paths | Credential for the registration-time reads only. Execution never calls Monerium. |
| Wallet-address discovery | Not in scope. Detection uses the local binding's profile ID only. Address lookup would adopt a Monerium identity from a bare wallet address, which the spec forbids without an ownership proof. Can be added later behind a signed link-message proof. |
| Wallet link and IBAN for OAuth users | Vortex does it with the user's OAuth token: `POST /addresses` with a client-collected link signature, then `POST /ibans` (or a user-confirmed move). Link-at-login is no longer supported by Monerium (P2). The user never uses Monerium's own app. |
| Client scope | Dashboard, widget, SDK/direct API. |
| OAuth token storage | Backend memory only, as today. Legacy widget kept the token in the persisted ramp machine snapshot in `localStorage`; that does not return. |
| Recording the source | Runtime resolution on every registration, no schema change. After registration the persisted facts (profile, address, IBAN, baseline) make the source irrelevant. |

## Facts the plan relies on

- `createRegisterMoneriumIssue` (`apps/api/src/api/services/phases/blocks/phases/monerium-issue/registration.ts`)
  takes `resolveProfileId` and a client exposing `getProfile`, `listAddresses`, `listIbans`
  by dependency injection. Everything after profile resolution is credential-agnostic.
- The OAuth service (`apps/api/src/api/services/monerium/monerium.service.ts`) already
  caches access and rotating refresh tokens per legal entity, mirrors the profile into
  `provider_customers` (provider `monerium`, rail `eur`), and surfaces
  `MONERIUM_REAUTHENTICATION_REQUIRED` when the token is gone. The dashboard renders that
  code as a reconnect prompt.
- Both apps share one `provider_customers` row per entity. The white-label API has no
  email lookup, so "known to the white-label app" can only be tested with a profile ID.
- The legacy widget (removed in `32dc0a87c`) linked the wallet during OAuth login using
  `/auth?address=&chain=&signature=` and passed the token to the backend at registration.
  The on-chain design was the same permit-based self-transfer.
- Dashboard and widget both call `/v1/ramp/*` directly, hold a Supabase session for
  logged-in users, and already sign EIP-712 typed data with wagmi. The dashboard has the
  Monerium OAuth UI (`MoneriumKycFlow`, `/monerium/callback`) built on the shared
  `@vortexfi/kyc` Monerium machine; the widget has none (SEPA onboarding there is the
  legacy Mykobo form). The SDK EUR handler drops owner-signed transactions.

## Phase 0: sandbox probes (before code)

| Probe | Question | Effect on the plan |
|---|---|---|
| P1 | Does the white-label client see a profile onboarded through the OAuth app (`GET /profiles/{id}` with client credentials)? | If yes, step 1 of the resolution already covers OAuth users and the OAuth read adapter is only a fallback. If no, the fallback is the main path for every OAuth user. |
| P2 | With a user token from the OAuth app: are `GET /ibans?profile=`, `POST /ibans`, and `POST /addresses` permitted? Does `/auth?address&chain&signature` still link at login? | Decides whether Vortex can provision the IBAN itself and whether re-linking needs another authorize round trip. |
| P3 | Sandbox chain: legacy minted on `amoy` in sandbox. Confirm the #1359 flow's sandbox network and the chain used for IBAN and address filters agree. | Configuration only. |

Record the results in this document and in `operations-monerium-interface.md`.

Results so far (2026-09-14):

- P3: the #1359 flow is pinned to Polygon mainnet (`MoneriumIssue(Networks.Polygon)`, mainnet
  EURe, mainnet Uniswap pool) regardless of `SANDBOX_ENABLED`. Monerium sandbox profiles
  hold `amoy`/`sepolia` addresses, so a sandbox IBAN can never match at registration.
  Sandbox end-to-end ramps need either an Amoy variant of the flow or production-only
  verification; the API-level probes are unaffected.
- The sandbox "white-label" credentials and the older sandbox credentials from the B2B work
  resolve to the same Monerium application. It sees one partner-owned personal profile
  (pending) with the B2B forwarder addresses and IBAN.
- Monerium docs (API reference and white-label guide) do not state which token types may
  call `POST /ibans` and `POST /addresses`, and the legacy `/auth` link parameters
  (`address`, `chain`, `signature`) are no longer documented. Both need the live
  user-token probe.
- P2 (run 2026-09-14 with the partner account against the sandbox OAuth app "Vortex"):
  - The authorization-code exchange returns a 1-hour access token plus a refresh token.
  - `POST /addresses` with the **user** token links a new EOA (`201`, state `linked`).
  - The legacy link-at-login parameters (`address`, `chain`, `signature` on `/auth`) are
    ignored: the address was not linked. Vortex must link through `POST /addresses`.
  - `POST /ibans` with the user token reaches the business rule, not an auth error, and
    answers `400 IBAN already requested or provisioned for this profile`: **one IBAN per
    profile**. A second chain/address requires moving the IBAN (`PATCH /ibans/{iban}`),
    which the OAuth app is permitted to do ("Update IBANs").
  - The OAuth app's enabled permissions are Create wallet address, Read/Create/Update
    IBANs, and Create payments. It has no KYC permissions; KYC happens in Monerium's
    hosted flow.
  - Registered redirect URIs on the OAuth app: `http://localhost:5174/dashboard/monerium/callback`,
    `http://localhost:5473/widget`, `http://localhost:5473`, `http://localhost:5474/dashboard`,
    `http://localhost:5474`. A mismatch renders the authorization page empty with no error.
- P1 (run 2026-09-14 with a second sandbox user who signed up inside the OAuth flow via
  `auth_mode=signup`): **the white-label app cannot see OAuth-onboarded profiles.**
  `GET /profiles/{id}`, `GET /addresses?profile=`, and `GET /ibans?profile=` with client
  credentials answer `403 ... does not have access to profile ... with required scopes`,
  and the profile is absent from the white-label `GET /profiles` list and `/auth/context`.
  Only `GET /addresses/{address}` answers `200` for the user-linked address, so an address
  lookup can reveal which profile owns an address but cannot read that profile.
  Consequences: for OAuth users the user token is the only read path, at onboarding and at
  every registration; a lost backend token means reauthentication before ramping; the
  resolver order (white-label first, OAuth second) stands. On the fresh profile
  `POST /ibans` with the user token answered `202 Accepted`, confirming provisioning.

## Phase 1: API identity resolution

New module `apps/api/src/api/services/monerium/identity.ts`:

```
resolveMoneriumIdentity(userId, network, transaction)
  -> { profileId, source: "whitelabel" | "oauth", client: MoneriumReadClient }
```

1. Load the entity's `provider_customers` row (provider `monerium`, rail `eur`). No row or
   no `providerCustomerId` → `MONERIUM_ONBOARDING_REQUIRED`.
2. White-label: `MoneriumApiService.getProfile(profileId)`. Visible and `approved` →
   source `whitelabel`, client is the shared service. Not visible (404/403) → continue.
   Visible but not approved → reject as today.
3. OAuth: cached credentials for the entity → read `/profiles/{id}`, `/addresses`, `/ibans`
   with the user bearer token through a small adapter that validates responses with the
   shared zod schemas from `packages/shared/src/services/monerium/schemas.ts`. Approved →
   source `oauth`. No cached credentials → `MONERIUM_REAUTHENTICATION_REQUIRED`.

`createRegisterMoneriumIssue` replaces its `resolveProfileId` + `getClient` dependencies
with `resolveIdentity`; the destination matching, EOA check, baseline read, and facts stay
unchanged. The source is logged, not persisted.

Error contract on `POST /v1/ramp/register`: `MONERIUM_ONBOARDING_REQUIRED` and
`MONERIUM_REAUTHENTICATION_REQUIRED` become documented public error types (OpenAPI,
wire-contract snapshot, SDK error mapping).

Tests: resolver order with fakes for both clients; registration tests for each source;
hermetic contract coverage for the user-token read schemas.

## Phase 2: API onboarding and readiness

1. `POST /v1/monerium/oauth/start` accepts a `client` selector (`dashboard`, the default, or
   `widget`). The redirect URI comes from an allowlist (`MONERIUM_REDIRECT_URI`,
   `MONERIUM_WIDGET_REDIRECT_URI`; the widget flow is refused with `503` when the latter is
   unset) and is bound into the OAuth transaction exactly as today. Both URIs are registered
   with Monerium. Link-at-login is dead (P2), so the start request carries no wallet
   parameters.
2. Wallet link, `POST /v1/monerium/wallet` (bearer session, no impersonation): body
   `{ address, chain, signature }` where `signature` is the user's EOA signature over the
   fixed link message. The backend verifies it with viem `verifyMessage`, rejects addresses
   with deployed code (the permit needs an EOA), resolves the profile through the identity
   resolver, links through whichever app can read it (`POST /addresses`, skipped when already
   linked), and then handles the profile's single IBAN (P2): none → `POST /ibans` and
   `iban: "pending"` (Monerium's "already requested" `400` also maps to `pending`); present
   on that address and chain → `provisioned`; present elsewhere → `elsewhere`.
3. IBAN move, `POST /v1/monerium/iban/move` with `{ address, chain }`: moves the single
   IBAN (`PATCH /ibans/{iban}`) to an address already linked on that chain. It exists only as
   an explicit owner action because it redirects the user's future SEPA deposits; nothing
   else moves an IBAN.
4. Readiness: `GET /v1/monerium/status` adds, for approved profiles,
   `ramp: { source, linkedAddress, chain, iban: "provisioned" | "elsewhere" | "missing" }`
   measured against the chain the active onramp mints on (`MONERIUM_RAMP_CHAIN`, Polygon),
   or `rampError: { code: "MONERIUM_REAUTHENTICATION_REQUIRED", message }` when the live
   read needs an OAuth session that is gone (a persisted approval stays readable). The
   Monerium account entry of `GET /v1/onboarding/status` carries the same `ramp` object
   (`null` elsewhere; a lost session surfaces through the existing `error` field). Status
   reads never mutate provider state. Nothing is persisted; Monerium stays authoritative.

Managed children, quote simulation, execution, and the B2B onramp are unchanged.

## Phase 3: dashboard

- EU corridor card reads `ramp` readiness. Approved without a linked wallet or IBAN shows a
  "Link wallet" step: connect wallet, sign the link message, call `POST /v1/monerium/wallet`,
  then poll status until the IBAN is `provisioned` (or confirm a move through
  `POST /v1/monerium/iban/move` when it is `elsewhere`).
- Transfer machine, EUR BUY: the connected wallet must equal `ramp.linkedAddress` before
  registration; the owner permit is signed with the existing `signMultipleTypedData`;
  `updateRamp` carries ephemeral presigns plus the permit; `ibanPaymentData` from the
  response renders the SEPA instructions; then `startRamp`.
- `MONERIUM_REAUTHENTICATION_REQUIRED` from registration reopens the reconnect prompt and
  retries registration afterwards.

## Phase 4: widget

- SEPA/EUR verification routes to a Monerium step built on the shared `@vortexfi/kyc` machine
  behind the existing Supabase OTP login. The Mykobo child stays in the codebase for persisted
  legacy flows only.
- Authorization opens as top-level navigation when the widget is the top document and in a new
  tab when embedded (with an "I have finished" re-check). Monerium returns to the registered
  `/widget` callback; `useSetRampUrlParams` hands `code`/`state` (or `error`) to the persisted
  ramp, which restarts the restored Monerium step with the callback, then drops the params.
- A second widget machine links the connected EVM wallet after approval through
  `POST /v1/monerium/wallet` using the existing message-signature callback, polls readiness until
  the IBAN is provisioned, and asks before moving an IBAN that sits elsewhere. Substrate wallets
  are refused because the onramp needs the EOA permit.
- EUR BUY registration sends the connected wallet as `walletAddress`; the existing user-signing
  actor already signs the owner permit and the summary step already renders `ibanPaymentData`.

## Phase 5: SDK and direct API

- `EurHandler` (renamed from `MykoboHandler`) registers the Monerium onramp with
  `{ destinationAddress, walletAddress }`, signs only the ephemeral-owned transactions, and
  `VortexSdk.registerRamp` returns the owner permit in `unsignedTransactions` for the linked
  wallet to sign through `submitUserTransactions`; `updateRamp` explains that for SEPA BUY.
  The legacy Mykobo SELL adapter stays for persisted flows.
- `MONERIUM_ONBOARDING_REQUIRED` and `MONERIUM_REAUTHENTICATION_REQUIRED` map to
  `MoneriumOnboardingRequiredError` and `MoneriumReauthenticationRequiredError`.
- README, `ARCHITECTURE.md`, the API pages, and the integration skill drop the
  "direct API only" caveat and document the onboarding prerequisite (dashboard or widget).

## Phase 6: documentation and security spec

- `security-spec/05-integrations/monerium.md`: invariants for the resolution order, the
  server-side link-signature verification, the EOA requirement at link time, the redirect
  allowlist, the unchanged memory-only token rule, and the still-forbidden caller-supplied
  profile identity. The "Deferred OAuth" sections become the active description.
- `RISK-REGISTER.md`: OAuth-app profiles that the white-label app cannot see remain
  dependent on backend token presence; migration between apps is still undefined.
- `operations-monerium-interface.md`, API pages, OpenAPI, and wire-contract snapshot.

## Commit slices

One stacked PR, one logical commit per phase: probe results (docs), API resolver and
adapter, API onboarding and readiness, dashboard, widget, SDK, docs and security spec.

## Open items

- Token persistence: with P1 answered, every OAuth-user registration depends on a cached
  backend token. Memory-only is the current decision; an encrypted refresh-token store is
  the alternative if reauthentication prompts prove too frequent.
- Embedded-widget authorization strategy (new tab versus popup) once the embed contract is
  checked.
- Whether the dormant Mykobo widget form is removed in this PR or later.
