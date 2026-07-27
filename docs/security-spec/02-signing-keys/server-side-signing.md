# Server-Side Signing Keys

## What This Does

The API server holds several private keys used for platform operations. These are distinct from ephemeral keys (which are client-side). Server keys are used for:

1. **Pendulum funding** — `PENDULUM_FUNDING_SEED`: Seed phrase for the Pendulum account that funds ephemeral Substrate accounts with native PEN tokens for transaction fees.
2. **Moonbeam execution** — `MOONBEAM_EXECUTOR_PRIVATE_KEY`: EVM private key used to execute transactions on Moonbeam (funding ephemerals with GLMR, executing subsidization transfers, XCM operations).
3. **Webhook signing** — `WEBHOOK_PRIVATE_KEY`: RSA private key (PEM format) used to sign webhook payloads with RSA-PSS + SHA-256. If missing, the `CryptoService` generates an ephemeral RSA keypair at startup (non-persistent).

All keys are loaded from environment variables. There is no HSM, secrets manager, or rotation mechanism. The Stellar funding key (`FUNDING_SECRET`) no longer exists — Stellar/Spacewalk support was removed (migration 028).

## Security Invariants

1. **Server keys MUST only be used for their designated purpose** — The funding seed signs funding/merge transactions, the executor key executes platform operations. No key should be repurposed for user-level operations.
2. **`WEBHOOK_PRIVATE_KEY` MUST be persistent across restarts** — If the env var is not set, `CryptoService` generates a new key pair in memory. This means webhook consumers who cached the public key will reject signatures after a restart. The env var MUST be set in production.
3. **RSA-PSS signing MUST use SHA-256 with maximum salt length** — The `signPayload` implementation uses `RSA_PKCS1_PSS_PADDING` and `RSA_PSS_SALTLEN_MAX_SIGN`. Consumers must use the same parameters to verify.
4. **The RSA private key MUST NOT be exposed via any API endpoint** — Only the public key should be available for webhook consumers to fetch. The `getPrivateKey()` method is correctly marked `private`.
5. **Key derivation MUST NOT be deterministic from public information** — Funding accounts, executor accounts, and webhook keys must be independently generated, not derived from the same master seed.
6. **Missing mandatory keys MUST prevent server startup** — If `PENDULUM_FUNDING_SEED` or `MOONBEAM_EXECUTOR_PRIVATE_KEY` are absent, the server cannot perform its core function and should refuse to start.
7. **The CryptoService singleton MUST initialize keys exactly once** — `initializeKeys()` should be called once at startup. Repeated calls should be idempotent or rejected.
8. **Webhook signatures MUST bind the delivery timestamp** — `X-Vortex-Signature` is computed over `` `${timestamp}.${body}` `` where `timestamp` is the value of the `X-Vortex-Timestamp` header (unix seconds). Consumers verify against that exact string, reject timestamps outside a bounded window, and deduplicate on the payload's `eventId`, which is unique per event and stable across delivery retries. A signature over the body alone MUST NOT verify.
9. **Every webhook row MUST have an owner principal** — the partner behind a partner-scoped secret key or the user behind a user-scoped key (`webhooks.partner_id` / `webhooks.user_id`). Registering a webhook for a quote requires that the owner principal owns the quote (`quote_tickets.partner_id` / `user_id` match); a foreign quote returns the same 404 as a nonexistent one. Deletion is owner-scoped with a uniform 404 for foreign IDs. Delivery matching filters webhooks by the quote's owner, so session-scoped subscriptions cannot receive another tenant's events. Ownerless rows are unrepresentable: migration 055 deletes any pre-existing rows (there were none in production) and a CHECK constraint requires exactly one of `partner_id`/`user_id`, so the delivery matcher has no ownerless branch — one would match every quote and reopen the cross-tenant hole for exactly the rows an attacker could have planted before ownership existed. An event whose quote owner cannot be resolved is delivered to nobody.
10. **Webhook callback URLs MUST NOT reach internal infrastructure (SSRF)** — registration accepts only HTTPS URLs without embedded credentials, rejects IP-literal hosts outside publicly routable space, and resolves the hostname — rejecting it if it resolves to a non-public address (a host that does not resolve yet is allowed, since DNS is often provisioned after integration setup and delivery re-validates anyway). Before every delivery the hostname is re-resolved and every resolved address must be public; redirects are rejected (`redirect: "error"`). Address classification follows the IANA special-purpose registries for both IPv4 and IPv6, so documentation/benchmarking/6to4/site-local ranges are treated as non-public. **Residual risk (accepted):** a resolve-then-connect race remains — the guard and `fetch` resolve independently, so a DNS-rebinding attacker controlling the domain can answer differently for each. Closing it requires pinning the validated address for the connection (preserving Host/SNI) or an egress proxy enforcing destination policy; tracked as follow-up. Exploitation requires an authenticated secret key, and deliveries are POSTs whose response body is never returned to the registrant (blind SSRF).

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Server compromise → key extraction** | Attacker gains shell access, reads env vars | All keys in env vars are extractable; no HSM protection. Mitigation: key separation limits blast radius — each key controls a different chain/function |
| **Executor key abuse** | Attacker with `MOONBEAM_EXECUTOR_PRIVATE_KEY` drains GLMR or executes arbitrary EVM transactions | Executor account should hold minimal GLMR (just enough for near-term operations); monitor balance and transaction patterns |
| **Webhook signature forgery** | Attacker signs fake webhook payloads | RSA-2048 with PSS padding is computationally infeasible to forge without the private key; public key verification by consumers |
| **Webhook replay** | Attacker re-sends a captured delivery later | Signature covers `timestamp.body`, so the timestamp header cannot be swapped; consumers reject stale timestamps and deduplicate `eventId` |
| **Cross-tenant webhook subscription** | Authenticated but unrelated API key subscribes to another client's quote or session events | Ownership required at registration (quote owner must match key principal); delivery matching filtered by quote owner; owner-scoped deletion with uniform 404 |
| **Webhook SSRF** | Callback URL points at internal services (cloud metadata, private ranges) directly, via DNS, or via redirect | HTTPS-only URLs, private/reserved IP literals rejected at registration, hostname re-resolved and checked before every delivery, redirects rejected |
| **Non-persistent webhook key** | Server restarts without `WEBHOOK_PRIVATE_KEY`, generates new key; consumers can't verify old signatures | Set `WEBHOOK_PRIVATE_KEY` in production; warn at startup (current behavior: logs warning) |
| **Pendulum seed phrase exposure** | Seed phrase logged or leaked | Seed phrases should not be logged; `PENDULUM_FUNDING_SEED` should be treated as a secret in all log redaction rules |
| **Key reuse across environments** | Same keys used in staging and production | Use separate keys per environment; include environment checks at startup |

