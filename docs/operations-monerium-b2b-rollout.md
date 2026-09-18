# Monerium B2B Onramp — Rollout

What still stands between the implemented system and a live pilot: the gates, the deploy
checklist, and the engineering inputs for terms drafting. Decisions and parameters are
final in [`adr-0005-monerium-b2b-onramp.md`](adr-0005-monerium-b2b-onramp.md);
procedures in [`operations-monerium-b2b-runbook.md`](operations-monerium-b2b-runbook.md).

## Gates

**G1 — written approval package from Monerium.** Everything below exists only as
verbal/Telegram statements; consolidate into the MSA or a side letter:

1. Attestor-pattern acceptance (verbally accepted, conditional on fallback capability —
   **re-approval needed (2026-09-17):** the fallback is now a Vortex-held recovery
   wallet linked to a Vortex/SatoshiPay company profile, and that one profile refunds
   many client corporates by SEPA; ask alongside whether `supportingDocumentId` is
   required for a return-to-originator above EUR 15,000 and what outgoing limits apply —
   mandatory by design, so the condition is met).
2. Redemption-limitation disclosure obligation (their request; our commitment — §Terms 1).
3. Issuer recovery backstop: burn from a linked address, payout only to the customer's
   own external bank account, no fees, re-verification possible — **including the
   2026-08-26 statement that recovery validates the same ownership message as linking**
   (which is why it works against the forwarder as built).
4. IBAN pinning: authorization requirements for `PATCH /ibans` / `POST /addresses` on
   whitelabel profiles (the S1 preventive control).
5. OAuth→whitelabel profile portability and whether the whitelabel `client_id`
   auto-accesses existing profiles.
6. SEPA recall / fraud loss allocation after conversion+forwarding.
7. Per-IBAN suspension capability for incident response.
8. Corporate KYB mechanism for direct (non-reliance) clients — not needed for the
   SulPayments pilot, still an MSA item.
9. Advance notice of any change to the EIP-1271 ownership/link message (and the
   recovery message): the forwarder whitelists their exact hashes, so an unannounced
   change fail-closes new onboarding.

**G2 — legal review** (not started): custody opinion on the attestor construction; MiCA
exchange/transfer-service scoping (non-custody is not the whole question); disclosure
enforceability; DPA with Monerium; sanctions screening for destinations; scope of the
bounded, pre-announced guardian fee-policy power (P11), the route whitelist (P10) and
the subsidy vault (P13).

**G3 — external contract audit.** Parameters are final (ADR); the internal reviews and
the invariant suite are done, but this moves client funds.

**G4 — pilot.** SulPayments agreement signed (terms inputs below), reliance
attestations per customer, 3–5 clients at **€50k/client/day** (paper control), launch
fee policy 12.5 bps target / 15 bps floor (B1).

## Deploy checklist (mainnet bring-up)

1. Apply database migrations from exactly one deployment instance. Migration execution
   is not serialized across replicas; do not let multiple instances run the migrator
   concurrently. Migrations 076/077 install allocation accounting and its exact
   same-block boundary. Treat 076 as forward-only after activation: its `down` migration
   refuses to discard any existing allocation rows, so restore from backup instead of
   forcing a rollback once conversions have been attributed. Migrations 078/079 add the
   ppm fee policy and the pricing columns: before applying them, confirm no `Pending`
   `monerium_conversion_executions` row has a NULL `reference_rate_raw` or `route_index`
   (it would stay in flight forever and block its account) and no deposit-converted
   outbox delivery is still pending (it would replay without the `execution` block).
2. **Treasury first (O2):** create the dedicated fee Safe multisig — `FEE_RECIPIENT` is
   immutable in the implementation. Confirm guardian key custody plan (EOA acceptable
   for pilot; hardware/multisig at GA).
3. Re-verify the initial route's pools and fee tiers at the deploy block (P10) and re-run
   the liquidity baseline quote methodology (T6); confirm `perSwapCap` €25k still
   executes within floor plus the per-swap subsidy cap, and decide whether a second
   route (direct EURe→USDC or other tiers) is worth whitelisting from day one.
4. Deploy implementation + factory with the final parameters (ADR table: 52 h oracle
   age, 60 bps floor on the net, 1% fee cap, 100 bps reference band, 2 h recovery / 24 h
   trigger delays, the recovery wallet address (a dedicated linked address on the Vortex
   company profile — onboard that profile in the whitelabel app first),
   €25 floor/€50k ceiling, initial 5 bps/5 bps route); set operational `minSwapAmount`
   €250 and `perSwapCap` €25k; register the keeper key.
4a. Deploy `VortexSubsidyVault` (USDC, the fee Safe as treasury, the factory, 50 bps per
   swap, 200 USDC per day — P13), point the factory at it (`setSubsidyVault`), and fund
   it from the treasury with the first days of budget. Runbook §2.6 has the commands.
5. Verify factory + implementation source on the block explorer; generate, verify, and
   publish the manifest.
