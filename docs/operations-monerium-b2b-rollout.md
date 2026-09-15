# Monerium B2B Onramp — Rollout

What still stands between the implemented system and a live pilot: the gates, the deploy
checklist, and the engineering inputs for terms drafting. Decisions and parameters are
final in [`adr-0005-monerium-b2b-onramp.md`](adr-0005-monerium-b2b-onramp.md);
procedures in [`operations-monerium-b2b-runbook.md`](operations-monerium-b2b-runbook.md).

## Gates

**G1 — written approval package from Monerium.** Everything below exists only as
verbal/Telegram statements; consolidate into the MSA or a side letter:

1. Attestor-pattern acceptance (verbally accepted, conditional on fallback capability —
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
   forcing a rollback once conversions have been attributed.
2. **Treasury first (O2):** create the dedicated fee Safe multisig — `FEE_RECIPIENT` is
   immutable in the implementation. Confirm guardian key custody plan (EOA acceptable
   for pilot; hardware/multisig at GA).
3. Re-verify the initial route's pools and fee tiers at the deploy block (P10) and re-run
   the liquidity baseline quote methodology (T6); confirm `perSwapCap` €25k still
   executes within floor plus the per-swap subsidy cap, and decide whether a second
   route (direct EURe→USDC or other tiers) is worth whitelisting from day one.
4. Deploy implementation + factory with the final parameters (ADR table: 52 h oracle
   age, 40 bps floor on the net, 1% fee cap, 100 bps reference band, 7 d/24 h delays,
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
   > EURe received at your dedicated forwarding address cannot be redeemed directly
   > with Monerium from that address. If you need to redeem EURe (rather than receive
   > the automatic USDC conversion), you must first withdraw it to your fallback
   > address — from which you can redeem normally — or use Monerium's recovery
   > process, which pays out only to your own verified bank account.

   (The recovery backstop is functional as built — T1 resolved — but keep it framed as
   Monerium's process, subject to their verification.)
2. **Destination warranty & CEX rotation (B5 — Tier A accepted).** Client/partner
   warrants the destination is valid and under the client's control and notifies Vortex
   of changes before further deposits; client/partner bears rotation/closure/
   mis-crediting losses; CEX destinations carry an explicit rotation/minimum-deposit
   attestation. Vortex's diligence consideration: 5 USDC penny test before activation,
   the 60-day dormancy gate, minimum forward at or above the destination's minimum
   deposit, and never sending unconverted EURe to the destination. Destination changes
   are client-only (fallback key); Vortex cannot redirect funds.
3. **Dormancy re-confirmation (P5/B5).** Draft:
   > If no conversion completes for 60 days, forwarding pauses automatically and
   > resumes only after you (or the partner on your behalf, in writing) re-confirm your
   > payout address. Deposits made while paused remain in your forwarding account and
   > convert after re-confirmation; your fallback-address rights are unaffected. Once
   > a balance has waited 7 days without conversion, anyone may return it to your
   > fallback address instead.
4. **Rate, fee and subsidy (B1/P1/P2/P12/P13)** — disclose the guarantee, the fee and
   the hard bound separately:
   - Reference rate: a five-minute volume-weighted average of the Coinbase Exchange
     EURC-USD market, computed immediately before each conversion from public
     one-minute candles and recorded with the conversion (widened to a one-hour
     average when the five minutes carry no trades). The agreement's "Coinbase EURC
     oracle" — align the wording; the source is the exchange market, weekdays and
     weekends alike, smoothed so a single thin print cannot set the rate.
   - Guarantee: each keeper-executed conversion delivers the reference rate minus
     12.5 bps whenever the market allows it, and never less than the reference minus
     15 bps. Vortex's fee is whatever the market delivers above the 12.5 bps target,
     contractually capped at the on-chain 1%; below the 15 bps floor Vortex tops the
     conversion up from its own subsidy budget. The 12.5 bps target and 15 bps floor are
     per client; raising either requires a 24 h on-chain pre-announcement (P11),
     lowering is immediate.
   - Subsidy limits: top-ups are capped per conversion and per day (P13). When the
     budget cannot cover a conversion, the conversion waits rather than executing below
     the floor. After a conversion has waited 24 hours, anyone may execute it at the
     unsubsidized Chainlink-bounded terms below; the guarantee applies to conversions
     Vortex's keeper executes.
   - Hard bound (not a fee): no conversion ever delivers less than the Chainlink
     EUR/USD rate minus 0.4% after fee and subsidy, or it does not execute. Enforced by
     the contract assuming an honest oracle; not a principal guarantee under oracle
     failure or a stablecoin collapse beyond the bound.
   - Batching never changes a client's effective rate: co-converted deposits split fee,
     subsidy and output pro-rata by amount.
5. **Processing SLA (B3 — decided: same business day).** Draft:
   > Deposits at or above the minimum convert the same business day under normal
   > market conditions. Conversions also execute on weekends; the EUR/USD reference
   > rate updates less frequently outside FX market hours (staleness ceiling 52 h), so
   > weekend conversions may execute at a rate up to that age — always within the
   > conversion bound. Deposits below the minimum accumulate until it is reached.

   Include: the SLA is a service target, not a guarantee; keeper outages beyond 24 h
   open a permissionless execution path, so conversion does not depend on Vortex; a
   conversion deliberately held back by the subsidy limits is disclosed as waiting, not
   failed.
6. **Vortex powers & self-custody disclosure.** What Vortex can do: deploy the account,
   run the conversion, pause it, tune bounded parameters, adjust the fee policy within
   the disclosed cap and timelock, choose the swap route among an on-chain validated
   set, and fund or limit its own subsidy budget. What Vortex cannot do: move, redeem, or redirect funds —
   every exit target is client-controlled, and pauses never block the fallback rights
   or the delayed automatic sweep. Exit guarantees are scoped to the client's continued
   control of their fallback key (loss of that key plus a broken destination is an
   ordinary self-custody residual, borne by the client). Vortex cannot prevent inbound
   SEPA to an issued IBAN; deposits during a pause accumulate safely as EURe.

## Open items ledger

| Item | Owner | Status |
|---|---|---|
| G1 package (9 items) | Marcel ↔ Monerium | All verbal; consolidate in writing |
| G2 legal scope | Counsel | Not started |
| G3 audit | External | After PR merge; params final |
| SulPayments agreement (terms above) | Marcel ↔ partner | Drafting inputs ready |
| Sandbox SEPA simulation + 3 TODO(sandbox) pins | Engineering (needs Marcel's sandbox login) | Open — only remaining engineering unknown |
| Fee Safe multisig creation | Ops | Before implementation deploy; also the subsidy vault's treasury |
| Reference wording in the partner agreement | Marcel ↔ partner | Agreement says "Coinbase EURC oracle"; implementation uses a five-minute VWAP of Coinbase Exchange EURC-USD candles — confirm that is what was meant |
| Reference band value (P12, 100 bps) | Engineering | Confirm against observed weekend Chainlink gaps before the implementation deploy (immutable) |
| Subsidy vault funding and refill cadence | Ops | Before first activation; runbook §2.6 |
| GA items | Engineering | Backend volume-limit enforcement (revisit), guardian key to hardware/multisig, O1 migration endpoint when first needed |
