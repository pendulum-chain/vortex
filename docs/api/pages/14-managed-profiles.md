# Managed Profiles

Managed profiles let a platform onboard and operate Vortex accounts for its own customers without those customers ever touching a Vortex UI, login, or email flow. The platform's Vortex profile acts as the **manager**; each customer becomes a headless **managed child** profile that the manager creates, onboards through KYC/KYB, and ramps on behalf of.

Use managed profiles when interactive signup is unavailable or undesirable — a B2B platform embedding cross-border payouts, a fintech onboarding its verified user base, or an operations backend running ramps for corporate sub-accounts. Provision one genuine child per real individual or business; never share one child between customers.

Managed profiles are optional. If each customer can own a normal Vortex profile and authenticate with their own session or API credential, use a standalone profile instead: API-driven onboarding, a custom UI, and the full ramp lifecycle all work without manager status, and the EUR corridor requires a standalone profile. Manager status is only for platforms that must own the customer's Vortex identity.

This page is the integration walkthrough. The exact authorization contract — every check Vortex performs, edge-case semantics, and error codes — lives in [Authentication And API Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys) and is authoritative where the two overlap.

## Prerequisites

Manager status is granted by Vortex, not self-service. During partner onboarding, Vortex enables your profile as a managed-profile manager and assigns:

- **Allowed corridors** — the countries (`BR`, `AR`, `CO`, `MX`, `US`, `EU`) your children may operate in.
- **Optional customer-type narrowing** — restrict children to `individual` or `business`; a null policy allows both wherever the corridor's canonical capability matrix does.

Every delegated operation re-checks this policy at request time, so a corridor removed from your manager record immediately blocks new mutations for children in that corridor (in-flight ramps continue). Automated EUR onboarding and provider binding are not available for managed children. A non-technical child that operations has already provisioned with an approved EUR provider binding, Polygon EOA, and IBAN may use the direct-API EUR BUY flow when the manager policy allows that corridor. The `EU` corridor also covers the dedicated business EUR onramp account surface (`GET /v1/monerium-b2b/account` and `GET /v1/monerium-b2b/deposits` under delegation or a child credential), available to business children whose accounts Vortex provisions during partner onboarding. The account response carries the child's IBAN, status and fee policy (`targetPpm` and `floorPpm`, parts per million below the reference rate), and each deposit is returned as its full lifecycle snapshot, the same object the [`DEPOSIT_UPDATED` webhook](https://api-docs.vortexfinance.co/webhooks) pushes. To read every child's account in one call, use `GET /v1/monerium-b2b/accounts` with your manager key and no `X-Managed-Profile-Id` header; filter by `moneriumProfileId` to find one client by the EUR provider's profile ID. To onboard a new business client, register its payout wallet with `POST /v1/monerium-b2b/accounts` (see [Register A Business EUR Client](#register-a-business-eur-client)); the account then appears in the list above and in the `ACCOUNT_UPDATED` webhook. An account converts payments only once it is `active`, and its IBAN can be issued earlier, so hand a client its IBAN once its account is active. EUR, including this business account surface, is available in sandbox; production activation is pending.

## Create A Managed Child

Authenticate with your manager profile's secret key (`X-API-Key`) or Supabase Bearer session. A public `pk_*` key is insufficient, and a child-owned credential can never manage other children.

```http
POST /v1/managed-profiles
X-API-Key: sk_live_...
Content-Type: application/json

{
  "externalSubjectId": "customer-4711",
  "customerType": "individual",
  "contactEmail": "customer-4711@platform.example"
}
```

- `externalSubjectId` is your immutable identifier for this subject, unique within your manager scope — it doubles as an idempotency key. Retrying an identical request returns `200` with the existing child instead of `201`.
- `customerType` is immutable (`individual` or `business`) and gates which corridor flows the child may use later.
- `contactEmail` is normalized, immutable, unique among your children, and used for provider customer creation. It never becomes a login identity — children have no Supabase account, OTP, or claiming lifecycle. Supply an address you are authorized to use.