6. Production whitelabel credentials from Monerium; configure the keeper backend (the
   mykobo flow variant only): credentials, attestor/keeper/guardian keys (three distinct;
   keeper funded), read RPC + private orderflow RPC, webhook secret, and
   `MONERIUM_B2B_FORWARDER_FACTORY_ADDRESS`; the backend needs outbound HTTPS to
   `api.exchange.coinbase.com` for the reference rate (P12) — without it every swap
   defers. Keep `MONERIUM_B2B_ENABLED=false` until every remaining gate is complete.
7. Register the webhook endpoint at Monerium (`profile.updated`, `iban.updated`,
   `order.created`, `order.updated`).
8. Before first production onboarding, simulate a SEPA deposit end to end (dashboard →
   Receive → "Simulate bank transfer") and re-verify the signed `webhook-id`,
   `webhook-timestamp`, and `webhook-signature: v1,<base64>` fixture against a real
   production delivery.
9. SulPayments side: manager profile configured (EU corridor, business type), secret
   credential issued, deposit-event webhook registered and verifying signatures against
   `GET /v1/public-key`.
10. Confirm every mapped forwarder has a zero EURe balance before the first enablement.
    The mint cursor bootstraps at the current settled head and intentionally does not
    convert historic, unindexed balances; reconcile any pre-existing balance manually.
11. Set `MONERIUM_B2B_ENABLED=true` on only the designated `mykobo` keeper backend and
   restart. Startup must fail if any required B2B setting is absent. Confirm the routes,
   raw webhook parser, and keeper are active before accepting a deposit.
12. Per client: runbook §1 (deploy clone → map → automated link/IBAN → penny test →
   activate).

## Terms & disclosure inputs (engineering-accurate; G2/partner own final wording)

