# Authentication And API Keys

Vortex authenticates API clients with public/secret key pairs, and accepts Supabase Bearer session tokens for first-party user flows and key management.

## Which Credential Do I Need?

| Task | Credential |
|---|---|
| Quote attribution and partner pricing | `pk_*` public key (optional on quotes) |
| BRL and EUR ramps from a partner backend | Partner-scoped or user-linked `sk_*` secret key |
| USD, MXN, COP, ARS ramps | **User-linked** `sk_*` secret key |
| Webhook management | Partner secret key |
| Minting and managing user API keys | `Authorization: Bearer` session token |

## Public Keys

Public keys use the `pk_live_*` or `pk_test_*` prefix. They are used for partner attribution, tracking, and partner-specific quote behavior. Public keys may be included in SDK configuration or request bodies as `apiKey`.

Public keys do not authenticate sensitive partner operations. An invalid or expired public key is rejected on routes that validate it; it is not silently ignored.

## Secret Keys

Secret keys use the `sk_live_*` or `sk_test_*` prefix. They authenticate operations through the `X-API-Key` header.

Secret keys come in two scopes:

- **Partner-scoped** keys are issued to a partner organization. They are sufficient for BRL and EUR ramps, where the user is identified by request fields such as the tax ID, and they are required for webhook management.
- **User-linked** keys are minted by a user's own Vortex account (see the *Provisioning User-Linked Keys* section below). Requests authenticated with them act as that user, so KYC completed by the same account applies automatically. The USD, MXN, COP, and ARS corridors require a user-linked key at ramp registration; see [Fiat Corridors](https://api-docs.vortexfinance.co/fiat-corridors). A user-linked key works in every corridor, so integrations can use it uniformly.

Secret keys must be treated as server-side credentials. Do not expose them in browser bundles, mobile app binaries, URLs, screenshots, analytics tools, logs, or support tickets.

When a request includes `partnerId`, the API may require the secret key to authenticate the matching partner. If the authenticated partner does not match the requested partner, Vortex rejects the request.

Ramp endpoints, including register, update, start, status, history, and error logs, require authentication through either a secret key or a Supabase Bearer token.

Webhook endpoints require a partner secret key and do not accept Supabase Bearer tokens.

## Supabase Bearer Tokens

Bearer tokens represent a signed-in Vortex user. They are used for first-party account-management flows (such as the BRLA KYC endpoints) and for minting and managing user API keys. Partner `sk_*` and `pk_*` keys do not authenticate these flows.

Partners that need BRL ramps should onboard users through the Vortex application or hosted widget, or design the integration so the user has completed the required onboarding before the partner backend starts a ramp.

## Provisioning User-Linked Keys

A user-linked key pair can be provisioned programmatically, without contacting Vortex support: sign the user in with an email one-time password (OTP), then mint the key pair with the resulting session token.

### 1. Request An Email OTP

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

### 2. Verify The OTP

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

### 3. Create The Key Pair

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

### 4. Use The Keys

Configure the SDK (or send `X-API-Key` directly) with the minted pair:

```js
const sdk = new VortexSdk({
  apiBaseUrl: "https://api.vortexfinance.co",
  publicKey: "pk_live_...",
  secretKey: "sk_live_..."
});
```

The bearer token is only needed for key management; day-to-day quoting and ramping authenticate with the secret key. See [Quick Start With The SDK](https://api-docs.vortexfinance.co/quick-start-with-the-sdk).

### Managing Keys

- `GET /v1/api-keys` — lists the user's active keys (public key values are included; secret values are never returned).
- `DELETE /v1/api-keys/{keyId}` — revokes a key; returns `204`. Pass `{ "pairedKeyId": "..." }` in the body to revoke both halves of a pair together.

## Webhook Signing Key

`GET /v1/public-key` returns the RSA-PSS public key used to verify webhook signatures. It is unrelated to partner `pk_*` public keys.

## Recommended Handling

Store secret keys in a secret manager or encrypted environment configuration. Rotate keys if they are exposed, no longer needed, or tied to a retired integration — for user-linked keys, revoke and re-mint through the endpoints above. Use test keys in sandbox and live keys only in production.

---
