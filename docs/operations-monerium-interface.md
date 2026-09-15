# Monerium Interface

## Monerium White-Label API

All white-label calls are server-to-server using `client_credentials`; users remain entirely within Vortex. ([Whitelabel: Authentication](https://docs.monerium.com/whitelabel#authentication))

The Vortex transport is `packages/shared/src/services/monerium/moneriumApiService.ts` — the single
Monerium transport in the repo. The active backend EUR BUY flow uses it during registration to
resolve an existing approved profile and its Polygon address/IBAN destination, and the Monerium B2B
onramp consumes it through the narrow adapter `apps/api/src/api/services/monerium-b2b/monerium-api.ts`.
The client caches client-credential tokens in memory, requests API v2, retries once after `401`, and
applies a 10-second timeout to every call. Credentials use `MONERIUM_WHITELABEL_CLIENT_ID` and
`MONERIUM_WHITELABEL_CLIENT_SECRET`. Production startup requires both values so an enabled EUR
corridor cannot serve quotes while every registration is guaranteed to fail authentication.

| Operation | Endpoint / sequence | Commentary | Source |
|---|---|---|---|
| Authenticate | `POST /auth/token` | Send `grant_type=client_credentials`, `client_id`, `client_secret`. Token expires after 1 hour. | [Whitelabel: Authentication](https://docs.monerium.com/whitelabel#authentication) |
| Check user status | `GET /profiles/{profileId}` | Returns top-level state: `created`, `incomplete`, `pending`, `approved`, or `rejected`. | [API: Profile](https://docs.monerium.com/api/#tag/profiles/operation/profile) |
| Check KYC/KYB status | `GET /profiles/{profileId}` | Inspect `state`, `details.state`, `form.state`, and each `verifications[].state`. This is the relevant KYC/KYB status interface. | [API: Profile](https://docs.monerium.com/api/#tag/profiles/operation/profile) |
| List/search users | `GET /profiles?state=&kind=` | Only documented filters are `state` and `kind` (`personal`/`corporate`). No email, IBAN, name, or address filter. | [API: Profiles](https://docs.monerium.com/api/#tag/profiles/operation/profiles) |
| Find user by IBAN | `GET /ibans/{iban}` then `GET /profiles/{profileId}` | The IBAN response contains its owning `profile` UUID. | [API: IBAN](https://docs.monerium.com/api/#tag/ibans/operation/iban) |
| Find user by address | `GET /addresses/{address}` then `GET /profiles/{profileId}` | Address response contains the owning `profile` UUID. | [API: Address](https://docs.monerium.com/api/#tag/addresses/operation/address) |
| Get user information | `GET /profiles/{profileId}` | Returns profile identity, type, name, and compliance states. It does **not** expose the submitted personal/corporate details such as email or address. | [API: Profile](https://docs.monerium.com/api/#tag/profiles/operation/profile) |
| Monitor status changes | `profile.updated` webhook | Preferred over polling. `profile.error` is opt-in and reports rejected ingestion fields. | [Whitelabel: Monitor approval](https://docs.monerium.com/whitelabel#5-monitor-approval), [Whitelabel: Event types](https://docs.monerium.com/whitelabel#event-types) |

## Current Vortex Release Boundary

The backend API accepts new EUR BUY quotes and registrations. A user is corridor-ready when all of
the following hold ([adr-0006](adr-0006-monerium-dual-app.md)):

- a Vortex `provider_customers` binding for provider `monerium`, rail `eur`, and the authenticated
  legal entity carries the Monerium profile UUID;
- that profile reports `approved`, read through the white-label API when it can see the profile
  and otherwise through the user's backend-held OAuth token;
- exactly one Polygon IBAN whose mint destination is an EOA linked to that profile; and
- the ramping client controls that EOA so it can sign the exact ERC-2612 permit returned at
  registration.

Users reach that state in one of two ways: operations provisions them into the white-label
application out of band, or they complete Monerium OAuth onboarding in the dashboard or widget and
then link the wallet they will pay in with (`POST /v1/monerium/wallet`), which lets Vortex link the
EOA and request or move the profile's single IBAN. Both individual and business legal entities are
eligible. The SDK, dashboard, and widget sign the owner permit and the ephemeral-owned transactions,
submit them through `POST /v1/ramp/update`, show the released SEPA instructions, and call
`POST /v1/ramp/start` after the transfer; a direct API client does the same itself. Readiness is
reported on `GET /v1/monerium/status` (`ramp`) and on the Monerium account of
`GET /v1/onboarding/status`.

Configuration (`apps/api/src/config/vars.ts`, samples in `apps/api/.env.example`):

| Variable | Purpose |
|---|---|
| `MONERIUM_API_URL` | Monerium API base (`https://api.monerium.dev` sandbox, `https://api.monerium.app` production). |
| `MONERIUM_CLIENT_ID` | OAuth authorization-code app used by the dashboard and widget onboarding. |
| `MONERIUM_REDIRECT_URI` / `MONERIUM_WIDGET_REDIRECT_URI` | Exact callback URIs registered with Monerium for the dashboard and the widget (`/widget` on the frontend origin); a mismatch renders Monerium's authorization page blank. The widget URI is optional and disables widget OAuth when unset. |
| `MONERIUM_WHITELABEL_CLIENT_ID` / `MONERIUM_WHITELABEL_CLIENT_SECRET` | White-label client credentials (also the B2B onramp). |
| `MONERIUM_ISSUE_FEE_EUR` | Flat EUR fee subtracted from each issue quote; required in production and must not default silently. |

This release does not create profiles through the white-label API, import external profiles,
migrate OAuth profiles into the white-label application, orchestrate KYC/KYB lifecycle state
through the white-label API, or support EUR SELL. Those capabilities remain deferred even where the
shared client maps the underlying provider endpoint.

## Profile Sources

- **Monerium OAuth application.** Users verify in Monerium's hosted flow; Vortex keeps their
  access and refresh tokens in backend memory only and mirrors the profile into
  `provider_customers` and `kyc_cases`. The white-label application cannot see these profiles, so
  every read for them uses the user's token; a lost session surfaces as
  `MONERIUM_REAUTHENTICATION_REQUIRED` until the user reconnects.
- **White-label application.** Profiles it can see (provisioned out of band today) are read with
  client credentials; no user session is needed.
- **Other imports** and the migration of OAuth profiles into the white-label application are not
  defined.

## KYC/KYB Profile Lifecycle

Monerium does not expose a separate KYC/KYB case or attempt ID. The profile UUID created by
`POST /profiles` is the durable workflow identity; its `kind` is immutable, and details, form data,
and verifications are sections of that same profile. The legacy OAuth onboarding mirrors one
`kyc_cases` row per Monerium `provider_customers` row and leaves `provider_case_id` unset; repeated
submissions and status changes update that row rather than creating a new local case. How the
white-label path represents that workflow in `provider_customers` and `kyc_cases` remains part of
the TBD migration design.

| Profile state | Meaning and next action |
|---|---|
| `created` | No data has been submitted. Submit the required profile sections using the same profile UUID. |
| `incomplete` | The profile is resumable. Inspect section states and `profile.error`, correct or add the requested data, and resubmit the affected `/share`, `/details`, `/form`, or `/verifications` operation against the same profile UUID. |
| `pending` | Monerium is reviewing the profile. Further submissions are blocked; wait for `profile.updated` to move it to `approved`, `rejected`, or back to `incomplete`. Do not create another profile or retry blindly. |
| `approved` | KYC/KYB is complete and Monerium services are available. Further section updates return `409`. |
| `rejected` | Final compliance rejection. Do not retry or create a replacement profile unless Monerium explicitly authorizes a new onboarding. |

The current shared client implements profile reads but not `POST /profiles` or the onboarding
`POST`/`PATCH` operations above; OAuth-onboarded users complete them in Monerium's hosted flow.
The active ramp only verifies an already-bound profile. Externally imported profiles would enter
Vortex directly as `approved`; lifecycle orchestration through the white-label API and
imported-profile handling remain deferred.

## Address And IBAN Management

Vortex uses the write operations below on the user's behalf through `POST /v1/monerium/wallet`
(link the connected EOA after verifying its signature over the fixed message, then request the
profile's single IBAN when none exists) and `POST /v1/monerium/iban/move` (move the IBAN to an
already-linked address on the owner's explicit request), each through the app that can read the
profile. Ramp registration and status reads use only the list/read operations and fail closed
unless the required Polygon destination already exists. The B2B onramp links its forwarder
addresses and requests their IBANs under its own orchestration
([architecture-monerium-b2b-onramp.md](architecture-monerium-b2b-onramp.md)).

| Operation | Endpoint / sequence | Commentary | Source |
|---|---|---|---|
| List all addresses | `GET /addresses?profile={profileId}` | Returns every address and its connected `chains[]`. Optional `chain` filter. | [API: Addresses](https://docs.monerium.com/api/#tag/addresses/operation/addresses) |
| Inspect one address | `GET /addresses/{address}` | Returns owner profile and connected chains. | [API: Address](https://docs.monerium.com/api/#tag/addresses/operation/address) |
| Connect address | `POST /addresses` | Submit `profile`, `address`, `chain`, fixed message, and ownership signature. | [Whitelabel: Link wallet](https://docs.monerium.com/whitelabel#link-wallet) |
| Ownership message | `I hereby declare that I am the address owner.` | Must be exact. EOA uses a 65-byte signature. Smart wallets use EIP-1271, either off-chain signatures or on-chain approval. | [Whitelabel: Link wallet](https://docs.monerium.com/whitelabel#link-wallet), [Whitelabel: EIP-1271](https://docs.monerium.com/whitelabel#eip-1271) |
| Change address | Link the new address, then `PATCH /ibans/{iban}` | There is no documented address update, reassignment, unlink, or delete endpoint. The old address remains connected. | [API: Addresses](https://docs.monerium.com/api/#tag/addresses), [Whitelabel: Move an IBAN](https://docs.monerium.com/whitelabel#move-an-iban) |
| Determine default address | `GET /ibans?profile={profileId}` | “Default” belongs to the IBAN: its `address` and `chain` are the default mint destination. There is no profile-level default-address field. | [API: IBANs](https://docs.monerium.com/api/#tag/ibans/operation/ibans), [Whitelabel: Incoming payments](https://docs.monerium.com/whitelabel#incoming-payments) |
| Change default destination | `PATCH /ibans/{iban}` with `{address, chain}` | Future incoming payments mint to the new destination. The destination must be linked to the profile. | [Whitelabel: Move an IBAN](https://docs.monerium.com/whitelabel#move-an-iban) |

### Off-chain EIP-1271 ownership

Off-chain EIP-1271 uses the same `POST /addresses` operation; there is no additional Vortex or
Monerium endpoint. Wallet owners collect signatures externally over the exact ownership message,
then assemble the contract-specific combined signature bytes. Vortex sends those bytes unchanged
in `signature`. Monerium immediately calls `isValidSignature(messageHash, signature)` and links the
address with `201` when the contract returns the EIP-1271 magic value.

The public documentation demonstrates Safe's `createMessage`, `SigningMethod.ETH_SIGN`, and
`buildSignatureBytes` flow, but does not specify a generic byte-level `messageHash` derivation for
arbitrary smart wallets. The shared client therefore must not hash, split, recover, reorder, or
otherwise reinterpret the combined signature. Signature assembly remains the wallet owners' or
wallet integration's responsibility.

For contrast, the on-chain EIP-1271 path submits `"0x"` and returns `202` while Monerium polls for
the on-chain approval. Vortex's intended integration is the immediate off-chain path, while the
client preserves both documented response semantics.

## Active On-Ramp: SEPA To EURe

1. Quote simulation selects the fixed Polygon EURe route without reading Monerium identity.
2. Registration derives the profile UUID from the authenticated legal entity's local binding and
   reads it through the white-label app or, when that app cannot see it, the user's OAuth token;
   caller-supplied profile, address, or IBAN identity is rejected.
3. Vortex requires the live profile to be `approved` and resolves exactly one existing Polygon EOA
   and IBAN with the same mint destination. Registration creates or moves no provider resource;
   the wallet-link step did that earlier.
4. Vortex snapshots the owner's EURe balance and prepares the owner permit, the ephemeral
   `transferFrom`, and all downstream route transactions.
5. `POST /v1/ramp/update` validates the complete signature set before releasing
   `ibanPaymentData`. The user then initiates the SEPA payment and calls `POST /v1/ramp/start`.
6. Incoming SEPA funds automatically create an `issue` order and mint EURe to the IBAN-linked owner.
   No Vortex or Monerium API call starts the incoming payment. ([Whitelabel: Incoming payments](https://docs.monerium.com/whitelabel#incoming-payments))
7. The current executor advances when the owner's EURe balance reaches the persisted baseline plus
   the quoted post-fee amount. It transfers only that quoted amount to the ephemeral, converts it to
   Polygon USDC, distributes fees, and uses Squid for the supported non-Polygon EVM destination.

The current executor does not correlate a Monerium issue order or webhook to the ramp. Balance-delta
attribution and permit expiry are accepted release limitations recorded in the security risk register.

## Provider On-Ramp Sequence: SEPA to EURe

Reference sequence for provider-managed provisioning. The B2B onramp follows it under its own
orchestration; the active direct-API ramp performs only the read steps.

1. Confirm `GET /profiles/{profileId}` returns `approved`. ([API: Profile](https://docs.monerium.com/api/#tag/profiles/operation/profile))
2. List or connect an address using `GET/POST /addresses`. ([Whitelabel: Link wallet](https://docs.monerium.com/whitelabel#link-wallet), [API: Addresses](https://docs.monerium.com/api/#tag/addresses/operation/addresses))
3. Retrieve existing IBAN using `GET /ibans?profile={profileId}`. ([API: IBANs](https://docs.monerium.com/api/#tag/ibans/operation/ibans))
4. If none exists, call `POST /ibans` with `{address, chain}`. ([Whitelabel: Request IBAN](https://docs.monerium.com/whitelabel#request-iban))
5. Wait for `iban.updated`; provisioning is asynchronous. ([Whitelabel: Retrieve the IBAN](https://docs.monerium.com/whitelabel#retrieve-the-iban))
6. Give the IBAN to the user. ([Whitelabel: EUR IBAN](https://docs.monerium.com/whitelabel#eur-iban))
7. Incoming SEPA funds automatically create an `issue` order and mint EURe to the IBAN’s linked address. ([Whitelabel: Incoming payments](https://docs.monerium.com/whitelabel#incoming-payments))
8. Monitor `order.created` and `order.updated`. ([Whitelabel: Monitor orders](https://docs.monerium.com/whitelabel#monitor-orders))

No API call starts an incoming payment. It is passive. ([Whitelabel: Incoming payments](https://docs.monerium.com/whitelabel#incoming-payments))

A sender can override the destination for one payment using memo: ([Whitelabel: Routing with memo](https://docs.monerium.com/whitelabel#routing-with-memo))

```text
<chain>:<linked-address>
```

The address must already be linked to that profile. ([Whitelabel: Routing with memo](https://docs.monerium.com/whitelabel#routing-with-memo))

## Deferred Off-Ramp: EURe To SEPA

New EUR SELL quotes are rejected. The sequence below is provider reference material for a future
implementation; the shared client mapping does not make it an active Vortex ramp.

1. Ensure the source wallet is linked and holds EURe. ([Whitelabel: SEPA payment](https://docs.monerium.com/whitelabel#sepa-payment))
2. Construct and sign: ([Whitelabel: Signing an order](https://docs.monerium.com/whitelabel#signing-an-order))

```text
Send EUR <amount> to <IBAN> at <RFC3339-minute>
```

3. Call `POST /orders` with: ([Whitelabel: SEPA payment](https://docs.monerium.com/whitelabel#sepa-payment))
   - `kind: "redeem"`
   - source `address` and `chain`
   - `currency: "eur"` and `amount`
   - recipient IBAN and individual/company details
   - exact `message` and `signature`
4. Monitor `order.updated` until `processed` or `rejected`. ([Whitelabel: Monitor orders](https://docs.monerium.com/whitelabel#monitor-orders))
5. For amounts of €15,000 or more, first upload supporting evidence using `POST /files` and provide `supportingDocumentId`. ([Whitelabel: SEPA payment](https://docs.monerium.com/whitelabel#sepa-payment))

The signed message may contain either the full IBAN or Monerium's deterministic shortened form
(`EE52...1285`, first four and last four characters). The request counterpart always contains the
full normalized IBAN.

## Quoting

There is **no documented quote endpoint for standard EUR on-ramp or SEPA off-ramp orders**. ([API: Orders](https://docs.monerium.com/api/#tag/orders), [Swap: Get a quote](https://docs.monerium.com/swap#get-a-quote))

Monerium has `GET /swap/{chain}/{sellToken}/{buyToken}` and `POST /swap/accept`, but this is a separate preview token-swap feature, currently documented for sandbox USDC/EURe on Arbitrum Sepolia. It should not be treated as the on/off-ramp quote API. ([Swap: Preview configuration](https://docs.monerium.com/swap#preview-configuration), [Swap: Get a quote](https://docs.monerium.com/swap#get-a-quote), [Swap: Accept the quote](https://docs.monerium.com/swap#accept-the-quote))

## Provider Webhooks

The active direct-API onramp does not expose a Monerium webhook receiver and does not use provider
events for settlement attribution. The B2B onramp registers its own HMAC-verified receiver for
`iban.updated` and `order.updated` ([security-spec/05-integrations/monerium-b2b.md](security-spec/05-integrations/monerium-b2b.md)).
The shared client can manage the subscriptions below for contract testing and future
lifecycle/order reconciliation work.

Register with `POST /webhooks`: ([Whitelabel: Webhooks](https://docs.monerium.com/whitelabel#webhooks))

| Event | Purpose | Source |
|---|---|---|
| `profile.updated` | KYC/KYB status changes | [API: Profile updated webhook](https://docs.monerium.com/api/#tag/webhooks/operation/webhook-profile-updated) |
| `profile.error` | Invalid submitted profile fields | [API: Profile error webhook](https://docs.monerium.com/api/#tag/webhooks/operation/webhook-profile-error) |
| `iban.updated` | IBAN provisioned or moved | [API: IBAN updated webhook](https://docs.monerium.com/api/#tag/webhooks/operation/webhook-iban-updated) |
| `order.created` | Incoming payment detected | [API: Order created webhook](https://docs.monerium.com/api/#tag/webhooks/operation/webhook-order-created) |
| `order.updated` | Payment processed or rejected | [API: Order updated webhook](https://docs.monerium.com/api/#tag/webhooks/operation/webhook-order-updated) |

The shared client also maps `GET /webhooks` and `PATCH /webhooks/{subscription}` so contract tests
and operations can inspect and deactivate subscriptions. The current API does not document a
webhook delete operation.

## Contract Tests

`apps/api/src/tests/contracts/monerium.contract.test.ts` validates the consumed request and
response schemas hermetically on every run. `RUN_LIVE_TESTS=1` enables the prepared sandbox checks.
Read-only checks can list profiles, addresses, IBANs, and orders; fixture IDs enable corresponding
single-resource reads. Every mutating flow has a separate `MONERIUM_CONTRACT_RUN_*` gate because it
creates persistent sandbox state or, for an order, can move sandbox EURe. Monerium is not added to
the nightly workflow until white-label sandbox credentials and known fixtures are provisioned.

Sources: [White-label guide](https://docs.monerium.com/whitelabel), [API reference](https://docs.monerium.com/api).
