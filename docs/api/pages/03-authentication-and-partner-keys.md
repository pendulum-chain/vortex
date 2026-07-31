# Authentication And API Keys

Vortex issues one API credential with two values for one profile subject:

- `pk_live_*` / `pk_test_*` is the public value. Send it as `X-Public-Key` for quote/widget attribution and approved low-sensitivity reads. It may be used in browser code.
- `sk_live_*` / `sk_test_*` is the secret value. Send it as `X-API-Key` for sensitive or state-changing operations. It must remain on a trusted server.

Both values share one immutable credential ID, subject profile, optional partner, environment, expiry, and revocation lifecycle. If a request sends both values, they must belong to the same credential or Vortex returns `403 CREDENTIAL_MISMATCH`.

## Capability Matrix

| Task | Public value | Secret value | Supabase Bearer |
|---|---:|---:|---:|
| Quote/widget attribution | Yes | Yes | Yes |
| Sanitized `GET /v1/ramp-info` | Yes | Yes | Yes |
| Exact limits and provider-account reads | No | Yes | Yes |
| Ramp register/update/start/status/history/errors | No | Yes | Yes |
| Webhook management | No | Yes | No |
| Profile-managed credential lifecycle | No | No | Yes |

`GET /v1/ramp-info` returns only per-corridor `kycStatus`, `canBuy`, and `canSell`. It does not accept a profile/user selector and does not expose PII, provider identifiers, KYC failure reasons, account details, ramp history, or exact limits.

## Subject And Partner Binding

Every credential acts for exactly one Vortex profile. A profile-managed credential has no partner and is managed by its signed-in subject. A partner-managed credential has an optional partner attribution but still acts only for its bound profile.

Ramp registration requires that real profile subject in every corridor. KYC and provider identity are derived from the credential's profile, never from a request-selected user. For BRL, a supplied `taxId` is only a deprecated cross-check and must match the authenticated profile. A technical profile can operate only on provider/customer resources it actually owns.

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
