# Monerium B2B Onramp — Terms & Disclosure Inputs (D4)

**Status:** engineering inputs for G2 legal review and the partner agreement — not final legal
text. Every bracketed value **[ID: …]** is a placeholder tracked in the
[deferred-decisions registry](./monerium-onramp-deferred-decisions.md); G2/partner own the final
wording, engineering owns the factual accuracy of the mechanics described.

**Sources:** [b2b-variant doc](./monerium-eur-usdc-onramp-b2b-variant.md) §6,
[implementation plan](./monerium-b2b-implementation-plan.md) §5 (R08/R11 dispositions).

## 1. Redemption limitation (registry B6 — committed to Monerium)

Monerium's acceptance of the attestor pattern is conditional on clients being told explicitly
that the setup limits direct redemption. Commitment made in the TG thread 2026-07-17; this
disclosure is **mandatory** in the client terms.

Draft text:

> EURe received at your dedicated forwarding address **cannot be redeemed directly with
> Monerium from that address**. If you need to redeem EURe (rather than receive the automatic
> USDC conversion), you must first withdraw it to your fallback address — from which you can
> redeem normally — or, as a last resort, use Monerium's recovery process, which pays out only
> to your own verified bank account.

Notes for G2: the issuer recovery backstop is best-effort until its technical mechanism is
settled **[T1: recovery-message format unanswered — if unresolved at deploy, recovery for
contract addresses fails closed and the fallback address is the only redemption path; the
disclosure must not overpromise the backstop]**.

## 2. Destination warranty & CEX rotation liability (registry B5)

Allocation follows the traditional payout-processor model: a wrong/closed destination account is
the instructing party's loss; contractual allocation is the only mechanism that can hold this
risk, since a CEX deposit address's continued validity is not verifiable on-chain.

Structure to draft:

- **Client/partner warrants** that the named `destination` is valid, under the client's control
  (or a deposit address of an account under the client's control), and that they will notify
  Vortex of any change **before** further deposits.
- **Client/partner bears** losses from destination rotation, closure, or mis-crediting by the
  destination platform.
- **Exchange-address attestation:** for CEX destinations the client attests awareness of
  rotation and minimum-deposit behavior.
- **Vortex diligence commitments** (the consideration for the warranty): a verification transfer
  before activation **[B2: 5 USDC]**; automatic pause after prolonged inactivity pending
  re-confirmation (§3); minimum forward size at or above the destination's minimum deposit
  **[P6: minSwapAmount, €25 floor]**; and never sending unconverted EURe to the destination.
- **Destination changes are client-only:** only the client's fallback key can change the
  destination on-chain; Vortex cannot redirect funds (see §6).

## 3. Dormancy re-confirmation (registry B5, P5)

> If no conversion completes for **[P5: 60 days]**, forwarding pauses automatically and resumes
> only after you (or the partner on your behalf) re-confirm that your payout address is still
> valid. Deposits made while paused remain in your forwarding account and convert after
> re-confirmation; your fallback-address rights are unaffected by the pause.

Mechanics reference for the drafters: `docs/runbooks/monerium-b2b-dormancy.md`. The
re-confirmation channel (partner API ping vs written confirmation) is a partner-agreement
decision **[B5]**.

## 4. Fee disclosure structure (registry B1, P1, P2)

Fee and slippage are disclosed **separately** — one is deterministic, the other a worst-case
market bound:

- **Service fee:** a per-client percentage fixed at account creation and immutable thereafter,
  assessed on the gross USDC output of each conversion. Current pilot value **[B1: 0]**;
  contractual ceiling equal to the on-chain immutable cap **[P2: MAX_FEE_BPS = 100 bps = 1%]**.
- **Conversion bound (not a fee):** each conversion delivers **at least** the Chainlink EUR/USD
  reference rate minus **[P1: SLIPPAGE_BPS = 100 bps = 1%]**, or it does not execute at all
  (deposits then wait and retry). This bound covers market execution and both stablecoins'
  deviation from their pegs; it is enforced by the contract, assuming an honest oracle — it is
  not a principal guarantee under oracle failure or a stablecoin collapse beyond the bound.
- Batching: deposits arriving between conversions are converted together; fee and output are
  allocated pro-rata by deposit amount, so batching never changes a client's effective rate.

## 5. Processing SLA (registry B3)

Placeholder wording pending the business decision:

> Deposits at or above the minimum **[P6: €25]** convert **[B3: within 1 business hour]** under
> normal market conditions. Conversions execute on weekends; the EUR/USD reference rate updates
> less frequently outside FX market hours **[T2/P8: observed weekend gaps up to 48 h; oracle
> staleness ceiling 52 h]**, so weekend conversions may execute at a rate up to that age —
> always within the conversion bound of §4. Deposits below the minimum accumulate until the
> minimum is reached.

Include: SLA is a service target, not a guarantee; keeper outages beyond
**[P4: TRIGGER_DELAY = 24 h]** open a permissionless execution path so conversion does not
depend on Vortex's liveness.

## 6. Vortex-powers and self-custody disclosures (plan §5 R08/R11)

- **What Vortex can do:** deploy the account, run the conversion, pause it (per-account and
  globally), and tune bounded operational parameters. **What Vortex cannot do:** move, redeem,
  or redirect funds; every exit target is client-controlled. Pauses can delay conversions but
  never block the client's fallback-address rights or the delayed automatic sweep to the
  fallback address **[P3: 60 days]**.
- **Fallback-key responsibility (R11 — do not overpromise):** exit guarantees are scoped to the
  client's continued control of their fallback key, plus the issuer backstop (best-effort,
  §1 note). Loss of the fallback key combined with a broken destination is an ordinary
  self-custody residual risk and is borne by the client.
- **Deposit acceptance:** Vortex cannot prevent inbound SEPA to an issued IBAN; deposits during
  a pause accumulate as EURe at the forwarding address under the protections above.
