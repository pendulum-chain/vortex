# Managed Profiles

Managed profiles let a platform onboard and operate Vortex accounts for its own customers without those customers ever touching a Vortex UI, login, or email flow. The platform's Vortex profile acts as the **manager**; each customer becomes a headless **managed child** profile that the manager creates, onboards through KYC/KYB, and ramps on behalf of.

Use managed profiles when interactive signup is unavailable or undesirable — a B2B platform embedding cross-border payouts, a fintech onboarding its verified user base, or an operations backend running ramps for corporate sub-accounts. Provision one genuine child per real individual or business; never share one child between customers.

This page is the integration walkthrough. The exact authorization contract — every check Vortex performs, edge-case semantics, and error codes — lives in [Authentication And API Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys) and is authoritative where the two overlap.

## Prerequisites

Manager status is granted by Vortex, not self-service. During partner onboarding, Vortex enables your profile as a managed-profile manager and assigns:

- **Allowed corridors** — the countries (`BR`, `EU`, `AR`, `CO`, `MX`, `US`) your children may operate in.
- **Optional customer-type narrowing** — restrict children to `individual` or `business`; a null policy allows both wherever the corridor's canonical capability matrix does.

Every delegated operation re-checks this policy at request time, so a corridor removed from your manager record immediately blocks new mutations for children in that corridor (in-flight ramps continue). Automated EUR onboarding and provider binding are not available for managed children. A non-technical child that operations has already provisioned with an approved EUR provider binding, Polygon EOA, and IBAN may use the direct-API EUR BUY flow when the manager policy allows that corridor.

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

{ "accountType": "INDIVIDUAL", "name": "Ana Maria Silva", "taxId": "12345678901" }
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
- **Webhooks are not supported for managed subjects** — registration returns `400 MANAGED_PROFILE_UNSUPPORTED` with the header and `403` with a child credential. Poll the child-scoped ramp status and history endpoints instead.

## Common Errors

| Response | Meaning |
|---|---|
| `403 MANAGED_PROFILE_ACCESS_DENIED` | The selector or child credential failed a check: inactive manager, not your child, deleted child, invalid entity layout, or a corridor/type your policy does not allow. |
| `400 MANAGED_PROFILE_UNSUPPORTED` | The endpoint does not support delegation (currently webhook management). |
| `404` on lifecycle routes | The `profileId` does not identify a child of the authenticated manager. |
| `200` instead of `201` on create | Idempotent retry — the identical child already exists. |
| `409 CREDENTIAL_LIMIT_REACHED` | The child already has five active, non-expired credentials. |

---
