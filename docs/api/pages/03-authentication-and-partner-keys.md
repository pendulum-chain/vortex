# Authentication And API Keys

Vortex issues one API credential with two values for one profile subject:

- `pk_live_*` / `pk_test_*` is the public value. Send it as `X-Public-Key` for quote/widget attribution and approved low-sensitivity reads. It may be used in browser code.
- `sk_live_*` / `sk_test_*` is the secret value. Send it as `X-API-Key` for sensitive or state-changing operations. It must remain on a trusted server.

Both values share one immutable credential ID, subject profile, optional partner, environment, expiry, and revocation lifecycle. If a request sends both values, they must belong to the same credential or Vortex returns `403 CREDENTIAL_MISMATCH`.

## Capability Matrix

| Task | Public value | Secret value | Supabase Bearer |
|---|---:|---:|---:|
| Quote/widget attribution | Yes | Yes | Yes |
| Sanitized `GET /v1/ramp-info` | Yes | Yes | No |
| Exact limits and provider-account reads | No | Yes | Yes |
| Ramp register/update/start/status/history/errors | No | Yes | Yes |
| Act for an authorized managed child | No | Yes | Yes |
| Manage a directly owned child's credentials | No | Yes | Yes |
| Import an Avenia individual-KYC share token | No | Yes | Yes |
| Webhook management (non-managed subjects only) | No | Yes | No |
| Profile-managed credential lifecycle | No | No | Yes |

`GET /v1/ramp-info` requires `X-Public-Key` or `X-API-Key`; a Supabase Bearer session does not authorize this endpoint. It returns only per-corridor `kycStatus`, `canBuy`, and `canSell`. A manager secret may supply `X-Managed-Profile-Id`; public keys may not. It accepts no body/query profile or user selector and does not expose PII, provider identifiers, KYC failure reasons, account details, ramp history, or exact limits.

## Subject And Partner Binding

Every credential authenticates exactly one Vortex profile. A profile-managed credential has no partner and is managed by its signed-in subject. A partner-managed credential has an optional partner attribution but still authenticates only its bound profile.

Ramp registration requires a real profile subject in every corridor. KYC and provider identity are derived from the authenticated profile unless the request uses the authorized managed-child flow below. For BRL, a supplied `taxId` is only a deprecated cross-check and must match the effective profile. A technical profile can operate only on provider/customer resources it actually owns.

## Act For A Managed Child

Vortex may enable an authenticated profile as a managed-profile manager and assign its allowed corridors and, optionally, a narrower set of customer types. On supported child-oriented endpoints, that manager can select one directly managed headless child:

```http
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
```

A Supabase Bearer session may replace the secret key. A public `pk_*` value cannot authenticate delegation. Vortex verifies the active manager, direct active child relationship, child's single active customer entity, allowed country, optional customer-type narrowing, and canonical country/type support for corridor-bound mutations. An omitted or null customer-type policy adds no restriction beyond the canonical corridor capability matrix; a configured non-empty list only narrows that matrix. The manager remains the authenticated actor; ownership, KYC/provider lookup, and ramp history resolve from the child subject. Quote pricing uses the child's active profile assignment when present, otherwise the controlling manager profile's active assignment, then default Vortex pricing. This precedence is identical for manager-delegated requests and direct child credentials.

The header is supported for quote creation; ramp registration, update, start, status, history, and errors; exact limits and sanitized ramp info; aggregate onboarding status; BR customer/KYC operations; and customer creation, KYC/KYB, and fiat-account operations on the AR, CO, MX, and US corridors. Corridor removal blocks mutations and disallowed exact-limit requests but not quote discovery or historical/status reads. The EUR corridor's flows are bound to a verified login email, so they and all recipient-invitation routes do not support managed children.

`POST /v1/brl/kyc/import-token` is a deliberate exception to direct child credential access. A controlling manager may call it with the manager's secret key or Supabase session plus `X-Managed-Profile-Id`, but a credential owned by the managed child is rejected with `403 MANAGED_PROFILE_ACCESS_DENIED`, even without the selector. Direct non-managed profiles may import for themselves with their own secret key or session. Public keys and ownerless credentials cannot import. The legacy `/v1/brla/kyc/import-token` path remains an equivalent migration alias.

Authentication, direct-child rejection, and managed authorization run before strict validation of `Idempotency-Key` and the request body. An unauthenticated caller therefore receives an authentication error rather than learning whether a bearer-like personal-data transfer token or attestation is well formed. The request has no profile, user, CPF, subaccount, applicant, entity, or provider-customer selector in its body or query; identity is derived only from the authenticated effective profile.

Webhook registration and deletion do not support managed children. `X-Managed-Profile-Id` returns `400 MANAGED_PROFILE_UNSUPPORTED`, and a direct child credential returns `403 MANAGED_PROFILE_ACCESS_DENIED`. Managed-child integrations must poll the child-scoped ramp status/history endpoints. A manager credential without the selector remains manager-owned and therefore cannot register a webhook for a child-owned quote.

`X-Managed-Profile-Id` is only a selector. Supplying another manager's child, an inactive/deleted child, a child with an invalid entity layout, or a disallowed mutation corridor returns `403 MANAGED_PROFILE_ACCESS_DENIED`.

### Manage Headless Profiles

