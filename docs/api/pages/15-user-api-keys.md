# User API Keys

Registering a ramp requires authentication in every corridor: `POST /v1/ramp/register` accepts either a secret API key in `X-API-Key` or a user session Bearer token. For BRL and EUR corridors, a partner-scoped `sk_*` key is sufficient because the user is identified by request fields such as the tax ID. The bank transfer corridors (USD, MXN, COP, ARS) are stricter: the key must be **user-linked** — a key pair minted by the user's own Vortex account — because the ramp resolves the user's KYC and payment profile from the authenticated account.

This page shows how to provision a user-linked key pair programmatically, without contacting Vortex support: sign the user in with an email one-time password (OTP), then mint the key pair with the resulting session token. The minted pair is bound to the authenticated user, not to a partner; requests authenticated with the secret key act as that user on quote and ramp endpoints, so KYC completed by the same account applies automatically. A user-linked key works in every corridor, so integrations can use it uniformly. See [Bank Transfer Corridors](https://api-docs.vortexfinance.co/bank-transfer-corridors) for the corridor-specific requirements.

## 1. Request An Email OTP

```http
POST /v1/auth/request-otp
Content-Type: application/json
```

```json
{
  "email": "user@example.com"
}
```

Vortex emails a 6-digit code to the address. An optional `locale` string localizes the email. The response is `{ "success": true, "message": "OTP sent to email" }`.

## 2. Verify The OTP

```http
POST /v1/auth/verify-otp
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "token": "123456"
}
```

```json
{
  "success": true,
  "access_token": "eyJ...",
  "refresh_token": "...",
  "user_id": "00000000-0000-0000-0000-000000000000"
}
```

An invalid or expired code returns `400`. Verification creates the user profile on first sign-in; `user_id` identifies the profile the keys will be linked to. If the user has already completed KYC in the Vortex app or Widget under the same email, this is the same profile — no extra linking step is needed.

`POST /v1/auth/refresh` with `{ "refresh_token": "..." }` returns a fresh token pair when the access token expires.

## 3. Create The Key Pair

```http
POST /v1/api-keys
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "name": "my-backend",
  "expiresAt": "2027-07-06T00:00:00.000Z"
}
```

Both body fields are optional. Response (`201`):

```json
{
  "createdAt": "2026-07-06T12:00:00.000Z",
  "expiresAt": "2027-07-06T00:00:00.000Z",
  "isActive": true,
  "publicKey": {
    "id": "...",
    "key": "pk_live_...",
    "keyPrefix": "pk_live_",
    "name": "my-backend (Public)",
    "type": "public"
  },
  "secretKey": {
    "id": "...",
    "key": "sk_live_...",
    "keyPrefix": "sk_live_",
    "name": "my-backend (Secret)",
    "type": "secret"
  }
}
```

- **The secret key value is returned only in this response.** Vortex stores a hash; it cannot be retrieved again. Persist it to your secret manager immediately.
- Keys expire after one year by default; `expiresAt` may extend this to at most two years from creation.
- A user may hold at most 10 active keys (a pair counts as two). Exceeding the cap returns `409 API_KEY_LIMIT_REACHED`; revoke unused keys first.
- Sandbox mints `pk_test_*` / `sk_test_*`; production mints `pk_live_*` / `sk_live_*`.

The `/v1/api-keys` endpoints accept only `Authorization: Bearer` session tokens — an `X-API-Key` secret key cannot mint or revoke keys.

## 4. Use The Keys

Configure the SDK (or send `X-API-Key` directly) with the minted pair:

```js
const sdk = new VortexSdk({
  apiBaseUrl: "https://api.vortexfinance.co",
  publicKey: "pk_live_...",
  secretKey: "sk_live_..."
});
```

The bearer token is only needed for key management; day-to-day quoting and ramping authenticate with the secret key. See [Quick Start With The SDK](https://api-docs.vortexfinance.co/quick-start-with-the-sdk).

## Managing Keys

- `GET /v1/api-keys` — lists the user's active keys (public key values are included; secret values are never returned).
- `DELETE /v1/api-keys/{keyId}` — revokes a key; returns `204`. Pass `{ "pairedKeyId": "..." }` in the body to revoke both halves of a pair together.

Revoke and re-mint immediately if a secret key is exposed. See [Authentication And Partner Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys) for handling guidance.

---