```json
{
  "managedProfile": {
    "profileId": "00000000-0000-0000-0000-000000000002",
    "externalSubjectId": "customer-4711",
    "customerType": "individual",
    "contactEmail": "customer-4711@platform.example",
    "status": "active",
    "creationSource": "manager",
    "deletedAt": null,
    "createdAt": "2026-08-19T12:00:00.000Z",
    "updatedAt": "2026-08-19T12:00:00.000Z"
  }
}
```

`profileId` is the value you pass as `X-Managed-Profile-Id` in every delegated call. Persist the pair (`externalSubjectId`, `profileId`) in your system of record.

Lifecycle endpoints: `GET /v1/managed-profiles` lists children (`status=active|deleted|all`, `limit=1..100`, `offset`; defaults `active`, `50`, `0`); `GET /v1/managed-profiles/{profileId}` reads one; `DELETE /v1/managed-profiles/{profileId}` logically deletes it — idempotent `204`, revokes the child's credentials, blocks new activity, and preserves compliance and financial history. A deleted child's `externalSubjectId` and `contactEmail` stay reserved and cannot seed a replacement.

## Two Ways To Act For A Child

**Delegation header (recommended).** Your manager credential plus a selector:

```http
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
```

You remain the authenticated actor; ownership, KYC/provider identity, and ramp history resolve from the child. Vortex verifies the active manager, the direct active relationship, the child's entity layout, and corridor/type policy on every request. An invalid selector — another manager's child, a deleted child, a disallowed corridor mutation — returns `403 MANAGED_PROFILE_ACCESS_DENIED`.

**Child-owned credentials.** Issue the child its own key pair when a subsystem should act as the child directly, without the header:

```http
POST /v1/managed-profiles/00000000-0000-0000-0000-000000000002/api-credentials
X-API-Key: sk_live_...
```

The response is the standard credential resource — the secret value is returned exactly once; store it immediately. `GET .../api-credentials` lists them without secrets; `DELETE .../api-credentials/{credentialId}` revokes one. A child credential authenticates as the child without any selector, but every use still requires your manager relationship to be active and applies your current corridor/type policy — and it cannot select any other child.

One deliberate exception: `POST /v1/brl/kyc/import-token` (the Sumsub share-token import) rejects direct child credentials with `403`. Only the controlling manager may import, using the delegation header.

## Onboard A Child

