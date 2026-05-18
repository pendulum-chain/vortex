# 5. Authentication And Partner Keys

Vortex uses two partner key types.

## Public Keys

Public keys use the `pk_live_*` or `pk_test_*` prefix. They are used for partner attribution, tracking, and partner-specific quote behavior. Public keys may be included in SDK configuration or request bodies as `apiKey`.

Public keys do not authenticate sensitive partner operations.

## Secret Keys

Secret keys use the `sk_live_*` or `sk_test_*` prefix. They authenticate partner operations through the `X-API-Key` header.

Secret keys must be treated as server-side credentials. Do not expose them in browser bundles, mobile app binaries, URLs, screenshots, analytics tools, logs, or support tickets.

When a request includes `partnerId`, the API may require the secret key to authenticate the matching partner. If the authenticated partner does not match the requested partner, Vortex rejects the request.

## Recommended Handling

Store secret keys in a secret manager or encrypted environment configuration. Rotate keys if they are exposed, no longer needed, or tied to a retired integration. Use test keys in sandbox and live keys only in production.

---
