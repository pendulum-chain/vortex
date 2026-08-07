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
| Webhook management | No | Yes | No |
| Profile-managed credential lifecycle | No | No | Yes |

`GET /v1/ramp-info` requires `X-Public-Key` or `X-API-Key`; a Supabase Bearer session does not authorize this endpoint. It returns only per-corridor `kycStatus`, `canBuy`, and `canSell`. It does not accept a profile/user selector and does not expose PII, provider identifiers, KYC failure reasons, account details, ramp history, or exact limits.

## Subject And Partner Binding

Every credential authenticates exactly one Vortex profile. A profile-managed credential has no partner and is managed by its signed-in subject. A partner-managed credential has an optional partner attribution but still authenticates only its bound profile.

Ramp registration requires a real profile subject in every corridor. KYC and provider identity are derived from the authenticated profile unless the request uses the authorized managed-child flow below. For BRL, a supplied `taxId` is only a deprecated cross-check and must match the effective profile. A technical profile can operate only on provider/customer resources it actually owns.

## Act For A Managed Child

An administrator may enable an authenticated profile as a managed-profile manager and assign its allowed corridors. On supported child-oriented endpoints, that manager can select one directly managed headless child:

```http
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
```

A Supabase Bearer session may replace the secret key. A public `pk_*` value cannot authenticate delegation. Vortex verifies the active manager, direct active child relationship, child's single active customer entity, and the allowed country for corridor-bound mutations. The manager remains the authenticated actor; ownership, KYC/provider lookup, quote pricing, and ramp history resolve from the child subject.

The header is supported for quote creation; ramp registration, update, start, status, history, and errors; aggregate onboarding status; BRLA customer/KYC operations; and Alfredpay KYC/KYB and fiat-account operations. Corridor removal blocks mutations but not quote discovery or historical/status reads. Alfredpay customer creation and the email-bound Mykobo and Monerium flows do not support managed children because a headless child has no canonical login email.

`X-Managed-Profile-Id` is only a selector. Supplying another manager's child, an inactive/deleted child, a child with an invalid entity layout, or a disallowed mutation corridor returns `403 MANAGED_PROFILE_ACCESS_DENIED`.

### Manage Headless Profiles

An active manager may use its Supabase session or profile-bound secret credential on these endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /v1/managed-profiles` | Create an `individual` or `business` child from an immutable `externalSubjectId` |
| `GET /v1/managed-profiles` | List children; defaults to active records with `limit=50&offset=0` |
| `GET /v1/managed-profiles/:profileId` | Read an owned active or deleted child |
| `DELETE /v1/managed-profiles/:profileId` | Logically delete an owned child and revoke its credentials |

Creation is not tied to one corridor. Every later corridor-bound operation checks the manager's current allowed corridors, so removing a corridor immediately blocks new child mutations there. `POST` returns `201` for a new child and `200` for an identical retry. A deleted external subject remains reserved and cannot create a replacement child. Deletion is idempotent (`204`), preserves compliance and financial history, blocks unstarted ramp mutations, and does not interrupt background processing for ramps that already started.

Lists accept `status=active|deleted|all`, `limit=1..100`, and a non-negative `offset`; the default status is `active`. Inactive managers lose create, list, read, delete, and delegated-operation access. Requests for another manager's child return `404` on lifecycle routes.

Partners must provision one genuine managed profile per individual, business, or technical subject when interactive signup is unavailable. Vortex's admin workflow binds the profile to immutable partner and external-user IDs and allows the same identity to be claimed later through OTP. Individual and business subjects receive the corresponding customer entity. Technical subjects receive no customer entity and cannot perform customer or ramp operations. Do not share dummy profiles between customers or infer a subject from a credential display name.

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
