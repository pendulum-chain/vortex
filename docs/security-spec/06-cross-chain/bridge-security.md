# Bridge Security — Spacewalk

> **⚠️ FULLY DEPRECATED.** The Spacewalk/Stellar bridge path is no longer an active Vortex corridor. EUR has migrated to Mykobo on Base, and ARS now routes through Alfredpay where supported. `spacewalkRedeemHandler` and `stellarPaymentHandler` are not registered in the active phase registry. This page is retained as historical documentation for the prior bridge model; do not treat it as reachable production behavior.

## What This Does

Spacewalk is the bridge between the **Pendulum** parachain and the **Stellar** network. Historically, it enabled off-ramp flows that terminated on Stellar by converting Pendulum-wrapped Stellar tokens back to native Stellar tokens. Those corridors are now removed from the active Vortex phase registry.

The bridge operates through a **vault-based model**: independent vault operators lock collateral on Pendulum and process redeem requests. When a user (or ephemeral account) wants to redeem Pendulum-wrapped tokens for their Stellar originals, a vault is selected, the wrapped tokens are burned on Pendulum, and the vault releases the native tokens on Stellar.

**Key components:**
- `spacewalk-redeem-handler.ts` — Phase handler that submits the redeem extrinsic on Pendulum and waits for tokens on Stellar
- `createVaultService()` — Selects a vault based on asset code, issuer, and requested amount
- Presigned Stellar payment transaction — Moves tokens from the Stellar ephemeral to the user's destination after redeem
- Nonce guard — Prevents double-execution of the redeem extrinsic

**Trust model:** Vortex trusts the Spacewalk bridge protocol and the selected vault to faithfully process redeems. The vault selection is automated based on available capacity. There is no Vortex-operated vault — all vaults are third-party operators.

## Security Invariants

1. **Vault selection MUST match the redeemed asset exactly** — `createVaultService()` filters vaults by `assetCode` and `assetIssuer`. A mismatch would send tokens to a vault that cannot redeem the correct Stellar asset.
2. **Vault MUST have sufficient capacity for the requested amount** — The vault selection logic checks available capacity. Requesting more than available capacity would fail the redeem or result in partial execution.
3. **Redeem extrinsic MUST be presigned** — The handler decodes and submits a presigned extrinsic from stored ramp state. The server cannot forge different redeem parameters (different vault, different amount, different destination) at execution time.
4. **Nonce guard MUST prevent double-redeem** — If `currentEphemeralAccountNonce > executeSpacewalkNonce`, the redeem has already been submitted. The handler skips re-submission and proceeds to wait for Stellar balance.
5. **`AmountExceedsUserBalance` MUST be treated as prior execution** — This Spacewalk error indicates the wrapped tokens were already burned (by a prior redeem attempt). The handler enters the waiting path instead of failing.
6. **Stellar ephemeral MUST be funded before redeem** — `isStellarEphemeralFunded()` verifies the Stellar ephemeral account exists and has the required trustline. Without this, the vault would create an unclaimable claimable-balance operation on Stellar.
7. **Bridge timeout MUST be enforced** — The handler polls Stellar ephemeral balance with a 10-minute timeout. If the vault fails to execute, the error propagates for retry.
8. **No Vortex-operated vaults** — All vaults are third-party. Vortex has no ability to guarantee vault liveness, honest execution, or collateral sufficiency beyond what the Spacewalk protocol enforces.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Vault liveness failure** — Selected vault goes offline after redeem is submitted, tokens burned on Pendulum but never released on Stellar | Spacewalk protocol has a built-in timeout and vault collateral slash mechanism. If the vault doesn't execute within the protocol timeout, the redeemer can cancel the redeem and the vault's collateral is slashed. Vortex's 10-minute polling timeout causes the handler to fail (recoverable), allowing the phase processor to retry and eventually either succeed or escalate. |
| **Vault collateral insufficiency** — Vault doesn't have enough collateral to back the redeem, and the protocol allows it anyway | This is a Spacewalk protocol-level concern. If the protocol's collateral checks are insufficient, Vortex has no additional mitigation. The redeem could succeed nominally but the vault may default. |
| **Malicious vault** — Vault operator intentionally delays or fails to process redeems | Same collateral slash mechanism as liveness failure. The economic incentive (losing collateral) deters malicious behavior. Vortex cannot independently verify vault honesty beyond what Spacewalk enforces. |
| **Double-redeem burning tokens twice** — Crash after redeem submitted but before phase transition causes re-execution | Nonce guard and `AmountExceedsUserBalance` catch both prevent double-submission. The handler detects prior execution and skips to the waiting phase. |
| **Vault selection manipulation** — Attacker influences which vault is selected to route funds to a colluding vault | Vault selection is server-side using `createVaultService()`. An attacker would need server compromise to influence selection. The selection logic is deterministic based on asset and capacity. |
| **Stellar ephemeral not funded** — Redeem succeeds but tokens arrive as unclaimable balance on Stellar | `isStellarEphemeralFunded()` pre-check prevents this. Phase fails before the redeem extrinsic is submitted. |
| **Bridge protocol upgrade** — Spacewalk upgrades change redeem mechanics, breaking assumptions | Presigned extrinsics may become invalid after protocol upgrades. No automatic detection — requires manual monitoring of Spacewalk releases and parachain runtime upgrades. |
| **Claimable balance stuck** — If the pre-check is bypassed or has a bug, tokens end up as a claimable balance that the system cannot automatically claim | The current code has no claimable-balance recovery mechanism. Tokens would require manual intervention to recover from the Stellar ephemeral. |

