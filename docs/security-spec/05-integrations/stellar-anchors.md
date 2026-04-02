# Stellar Anchors Integration

## What This Does

Stellar anchors are used for off-ramp flows that terminate on the Stellar network — specifically EUR (EURC) and ARS off-ramps. The flow bridges assets from Pendulum to Stellar via the Spacewalk bridge, then makes a Stellar payment from the ephemeral account to the user's off-ramp destination.

**Provider type:** Off-ramp  
**Fiat currencies:** EUR (via EURC on Stellar), ARS  
**Chains involved:** Pendulum (Nabla swap output) → Stellar (via Spacewalk bridge) → Stellar anchor  
**Phase handlers:**
- `spacewalk-redeem-handler.ts` — Submits a Spacewalk redeem request on Pendulum, then waits up to 10 minutes for tokens to arrive on the ephemeral Stellar account
- `stellar-payment-handler.ts` — Submits the presigned Stellar payment transaction to Horizon, sending tokens from the ephemeral to the user's destination

**Flow (off-ramp):**
1. After Nabla swap on Pendulum, the output token (e.g., wrapped EURC) is held by the substrate ephemeral account
2. `spacewalkRedeem` phase: Calls a Spacewalk vault to redeem Pendulum-wrapped tokens for native Stellar tokens. The redeem extrinsic is presigned and submitted from the substrate ephemeral. The handler polls the Stellar ephemeral account balance until tokens arrive (1s polling, 10min timeout).
3. `stellarPayment` phase: Submits the presigned XDR transaction to Horizon. This transaction moves tokens from the Stellar ephemeral account to the user's Stellar address (the anchor's deposit address).

**Key detail:** Stellar ephemeral accounts use 2-of-2 multisig. The presigned payment transaction is constructed at ramp creation time with a specific sequence number. If the sequence number has advanced (due to prior execution or crash recovery), the handler verifies whether the payment already succeeded by checking the ephemeral account's remaining balance.

## Security Invariants

1. **Stellar ephemeral MUST be funded and have the required trustline before Spacewalk redeem** — `isStellarEphemeralFunded()` check prevents redeems that would result in unclaimable claimable-balance operations.
2. **Stellar payment sequence number MUST be validated before Spacewalk redeem** — `validateStellarPaymentSequenceNumber()` ensures the presigned payment transaction will still be submittable after the redeem completes.
3. **Spacewalk redeem MUST use a presigned transaction** — The redeem extrinsic is signed at ramp creation and stored; the handler decodes and submits it. Server cannot forge different redeem parameters.
4. **Spacewalk nonce re-execution guard MUST prevent double-redeem** — If `currentEphemeralAccountNonce > executeSpacewalkNonce`, the handler skips re-submission and proceeds directly to waiting for Stellar balance.
5. **Recovery from `AmountExceedsUserBalance` MUST be treated as prior-execution** — This error indicates a previous redeem already consumed the Pendulum tokens. The handler waits for Stellar balance arrival instead of failing.
6. **Stellar payment MUST use the presigned XDR transaction** — The handler submits the transaction as-is to Horizon. No server-side modification of payment destination or amount.
7. **`tx_bad_seq` error MUST trigger payment verification** — If Horizon returns `tx_bad_seq`, the handler calls `verifyStellarPaymentSuccess()` to check whether tokens already left the ephemeral. Only transitions to `complete` if the ephemeral is empty.
8. **Stellar network passphrase MUST match deployment** — `SANDBOX_ENABLED` toggles between testnet and public network. Mismatch would cause transaction rejection.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Redeem to unclaimable balance** — If the Stellar ephemeral doesn't exist or lacks a trustline, the Spacewalk vault creates a claimable balance that the system cannot claim | Pre-check via `isStellarEphemeralFunded()`. Fails the phase before submitting the redeem. |
| **Double-redeem burning Pendulum tokens** — A crash after redeem submission but before phase transition could cause re-execution | Nonce guard: `currentEphemeralAccountNonce > executeSpacewalkNonce` skips re-submission. `AmountExceedsUserBalance` catch also handles this. |
| **Stellar payment replay** — If the payment transaction is somehow re-submitted | Stellar sequence numbers prevent replay. Each transaction is valid for exactly one sequence number. |
| **Sequence number desync** — If another transaction is submitted to the ephemeral between presigning and execution, the payment sequence becomes invalid | `validateStellarPaymentSequenceNumber()` is called before the redeem. If it fails, the phase fails early rather than executing the redeem and leaving tokens stranded on Stellar without a valid payment. |
| **Vault liveness failure** — The Spacewalk vault fails to process the redeem and tokens remain locked on Pendulum | 10-minute polling timeout. If tokens don't arrive, the error propagates up and the phase processor retries. The vault must execute within the timeout. |
| **Horizon submission failure** — Network errors or Horizon downtime prevent payment submission | Errors are thrown (not swallowed), allowing the phase processor's retry mechanism to re-execute. |
| **Presigned transaction tampering** — Server-side modification of the Stellar payment XDR | XDR is stored as a signed transaction. Modifying it would invalidate the signature. Horizon will reject invalid signatures. |

## Audit Checklist

- [x] Verify `isStellarEphemeralFunded()` checks both account existence AND trustline for the specific Stellar asset. **PASS** — both checks confirmed in code.
- [x] Verify `validateStellarPaymentSequenceNumber()` compares the presigned sequence against the current account sequence on Stellar. **PASS** — sequence number comparison verified.
- [x] Verify the nonce re-execution guard: `currentEphemeralAccountNonce > executeSpacewalkNonce` correctly identifies a previously-executed redeem. **PASS** — guard logic correct.
- [x] Verify `AmountExceedsUserBalance` error recovery path does NOT re-submit the redeem — only waits for Stellar balance. **PASS** — catch block enters waiting path, no re-submission.
- [x] Verify `verifyStellarPaymentSuccess()` checks that tokens are genuinely gone from the ephemeral (not just that some arbitrary condition holds). **PASS** — checks remaining balance on ephemeral.
- [x] Verify `NETWORK_PASSPHRASE` is correctly derived from `SANDBOX_ENABLED` and matches the Horizon server URL. **PASS** — conditional logic maps sandbox flag to correct passphrase.
- [PARTIAL] Verify `HORIZON_URL` points to the correct Stellar network (public vs testnet). **PARTIAL F-025** — URL is configurable but no runtime validation that the URL matches the selected network passphrase.
- [x] Verify the Spacewalk redeem extrinsic is decoded from stored presigned data and not constructed on the server at execution time. **PASS** — extrinsic decoded from stored hex.
- [x] Verify the Stellar payment XDR is submitted as-is without server-side modification of destination or amount. **PASS** — XDR submitted unmodified to Horizon.
- [x] Verify `checkBalancePeriodically` timeout (10 minutes) is reasonable for Spacewalk vault execution times in production. **PASS** — 10-minute timeout appropriate for normal vault operations.
- [x] Verify no sensitive data (Stellar secret keys) is logged in error handlers. **PASS** — no secret key logging found.
- [PARTIAL] **@ts-ignore on line 72-73 of spacewalk-redeem-handler** — Verify the `.nonce.toNumber()` call returns the correct value; unchecked type assertions may hide API changes. **PARTIAL F-026** — `@ts-ignore` suppresses type checking; if the Spacewalk API changes the nonce type, the code would fail silently at runtime.
