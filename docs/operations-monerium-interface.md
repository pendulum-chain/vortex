# Monerium Interface

## Monerium White-Label API

All white-label calls are server-to-server using `client_credentials`. ([Whitelabel: Authentication](https://docs.monerium.com/whitelabel#authentication))

The Vortex transport is `packages/shared/src/services/monerium/moneriumApiService.ts`. The active
backend EUR BUY flow uses it during registration to resolve an existing approved profile and its
Polygon address/IBAN destination. The client caches client-credential tokens in memory, requests API
v2, retries once after `401`, and applies a 10-second timeout to every call. Credentials use
`MONERIUM_WHITELABEL_CLIENT_ID` and `MONERIUM_WHITELABEL_CLIENT_SECRET`.
Production startup requires both values so an enabled EUR corridor cannot serve quotes while every
registration is guaranteed to fail authentication.

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

The backend API accepts new EUR BUY quotes and registrations. A user is corridor-ready only when
operations has already provisioned all of the following:

- an approved Vortex `provider_customers` binding for provider `monerium`, rail `eur`, and the
  authenticated legal entity;
- the same profile still reports `approved` through the white-label API;
- exactly one existing Polygon IBAN whose mint destination is an EOA linked to that profile; and
- access to that EOA so the API client can collect the exact ERC-2612 permit returned at registration.

Both individual and business legal entities may use the backend flow when they meet those
preconditions. The first-party SDK, dashboard, and widget do not yet complete the linked-owner permit
journey, so this release does not claim EUR availability through those clients. A direct API client
must sign the user-owned permit, sign the ephemeral-owned transactions, submit all signatures through
`POST /v1/ramp/update`, make the SEPA transfer using the released instructions, and then call
`POST /v1/ramp/start`.

This release intentionally does not create or import a Monerium profile, connect a wallet, provision
or move an IBAN, reconcile KYC/KYB lifecycle state, create user-to-corridor bindings, or support EUR
SELL. Those capabilities remain deferred even where the shared white-label client maps the underlying
provider endpoint.

## Deferred Profile Sources

Profiles may eventually be created directly through the white-label API or imported. One expected
source is a sibling Monerium authorization-code/PKCE application that Vortex operates for KYC/KYB
onboarding; other trusted external sources are also possible. The migration/import process,
persistence model, and status reconciliation are not yet defined.

## Deferred KYC/KYB Profile Lifecycle

Monerium does not expose a separate KYC/KYB case or attempt ID. The profile UUID created by
`POST /profiles` is the durable workflow identity; its `kind` is immutable, and details, form data,
and verifications are sections of that same profile. How the OAuth and white-label paths represent
that workflow in `provider_customers` and `kyc_cases` remains part of the TBD migration design.

| Profile state | Meaning and next action |
|---|---|
| `created` | No data has been submitted. Submit the required profile sections using the same profile UUID. |
| `incomplete` | The profile is resumable. Inspect section states and `profile.error`, correct or add the requested data, and resubmit the affected `/share`, `/details`, `/form`, or `/verifications` operation against the same profile UUID. |
| `pending` | Monerium is reviewing the profile. Further submissions are blocked; wait for `profile.updated` to move it to `approved`, `rejected`, or back to `incomplete`. Do not create another profile or retry blindly. |
| `approved` | KYC/KYB is complete and Monerium services are available. Further section updates return `409`. |
| `rejected` | Final compliance rejection. Do not retry or create a replacement profile unless Monerium explicitly authorizes a new onboarding. |

The current shared client implements profile reads but not `POST /profiles` or the onboarding
`POST`/`PATCH` operations above. The active ramp only verifies an already-bound profile. Lifecycle
orchestration and imported-profile handling remain deferred.

## Deferred Address And IBAN Management

The operations below describe mapped provider capabilities. Active ramp registration uses only the
list/read operations and fails closed unless the required Polygon destination already exists. It does
not call `POST /addresses`, `POST /ibans`, or `PATCH /ibans/{iban}`.

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
2. Registration derives the profile UUID from the authenticated legal entity's approved local
   binding; caller-supplied profile, address, or IBAN identity is rejected.
3. Vortex requires the live profile to be `approved` and resolves exactly one existing Polygon EOA
   and IBAN with the same mint destination. No provider resource is created or moved.
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

## Deferred Provider Webhooks

The active onramp does not expose a Monerium webhook receiver and does not use provider events for
settlement attribution. The shared client can manage the subscriptions below for contract testing
and future lifecycle/order reconciliation work.

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