Onboarding is corridor-specific. Discover the flow with `GET /v1/onboarding/requirements?country=<XX>&customerType=<type>` and follow the behavioral rules in [Fiat Corridors](https://api-docs.vortexfinance.co/fiat-corridors); every referenced operation accepts the delegation header, subject to your corridor policy. Track progress with `GET /v1/onboarding/status` under the same header.

Worked example — Brazilian individual via Sumsub share-token import, the fastest path when your platform already verifies users with Sumsub:

```http
POST /v1/brl/createSubaccount
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
Content-Type: application/json

{ "accountType": "INDIVIDUAL", "name": "Ana Maria Silva", "taxId": "52998224725" }
```

```http
POST /v1/brl/kyc/import-token
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
Idempotency-Key: kyc-import-customer-4711-01
Content-Type: application/json

{ "importToken": "<opaque-sumsub-share-token>", "consentAttested": true }
```

Then poll `GET /v1/onboarding/status` (with the header) until the corridor reports approval. Order matters: **import the token before any KYC status read for that child** — the first status read on a fresh account permanently selects the standard verification method, after which token import returns `409`. The token itself must be generated for the provider's configured Sumsub recipient; see the import section of [Fiat Corridors](https://api-docs.vortexfinance.co/fiat-corridors) for the full retry, consent, and secret-handling rules.

## Ramp On Behalf Of A Child

Once the child's KYC/KYB is approved, the entire ramp lifecycle accepts the delegation header — quote creation; ramp register, update, start, status, history, and errors; exact limits and sanitized ramp info:

```http
POST /v1/quotes
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
Content-Type: application/json

{
  "rampType": "BUY",
  "from": "pix",
  "to": "polygon",
  "inputAmount": "150",
  "inputCurrency": "BRL",
  "outputCurrency": "USDC"
}
```

Register, sign, and start exactly as described in [Ramp Lifecycle](https://api-docs.vortexfinance.co/ramp-lifecycle) — your backend holds the ephemeral keys and adds the header to each call. The child's payment identity (for BRL, the CPF of its provider account) is derived from the child; do not send identity selectors in the request.

Two things behave differently for managed children:

- **Pricing** is resolved as: the child's own partner-pricing assignment if one exists, otherwise **your (the manager's) active assignment**, otherwise default Vortex pricing — identically for header-delegated calls and direct child credentials. Children automatically inherit your negotiated fees.
- **Transaction webhooks are not supported for managed subjects** — registration returns `400 MANAGED_PROFILE_UNSUPPORTED` with the header and `403` with a child credential. Poll the child-scoped ramp status and history endpoints instead. The exception is the deposit-event family for EUR onramp accounts: the **manager** subscribes with their own credential (no header) and receives the lifecycle events `DEPOSIT_UPDATED`/`ACCOUNT_UPDATED` and the milestones `DEPOSIT_RECEIVED`/`DEPOSIT_CONVERTED`/`DEPOSIT_RETURNED` for all their children's accounts — see the Webhooks page.

## Get Started With The Business EUR Onramp In Sandbox

The business EUR onramp is open for testing in sandbox as a preliminary release; production activation is pending. A business client pays EUR by SEPA to its own IBAN, and Vortex converts the payment to USDC and sends it to the client's destination address. Every call below goes to `https://api-sandbox.vortexfinance.co` with your sandbox secret key.

**Set up with Vortex**

1. Sign up at <https://dashboard-sandbox.vortexfinance.co> with your email, open **API keys**, and create a credential. Keep the secret key (`sk_test_...`) on your backend.
2. Email <support@vortexfinance.co> the address you signed up with. The dashboard does not show your profile ID; Vortex looks it up from the email.
3. Vortex enables your profile as a manager for the `EU` corridor and business customers, and sends you the EUR provider's sandbox profile IDs of the test companies you can register. During this pilot those companies live in Vortex's own provider app, and the provider approves each profile in its sandbox before Vortex deploys anything for it.

**Integrate**

1. Subscribe to the deposit and account events with your manager key and no `X-Managed-Profile-Id` header. The response is `201` with the webhook `id`.

```http
POST /v1/webhook
X-API-Key: sk_test_...
Content-Type: application/json

{
  "url": "https://manager.example.com/vortex/deposits",
  "events": ["DEPOSIT_UPDATED", "ACCOUNT_UPDATED"]
}
```

2. Register each test company with its provider profile ID and the client's destination address. A new registration returns `202` with `status: "requested"`; see [Register A Business EUR Client](#register-a-business-eur-client) for every response.

```http
POST /v1/monerium-b2b/accounts
X-API-Key: sk_test_...
Content-Type: application/json

{
  "moneriumProfileId": "<profile ID from Vortex>",
  "destination": "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc",
  "externalSubjectId": "client-1",
  "contactEmail": "operations@client.example"
}
```

3. Follow the registration until `status` is `mapped`. It reports `waitingReason: null` until Vortex first checks it, `monerium_profile_pending` until the provider approves the profile, then `deployment_pending` while Vortex deploys the client's conversion contract. During this pilot the provider approves the test profiles, not you: if a registration stays at `monerium_profile_pending`, or `POST` returns `422 MONERIUM_B2B_PROFILE_UNAVAILABLE`, check the profile ID against the one Vortex sent and contact Vortex.

```http
GET /v1/monerium-b2b/registrations?moneriumProfileId=<profile ID from Vortex>
X-API-Key: sk_test_...
```

4. Wait for an `ACCOUNT_UPDATED` event with `status: "active"` and an `iban`. In sandbox, an account activates on its own once its IBAN is issued. The event's `profileId` is the client's managed profile: send it as `X-Managed-Profile-Id` in the reads below. `GET /v1/monerium-b2b/accounts` with your manager key lists the same accounts if you missed an event.
5. Pay at least EUR 1 to the client's IBAN from a sandbox account at the EUR provider. `DEPOSIT_UPDATED` events follow the payment until the deposit is `forwarded` to the destination.
6. Read the client's account and deposits. They return `{ "account": { ... } }` and `{ "deposits": [ ... ], "pagination": { "limit", "offset", "total" } }`, each deposit being the same snapshot `DEPOSIT_UPDATED` delivers. Before the account exists, both return `404 MONERIUM_B2B_ACCOUNT_NOT_FOUND`.

```http
GET /v1/monerium-b2b/account
X-API-Key: sk_test_...
X-Managed-Profile-Id: <profileId from ACCOUNT_UPDATED>
```

```http
GET /v1/monerium-b2b/deposits?limit=20&offset=0
X-API-Key: sk_test_...
X-Managed-Profile-Id: <profileId from ACCOUNT_UPDATED>
```

**Sandbox specifics**

- **Network.** Sandbox converts and delivers on Ethereum Sepolia; production uses Ethereum mainnet. The destination must be an Ethereum address the client controls, and it is fixed for the life of the account.
- **Minimum.** Payments from EUR 1 are converted.
- **Refund window.** A payment that is not converted within 15 minutes of its mint (two hours by default in production), for example because the account was not active yet, is refunded in full to the account it came from. The EUR provider pays refunds out only for profiles it has approved.
- **Webhook signatures.** Sandbox signs deliveries with its own key: verify them against `https://api-sandbox.vortexfinance.co/v1/public-key`, not the production key. See [Webhooks](https://api-docs.vortexfinance.co/webhooks).

## Register A Business EUR Client

You register business EUR clients yourself. Create the client's profile and submit its KYB in your own EUR provider app first; no KYB data goes to Vortex. Then register the client's payout wallet with your manager key (`X-API-Key`; the `X-Managed-Profile-Id` header, a child credential, and an admin impersonation session are refused, and only the manager bound to your provider app may register):

```http
POST /v1/monerium-b2b/accounts
X-API-Key: sk_live_...
Content-Type: application/json

{
  "moneriumProfileId": "0b8e4d1c-6f3a-4c27-9a51-2d7e8b9c0a14",
  "destination": "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc",
  "externalSubjectId": "client-1",
  "contactEmail": "operations@client.example"
}
```

```json
{
  "registration": {
    "accountId": null,
    "createdAt": "2026-10-07T09:00:00.000Z",
    "destination": "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc",
    "externalSubjectId": "client-1",
    "moneriumProfileId": "0b8e4d1c-6f3a-4c27-9a51-2d7e8b9c0a14",
    "rejectedReason": null,
    "status": "requested",
    "waitingReason": null
  }
}
```

Vortex waits for the provider to approve the profile, deploys the client's conversion contract with the destination fixed in it, then creates the child and its onramp account, which appears in `GET /v1/monerium-b2b/accounts` and the `ACCOUNT_UPDATED` webhook. Follow the registration with `GET /v1/monerium-b2b/registrations` (filter by `moneriumProfileId`). `status` is `requested` until the account exists (`mapped`, with `accountId`) or the registration is `rejected` (see `rejectedReason`). While it is `requested`, `waitingReason` says what it waits for. `null` means Vortex has not checked the registration yet, as in the `202` response to a new registration or to a new attempt after a rejection (an identical replay returns `200` with the current reason); mapped and rejected registrations also report `null`.

| `waitingReason` | Meaning |
|---|---|
| `monerium_profile_pending` | The provider has not approved the profile yet (created, incomplete, pending or in review). Finish its KYB in your provider app. |
| `monerium_profile_not_visible` | The provider no longer shows the profile to your app. Check the profile ID. |
| `deployment_pending` | Vortex is deploying the client's conversion contract or waiting for it to confirm. |
| `deployer_not_ready` | Vortex's deployment wallet lacks its role or gas. Vortex fixes it; nothing to do on your side. |
| `manager_inactive` | Your manager profile is not active for business EUR clients. Contact Vortex. |
| `temporary_error` | A temporary failure at Vortex or the provider. It is retried automatically. |

A registration is rejected only for a definite reason: the provider rejected or closed the profile; the conversion contract refused the destination (for example a token or router address); the client data conflicts with an existing client (the reference is already used with a different contact email, by a client that is not a business, or with another provider profile; the contact email belongs to another client; another open registration uses the reference or email); an account Vortex operations already set up for the profile has a different destination or belongs to another client; the conversion contract at the destination's address was retired (register a different destination); or Vortex operations withdrew it, which `rejectedReason` says. A temporary failure never rejects: the registration keeps waiting. To correct or retry a rejected profile, send the same call again with the same or corrected data: it returns `202` and the registration is `requested` again.

The destination is fixed for the life of the account, so an identical replay (same `destination`, `externalSubjectId` and `contactEmail`, the email compared case-insensitively) returns `200` with the registration's current state, and any difference is `409 MONERIUM_B2B_DESTINATION_CONFLICT`, as is a profile that already has an account.

| Response | Meaning |
|---|---|
| `400 MONERIUM_B2B_INVALID_INPUT` | The profile ID is not a UUID, the destination is not a non-zero EVM address (EIP-55 checksum when mixed case), the reference is empty or longer than 255 characters, or the email is invalid. |
| `403 MANAGED_PROFILE_ACCESS_DENIED` / `403 IMPERSONATION_NOT_ALLOWED` | The caller is not the manager bound to your provider app, or acts through an admin impersonation session. |
| `409 MONERIUM_B2B_CLIENT_CONFLICT` | The client data clashes with an existing client or registration, as listed above. Checked when you register and again before Vortex deploys, which then rejects the registration. |
| `422 MONERIUM_B2B_PROFILE_UNAVAILABLE` | Your provider app does not know the profile (check the profile ID), or the provider rejected or closed it. |
| `503 MONERIUM_B2B_PROVIDER_UNAVAILABLE` | The provider failed, timed out, rate-limited the request or refused the profile check. Nothing was recorded: retry the identical request later. |

An account converts payments only once it is `active`, and its IBAN can be issued before that: `iban` is set while `status` is still `onboarding`. A payment that reaches the IBAN earlier is not converted. The deposit waits with `waiting.reason` `account_not_active` and is refunded once the promised conversion window has passed (two hours by default, 15 minutes in sandbox; operations process the refund by hand where automatic refunds are off). A `suspended` account, or one paused for dormancy, converts nothing either, and Vortex suspends an account whose destination check fails even if it was never active. So hand a client its IBAN only once an `ACCOUNT_UPDATED` event or `GET /v1/monerium-b2b/account` reports `status: "active"`. The gate is Vortex's policy, applied by its conversion service rather than locked on chain, so treat the IBAN as unusable until then. In sandbox, accounts activate on their own once the IBAN is issued; in production, Vortex operations activate an account after checking its destination.

## Common Errors

| Response | Meaning |
|---|---|
| `403 MANAGED_PROFILE_ACCESS_DENIED` | The selector or child credential failed a check: inactive manager, not your child, deleted child, invalid entity layout, or a corridor/type your policy does not allow. |
| `400 MANAGED_PROFILE_UNSUPPORTED` | The endpoint does not support delegation: webhook management, the manager-level business EUR routes (`GET` and `POST /v1/monerium-b2b/accounts`, `GET /v1/monerium-b2b/registrations`), and invite preview and acceptance. |
| `404` on lifecycle routes | The `profileId` does not identify a child of the authenticated manager. |
| `200` instead of `201` on create | Idempotent retry — the identical child already exists. |
| `409 CREDENTIAL_LIMIT_REACHED` | The child already has five active, non-expired credentials. |

---
