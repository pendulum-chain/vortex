# 5. Authentication And Partner Keys

Vortex authenticates partners with two key types and also accepts Supabase Bearer tokens for first-party user flows.

## Public Keys

Public keys use the `pk_live_*` or `pk_test_*` prefix. They are used for partner attribution, tracking, and partner-specific quote behavior. Public keys may be included in SDK configuration or request bodies as `apiKey`.

Public keys do not authenticate sensitive partner operations. An invalid or expired public key is rejected on routes that validate it; it is not silently ignored.

## Secret Keys

Secret keys use the `sk_live_*` or `sk_test_*` prefix. They authenticate partner operations through the `X-API-Key` header.

Secret keys must be treated as server-side credentials. Do not expose them in browser bundles, mobile app binaries, URLs, screenshots, analytics tools, logs, or support tickets.

When a request includes `partnerId`, the API may require the secret key to authenticate the matching partner. If the authenticated partner does not match the requested partner, Vortex rejects the request.

Ramp endpoints, including register, update, start, status, history, and error logs, require authentication through either a partner secret key or a Supabase Bearer token.

Webhook endpoints require a partner secret key and do not accept Supabase Bearer tokens.

## Supabase Bearer Tokens

BRLA account-management endpoints are first-party, user-oriented flows. Partner `sk_*` and `pk_*` keys do not authenticate a BRL KYC flow. Partners that need BRL ramps should onboard users through the Vortex application or hosted widget, or design the integration so the user has completed the required onboarding before the partner backend starts a ramp.

## Webhook Signing Key

`GET /v1/public-key` returns the RSA-PSS public key used to verify webhook signatures. It is unrelated to partner `pk_*` public keys.

## Recommended Handling

Store secret keys in a secret manager or encrypted environment configuration. Rotate keys if they are exposed, no longer needed, or tied to a retired integration. Use test keys in sandbox and live keys only in production.

---