An active manager may use its Supabase session or profile-bound secret credential on these endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /v1/managed-profiles` | Create an `individual` or `business` child from immutable `externalSubjectId` and provider `contactEmail` values |
| `GET /v1/managed-profiles` | List children; defaults to active records with `limit=50&offset=0` |
| `GET /v1/managed-profiles/:profileId` | Read an owned active or deleted child |
| `DELETE /v1/managed-profiles/:profileId` | Logically delete an owned child and revoke its credentials |
| `POST /v1/managed-profiles/:profileId/api-credentials` | Issue a child-owned public/secret credential pair |
| `GET /v1/managed-profiles/:profileId/api-credentials` | List the child's credentials without secret values |
| `DELETE /v1/managed-profiles/:profileId/api-credentials/:credentialId` | Revoke one child credential |

Creation is not tied to one corridor and may create only an `individual` or `business` child. Every later corridor-bound operation checks the manager's current corridors, optional customer-type narrowing, and Vortex's canonical corridor/type support. Tightening policy blocks later authorization decisions but does not cancel a request already authorized or background processing for a ramp that already started. `POST` returns `201` for a new child and `200` for an identical retry. A deleted external subject remains reserved and cannot create a replacement child. Deletion is idempotent (`204`), preserves compliance and financial history, and blocks new child activity.

Lists accept `status=active|deleted|all`, `limit=1..100`, and a non-negative `offset`; the default status is `active`. Inactive managers lose create, list, read, delete, and delegated-operation access. Requests for another manager's child return `404` on lifecycle routes.

The child contact email is normalized and immutable, is unique among the manager's children, is used for provider customer creation, and never becomes a Supabase login identity. A deleted child's contact email remains reserved for that manager. Partners must supply an email identity they are authorized to use; uniqueness is not global across managers. A child-owned credential authenticates directly as that child without `X-Managed-Profile-Id`. Every use dynamically requires the active manager relationship; corridor-bound mutations and exact-limit reads use the controlling manager's current corridor/type policy. A direct child credential cannot select another managed child. Logical deletion immediately invalidates and revokes both halves.

Provision one genuine managed profile per individual or business when interactive signup is unavailable. Managed profiles are headless: they have no Supabase login, OTP, or later claiming lifecycle. Do not share dummy profiles between customers or infer a subject from a credential display name.

## Secret Handling

Vortex stores only a SHA-256 digest and a safe lookup prefix for the secret value. The full secret is returned once when the credential is created. Store it immediately in a secret manager. Never place it in browser/mobile bundles, URLs, request bodies, screenshots, analytics, logs, support tickets, or source control.

## Provision A Profile-Managed Credential

### 1. Request And Verify An OTP

```http
POST /v1/auth/request-otp
Content-Type: application/json

{ "email": "user@example.com" }
```

```http
POST /v1/auth/verify-otp
Content-Type: application/json

{ "email": "user@example.com", "token": "123456" }
```

Verification returns `access_token`, `refresh_token`, and `user_id`, creating the profile on first sign-in. `POST /v1/auth/refresh` accepts the refresh token when needed.

### 2. Create One Credential

```http
POST /v1/api-credentials
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "production backend",
  "expiresAt": "2027-07-31T00:00:00.000Z"
}
```

Both fields are optional. Expiry defaults to one year, must be in the future, and cannot exceed two years. The response is one resource:

```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "name": "production backend",
  "profileId": "00000000-0000-0000-0000-000000000001",
  "partnerId": null,
  "environment": "live",
  "publicKey": "pk_live_...",
  "secretKey": "sk_live_...",
  "secretKeyPrefix": "16-character safe prefix",
  "publicLastUsedAt": null,
  "secretLastUsedAt": null,
  "expiresAt": "2027-07-31T00:00:00.000Z",
  "revokedAt": null,
  "createdAt": "2026-07-31T00:00:00.000Z",
  "updatedAt": "2026-07-31T00:00:00.000Z"
}
```

The profile may have at most five active, non-expired credentials. Exceeding the cap returns `409 CREDENTIAL_LIMIT_REACHED`. Sandbox issues `*_test_*`; production issues `*_live_*`.

### 3. Configure The SDK

```js
const sdk = new VortexSdk({
  apiBaseUrl: "https://api.vortexfinance.co",
  publicKey: process.env.VORTEX_PUBLIC_KEY,
  secretKey: process.env.VORTEX_SECRET_KEY
});
```

A secret may be configured without a public value when only authenticated operations are needed. A public-only SDK can call `getRampInfo()` and create attributed quotes but cannot register or operate a ramp.

## List And Revoke

- `GET /v1/api-credentials` returns one item per credential. It includes the public value and safe secret prefix, never the secret value.
- `DELETE /v1/api-credentials/{credentialId}` returns `204` and atomically revokes both values. It takes no request body and no second key ID.

Both endpoints require the subject's Supabase Bearer session. Secret API credentials cannot create or revoke other credentials.

## Common Errors

| Code | Meaning |
|---|---|
| `INVALID_PUBLIC_KEY` | Public value is unknown, expired, or revoked. |
| `INVALID_SECRET_KEY` / `INVALID_API_KEY` | Secret value is malformed, unknown, expired, or revoked. |
| `CREDENTIAL_MISMATCH` | Presented public/body/header and secret values do not identify one credential. |
| `CREDENTIAL_LIMIT_REACHED` | The profile already has five active non-expired credentials. |
| `CREDENTIAL_NOT_FOUND` | Credential is missing, already revoked, or outside the authenticated manager's scope. |
| `CREDENTIAL_SUBJECT_REQUIRED` | A valid profile subject was not supplied for partner-managed issuance. |

## Webhook Signing Key

`GET /v1/public-key` returns the RSA-PSS public key used to verify webhook signatures. It is unrelated to a `pk_*` API credential value.

---