1. **Redemption limitation (B6 — mandatory, committed to Monerium).** Draft:
   > EURe received at your dedicated forwarding address cannot be redeemed with Monerium
   > from that address and cannot be withdrawn by you. It is converted to USDC and sent
   > to your payout address as one transfer per payment; a payment that cannot be
   > converted within the promised window is refunded by Vortex, in EUR and in full, to
   > the bank account it was sent from. Monerium's recovery process, which pays out only
   > to your own verified bank account, remains available as a backstop.

   (The recovery backstop is functional as built — T1 resolved — but keep it framed as
   Monerium's process, subject to their verification.)
2. **Destination warranty & CEX rotation (B5 — Tier A accepted).** Client/partner
   warrants the destination is valid and under the client's control and notifies Vortex
   of changes before further deposits; client/partner bears rotation/closure/
   mis-crediting losses; CEX destinations carry an explicit rotation/minimum-deposit
   attestation. Vortex's diligence consideration: 5 USDC penny test before activation,
   the 60-day dormancy gate, minimum forward at or above the destination's minimum
   deposit, and never sending unconverted EURe to the destination. The destination is
   fixed per account: a change means a new forwarding account (and IBAN move) set up by
   Vortex on the partner's written instruction; Vortex cannot redirect funds.
3. **Dormancy re-confirmation (P5/B5).** Draft:
   > If no conversion completes for 60 days, forwarding pauses automatically and
   > resumes only after you (or the partner on your behalf, in writing) re-confirm your
   > payout address. Deposits made while paused remain in your forwarding account and
   > convert after re-confirmation. A payment received while paused that cannot be
   > converted within the promised window is refunded in full to the bank account it
   > came from.
4. **Rate, fee and subsidy (B1/P1/P2/P12/P13)** — disclose the guarantee, the fee and
   the hard bound separately:
   - Reference rate: the midpoint between the best bid and the best ask on the Coinbase
     Exchange EURC-USDC market, read immediately before each conversion from the public
     ticker and recorded with the conversion; a conversion waits while the spread is
     wider than 0.5%. The agreement's "Coinbase EURC oracle" — align the wording; the
     source is the exchange market, weekdays and weekends alike.
   - Guarantee: each keeper-executed conversion delivers the reference rate minus
     12.5 bps whenever the market allows it, and never less than the reference minus
     15 bps. Vortex's fee is whatever the market delivers above the 12.5 bps target,
     contractually capped at the on-chain 1%; below the 15 bps floor Vortex tops the
     conversion up from its own subsidy budget. The 12.5 bps target and 15 bps floor are
     per client; raising either requires a 24 h on-chain pre-announcement (P11),
     lowering is immediate.
   - Subsidy limits: top-ups are capped per conversion and per day (P13), and the
     amount Vortex is willing to top up grows with the time a chunk has waited for the
     market (P14: nothing for the first six minutes, then in steps up to the cap). A
     chunk therefore executes as soon as the market delivers the floor on its own, or
     once Vortex's willingness to pay meets the shortfall; when neither happens within
     the promised window the payment is refunded. After a conversion has waited 24 hours, anyone may execute it at the
     unsubsidized Chainlink-bounded terms below; the guarantee applies to conversions
     Vortex's keeper executes.
   - Hard bound (not a fee): no conversion ever delivers less than the Chainlink
     EUR/USD rate minus 0.6% after fee and subsidy, or it does not execute. When the
     Coinbase reference sits below that bound, Vortex makes up the difference from its
     own budget within the disclosed limits, so the client receives the bound rather
     than the reference deal; when the difference exceeds those limits the conversion
     waits. Enforced by the contract assuming an honest oracle; not a principal
     guarantee under oracle failure or a stablecoin collapse beyond the bound.
   - Each payment converts on its own, in chunks when it exceeds the per-conversion cap,
     and reaches the payout address as a single transfer once every chunk is done; the
     chunks' rates, fees and subsidies are reported per chunk.
5. **Processing SLA (B3 — decided: same business day).** Draft:
   > A payment is converted and delivered within two hours of its arrival under normal
   > market conditions, on weekends as well. A payment that cannot be converted within
   > that window — a market move beyond the conversion bound, a liquidity or subsidy
   > shortfall, or an operational fault — is not held: Vortex refunds the full EUR amount
   > to the bank account it was sent from. Payments below the minimum are refunded the
   > same way. The EUR/USD reference rate updates less frequently outside FX market
   > hours (staleness ceiling 52 h), so weekend conversions may execute at a rate up to
   > that age — always within the conversion bound.

   Include: the window is enforced on chain (funds cannot move to Vortex's refund wallet
   before it elapses); keeper outages beyond 24 h open a permissionless execution path,
   so conversion does not depend on Vortex; the refund is automated in a later phase and
   operator-run until then (runbook §2.7); a refund reverses the fee (none is kept on a
   refunded payment's delivered amount — chunk fees already taken are Vortex's cost).
6. **Vortex powers & custody disclosure (amended 2026-09-17).** What Vortex can do:
   deploy the account, run the conversion, pause it, tune bounded parameters, adjust the
   fee policy within the disclosed cap and timelock, choose the swap route among an
   on-chain validated set, fund or limit its own subsidy budget, and — for a payment
   the promised window was missed on, and only then — move that payment to its own
   recovery wallet in order to refund it. What Vortex cannot do: redirect funds. The
   contract can pay only the client's payout address, Vortex's fee treasury, and the
   fixed Vortex recovery wallet, and it refuses a recovery before the window has
   elapsed. Vortex holds custody of a client's funds only on that refund path; the
   client has no key of their own and no unilateral exit — the partner accepts this
   (written confirmation, G1). Should Vortex disappear, anyone may complete conversions
   permissionlessly after 24 hours. Vortex cannot prevent inbound SEPA to an issued IBAN;
   deposits during a pause accumulate safely as EURe until converted or refunded.

## Open items ledger

| Item | Owner | Status |
|---|---|---|
| G1 package (9 items) | Marcel ↔ Monerium | All verbal; consolidate in writing |
| G2 legal scope | Counsel | Not started |
| G3 audit | External | After PR merge; params final |
| SulPayments agreement (terms above) | Marcel ↔ partner | Drafting inputs ready |
| Sandbox SEPA simulation + 3 TODO(sandbox) pins | Engineering (needs Marcel's sandbox login) | Open — only remaining engineering unknown |
| Fee Safe multisig creation | Ops | Before implementation deploy; also the subsidy vault's treasury |
| Reference wording in the partner agreement | Marcel ↔ partner | Agreement says "Coinbase EURC oracle"; implementation uses the Coinbase Exchange EURC-USDC bid/ask midpoint (spot, since 2026-09-18) — confirm that is what was meant |
| Subsidy ladder calibration | Ops ↔ product | Launch ladder in P14; retune from the `deferring conversion` shortfall lines and the vault spend after the first weeks; raise the vault's per-swap cap to the ladder's top before enabling |
| Reference band value (P12, 100 bps) | Engineering | Confirm against observed weekend Chainlink gaps before the implementation deploy (immutable). The effective downside margin is `SLIPPAGE_BPS − floorPpm` ≈ 45 bps after the 2026-09-17 move to 60 bps: the twelve-month replay on spot (2026-09-18, ADR amendment 3) shows six minute-long blips a year at that margin outside the 2025-10 depeg weekend, so ordinary weekends do not refund; the depeg weekend (39.7 h out of the 100 bps band) does, by design |
| Recovery wallet + float wallet | Ops ↔ Monerium | Onboard a Vortex/SatoshiPay company profile in the whitelabel app; link one dedicated address as `RECOVERY_WALLET` (immutable at implementation deploy) and one as the EURe float; fund the float; keys into the keeper's KMS before recovery is automated |
| Refund automation | Ops | Implemented (`recovery.ts`): ship with `MONERIUM_B2B_AUTO_RECOVERY=alert`, observe one sandbox refund end to end, then `auto` with the recovery and float keys set; refunds of EUR 15,000 or more stay manual until G1 settles the supporting-document question |
| Sandbox SEPA simulation: payer counterpart | Engineering (needs Marcel's sandbox login) | Capture one real issue-order webhook to confirm `counterpart.identifier.iban` / `details.name` arrive as the spec says (the refund target) |
| Subsidy vault funding and refill cadence | Ops | Before first activation; runbook §2.6 |
| GA items | Engineering | Backend volume-limit enforcement (revisit), guardian key to hardware/multisig, O1 migration endpoint when first needed |
