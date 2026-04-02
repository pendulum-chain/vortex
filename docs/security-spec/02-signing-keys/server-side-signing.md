# Server-Side Signing Keys

## What This Does

The API server holds several private keys used for platform operations. These are distinct from ephemeral keys (which are client-side). Server keys are used for:

1. **Stellar funding operations** — `FUNDING_SECRET`: Stellar secret key used to create and fund ephemeral Stellar accounts, co-sign ephemeral transactions (as the second signer in the 2-of-2 multisig), and reclaim funds from orphaned ephemerals.
2. **Pendulum funding** — `PENDULUM_FUNDING_SEED`: Seed phrase for the Pendulum account that funds ephemeral Substrate accounts with native PEN tokens for transaction fees.
3. **Moonbeam execution** — `MOONBEAM_EXECUTOR_PRIVATE_KEY`: EVM private key used to execute transactions on Moonbeam (funding ephemerals with GLMR, executing subsidization transfers, XCM operations).
4. **Stellar client domain** — `CLIENT_DOMAIN_SECRET`: Used for SEP-10 (Stellar Web Authentication) client domain verification with Stellar anchors.
5. **Webhook signing** — `WEBHOOK_PRIVATE_KEY`: RSA private key (PEM format) used to sign webhook payloads with RSA-PSS + SHA-256. If missing, the `CryptoService` generates an ephemeral RSA keypair at startup (non-persistent).

All keys are loaded from environment variables. There is no HSM, secrets manager, or rotation mechanism.

## Security Invariants

1. **Server keys MUST only be used for their designated purpose** — The funding secret signs funding/merge transactions, the executor key executes platform operations. No key should be repurposed for user-level operations.
2. **`FUNDING_SECRET` MUST be the co-signer for Stellar 2-of-2 multisig** — The funding account keypair is used to co-sign ephemeral Stellar transactions alongside the client's ephemeral key. The funding account alone MUST NOT be able to move funds from the ephemeral (threshold is 2, each signer has weight 1).
3. **`WEBHOOK_PRIVATE_KEY` MUST be persistent across restarts** — If the env var is not set, `CryptoService` generates a new key pair in memory. This means webhook consumers who cached the public key will reject signatures after a restart. The env var MUST be set in production.
4. **RSA-PSS signing MUST use SHA-256 with maximum salt length** — The `signPayload` implementation uses `RSA_PKCS1_PSS_PADDING` and `RSA_PSS_SALTLEN_MAX_SIGN`. Consumers must use the same parameters to verify.
5. **The RSA private key MUST NOT be exposed via any API endpoint** — Only the public key should be available for webhook consumers to fetch. The `getPrivateKey()` method is correctly marked `private`.
6. **Key derivation MUST NOT be deterministic from public information** — Funding accounts, executor accounts, and webhook keys must be independently generated, not derived from the same master seed.
7. **Missing mandatory keys MUST prevent server startup** — If `FUNDING_SECRET`, `PENDULUM_FUNDING_SEED`, or `MOONBEAM_EXECUTOR_PRIVATE_KEY` are absent, the server cannot perform its core function and should refuse to start.
8. **The CryptoService singleton MUST initialize keys exactly once** — `initializeKeys()` should be called once at startup. Repeated calls should be idempotent or rejected.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Server compromise → key extraction** | Attacker gains shell access, reads env vars | All keys in env vars are extractable; no HSM protection. Mitigation: key separation limits blast radius — each key controls a different chain/function |
| **Funding account drain** | Attacker with `FUNDING_SECRET` creates unlimited Stellar accounts, draining XLM | Monitor funding account balance; alert on unusual creation volume; rate limit ramp creation |
| **Executor key abuse** | Attacker with `MOONBEAM_EXECUTOR_PRIVATE_KEY` drains GLMR or executes arbitrary EVM transactions | Executor account should hold minimal GLMR (just enough for near-term operations); monitor balance and transaction patterns |
| **Webhook signature forgery** | Attacker signs fake webhook payloads | RSA-2048 with PSS padding is computationally infeasible to forge without the private key; public key verification by consumers |
| **Non-persistent webhook key** | Server restarts without `WEBHOOK_PRIVATE_KEY`, generates new key; consumers can't verify old signatures | Set `WEBHOOK_PRIVATE_KEY` in production; warn at startup (current behavior: logs warning) |
| **Pendulum seed phrase exposure** | Seed phrase logged or leaked | Seed phrases should not be logged; `PENDULUM_FUNDING_SEED` should be treated as a secret in all log redaction rules |
| **Key reuse across environments** | Same keys used in staging and production | Use separate keys per environment; include environment checks at startup |

## Audit Checklist

- [ ] `FUNDING_SECRET` is used only in `stellar.service.ts` for account creation and co-signing — never for arbitrary Stellar operations — 🟡 PARTIAL (also aliased as `SEP10_MASTER_SECRET`, F-022)
- [x] `PENDULUM_FUNDING_SEED` is used only for funding ephemeral Pendulum accounts — never for arbitrary extrinsics — ✅ PASS
- [ ] `MOONBEAM_EXECUTOR_PRIVATE_KEY` is used only for platform operations (funding, subsidization, XCM) — never for user-initiated EVM transactions — 🟡 PARTIAL (also aliased as `MOONBEAM_FUNDING_PRIVATE_KEY`, intentional)
- [x] `CryptoService.initializeKeys()` is called exactly once at startup — ✅ PASS
- [x] `CryptoService.getPrivateKey()` is `private` — not callable from outside the class — ✅ PASS
- [x] `CryptoService.getPublicKey()` is the only method that exposes key material — and it's the public key only — ✅ PASS
- [x] If `WEBHOOK_PRIVATE_KEY` is not set, a warning is logged (verified in current code) — ✅ PASS
- [x] RSA key generation uses 2048-bit modulus length minimum (verified: `modulusLength: 2048`) — ✅ PASS
- [x] Signing uses `RSA_PKCS1_PSS_PADDING` with `RSA_PSS_SALTLEN_MAX_SIGN` (verified in current code) — ✅ PASS
- [x] No server key (funding, executor, webhook) is ever included in API responses, logs, or error messages — ✅ PASS
- [x] Server startup fails if `FUNDING_SECRET`, `PENDULUM_FUNDING_SEED`, or `MOONBEAM_EXECUTOR_PRIVATE_KEY` is missing — ✅ PASS
- [ ] Funding and executor accounts hold minimal balances — only what's needed for near-term operations — ❓ N/A (operational check)
- [ ] Monitoring/alerts exist for unexpected balance changes on funding and executor accounts — ❓ N/A (no monitoring in codebase)
