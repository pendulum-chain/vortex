# Monerium Integration

## What This Does

Monerium is a European e-money institution that issues EURe (Monerium EUR) tokens. Vortex uses Monerium for EUR on-ramp operations via SEPA bank transfers.

**Provider type:** On-ramp only  
**Fiat currency:** EUR (Euro)  
**Chains involved:** Moonbeam (Monerium EURe token), Pendulum (for Nabla swap if targeting AssetHub)  
**Phase handlers:**
- `monerium-onramp-mint-handler.ts` — Mints Monerium EUR tokens after SEPA payment is confirmed
- `monerium-onramp-self-transfer-handler.ts` — Transfers minted EURe tokens to the ephemeral account

**On-ramp flow:**
1. User initiates EUR on-ramp → receives SEPA payment details (IBAN, reference)
2. User makes SEPA bank transfer to Monerium's bank account
3. Monerium confirms payment receipt (SEPA settlement can take hours/days)
4. `moneriumOnrampMint` phase: Monerium mints EURe tokens to a designated address
5. `moneriumOnrampSelfTransfer` phase: EURe tokens are transferred to the ephemeral account
6. Tokens continue through SquidRouter swap pipeline (for EVM destinations) or Nabla swap pipeline (for AssetHub destinations)

**Key consideration:** SEPA transfers are not instant — settlement takes 1-3 business days. The ramp must handle this long-lived waiting state.

## Security Invariants

1. **Monerium API credentials MUST be stored as environment variables** — OAuth tokens, API keys, or any authentication material for the Monerium API must come from env vars.
2. **SEPA payment confirmation MUST come from Monerium's API, not from user input** — The system must verify with Monerium that the payment was received. User claiming "I paid" is not sufficient.
3. **The minted EURe amount MUST match the expected amount (minus Monerium's fee)** — After Monerium mints, verify the on-chain balance matches what was expected from the quote.
4. **Long waiting periods MUST NOT lock the ramp indefinitely** — SEPA takes 1-3 days. The ramp should have a maximum waiting period, after which it transitions to failed or requires user action.
5. **SEPA payment details MUST be generated server-side** — The IBAN, reference code, and amount shown to the user must come from the server/Monerium, not be client-controllable.
6. **Self-transfer (EURe to ephemeral) MUST verify receipt** — After transferring EURe to the ephemeral, verify the ephemeral's balance before advancing.
7. **Monerium interactions MUST be idempotent** — If the mint phase is retried, Monerium should not double-mint. Use order IDs or idempotency keys.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **SEPA payment spoofing** | User creates ramp but never makes the SEPA payment, hoping to receive crypto | System waits for Monerium confirmation; no tokens minted without confirmed payment |
| **SEPA reference manipulation** | User sends SEPA with wrong reference, causing misattribution | Reference codes should be unique per ramp and verified by Monerium |
| **Long-lived ramp exploitation** | Attacker creates many ramps with SEPA (knowing they'll wait days), tying up system resources | Limit concurrent pending SEPA ramps per user; expire ramps after maximum wait time |
| **Monerium mint amount mismatch** | Monerium mints a different amount than expected | Verify minted balance on-chain against expected amount; reject if discrepancy exceeds tolerance |
| **Double mint** | Phase retry causes Monerium to mint tokens twice | Idempotency keys on Monerium API calls; verify balance before and after mint |
| **Monerium API unavailability** | Monerium API is down during mint phase | `RecoverablePhaseError` with retry; ramp waits until Monerium recovers |

## Audit Checklist

- [ ] Monerium API credentials loaded from environment variables
- [ ] SEPA payment confirmation is verified via Monerium API before minting
- [ ] Minted EURe amount is verified on-chain against expected amount from quote
- [ ] Maximum wait time exists for SEPA payment (ramp doesn't wait indefinitely)
- [ ] SEPA payment details (IBAN, reference) are generated server-side
- [ ] `moneriumOnrampSelfTransfer` verifies ephemeral balance after transfer
- [ ] Monerium API calls use idempotency keys (if supported)
- [ ] Both phase handlers use `RecoverablePhaseError` for transient failures
- [ ] HTTPS enforced for all Monerium API calls
- [ ] No Monerium credentials or user IBAN details in logs
- [ ] Timeout configured for Monerium API calls
- [ ] Concurrent SEPA ramp limit per user is enforced