## Audit Checklist

- [x] `PENDULUM_FUNDING_SEED` is used only for funding ephemeral Pendulum accounts — never for arbitrary extrinsics — ✅ PASS
- [ ] `MOONBEAM_EXECUTOR_PRIVATE_KEY` is used only for platform operations (funding, subsidization, XCM) — never for user-initiated EVM transactions — 🟡 PARTIAL (also aliased as `MOONBEAM_FUNDING_PRIVATE_KEY`, intentional)
- [x] `CryptoService.initializeKeys()` is called exactly once at startup — ✅ PASS
- [x] `CryptoService.getPrivateKey()` is `private` — not callable from outside the class — ✅ PASS
- [x] `CryptoService.getPublicKey()` is the only method that exposes key material — and it's the public key only — ✅ PASS
- [x] If `WEBHOOK_PRIVATE_KEY` is not set, a warning is logged (verified in current code) — ✅ PASS
- [x] RSA key generation uses 2048-bit modulus length minimum (verified: `modulusLength: 2048`) — ✅ PASS
- [x] Signing uses `RSA_PKCS1_PSS_PADDING` with `RSA_PSS_SALTLEN_MAX_SIGN` (verified in current code) — ✅ PASS
- [x] `X-Vortex-Signature` covers `timestamp.body`; body-only signatures do not verify (webhook-delivery.service) — ✅ PASS
- [x] Webhook registration binds an owner principal and rejects quotes the principal does not own with a uniform 404 (webhook.service `registerWebhook`) — ✅ PASS
- [x] Webhook deletion is owner-scoped; foreign webhook IDs return the same 404 as nonexistent ones — ✅ PASS
- [x] Delivery matching filters by quote owner in addition to quote/session targeting (`findWebhooksForEvent`) — ✅ PASS
- [x] Callback URLs: HTTPS only, no credentials, private/reserved IP literals rejected at registration; DNS re-resolved and checked before every delivery; `redirect: "error"` on delivery fetch — ✅ PASS
- [x] No server key (funding, executor, webhook) is ever included in API responses, logs, or error messages — ✅ PASS
- [x] Server startup fails if `PENDULUM_FUNDING_SEED` or `MOONBEAM_EXECUTOR_PRIVATE_KEY` is missing — ✅ PASS
- [ ] Funding and executor accounts hold minimal balances — only what's needed for near-term operations — ❓ N/A (operational check)
- [ ] Monitoring/alerts exist for unexpected balance changes on funding and executor accounts — ❓ N/A (no monitoring in codebase)