## Audit Checklist

- [x] Verify `createVaultService()` filters by both `assetCode` AND `assetIssuer` — not just one. **PASS** — both fields used in vault selection filter.
- [x] Verify vault capacity check is performed before vault selection — not after. **PASS** — capacity checked during selection.
- [x] Verify the redeem extrinsic is decoded from stored presigned data, not constructed at execution time. **PASS** — decoded from stored hex.
- [x] Verify nonce guard: `currentEphemeralAccountNonce > executeSpacewalkNonce` correctly identifies prior execution. **PASS** — nonce guard logic verified.
- [x] Verify `AmountExceedsUserBalance` catch path does NOT re-submit the redeem — only enters the Stellar balance waiting loop. **PASS** — catch enters waiting path only.
- [x] Verify `isStellarEphemeralFunded()` checks both account existence AND the trustline for the specific Stellar asset being redeemed. **PASS** — both checks present.
- [x] Verify the 10-minute balance polling timeout is enforced and throws a recoverable error on expiry. **PASS** — timeout with recoverable error confirmed.
- [x] Verify no fallback to a default vault if the selected vault fails — the error should propagate, not silently pick another vault mid-execution. **PASS** — error propagates; no silent fallback.
- [PARTIAL] Verify Spacewalk protocol's vault slash/cancel mechanism is understood and documented for operational runbooks. **PARTIAL** — protocol mechanism understood but no operational runbook exists.
- [EXISTING FINDING] Verify the `@ts-ignore` annotations in `spacewalk-redeem-handler.ts` (lines 72-73) — check that `.nonce.toNumber()` returns the correct value and the type assertion hasn't hidden an API change. **EXISTING FINDING F-026** — `@ts-ignore` suppresses type safety; API changes would fail silently.
- [PARTIAL] Check whether Spacewalk has a maximum redeem amount per vault per transaction — if so, verify Vortex respects it. **PARTIAL** — vault capacity is checked but no explicit max-per-transaction enforcement verified at Spacewalk protocol level.
- [x] Verify there is no claimable-balance recovery mechanism — document as a known operational gap if absent. **PASS (confirmed absent)** — no recovery mechanism exists; documented as known gap.
