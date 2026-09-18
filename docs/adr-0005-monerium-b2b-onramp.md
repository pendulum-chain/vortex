# ADR 0005: Monerium B2B Zero-Touch Onramp

**Status:** Accepted (selected 2026-07-17; parameters finalized and documents consolidated
2026-08-26; amended 2026-09-15 with reference-priced fee bands, the subsidy vault, the
route whitelist and the 7 day sweep; amended 2026-09-17 with whole-deposit settlement, the
Vortex-held recovery path and the removal of the client fallback role; amended 2026-09-18
with the keeper's subsidy ladder, the per-swap subsidy cap and the spot reference — see the
amendment sections). This ADR is the
single source of truth for the *decisions and risk
acceptances* of the B2B EUR → USDC onramp. How the system works lives in
[`architecture-monerium-b2b-onramp.md`](architecture-monerium-b2b-onramp.md); security
invariants and the threat model in
[`security-spec/05-integrations/monerium-b2b.md`](security-spec/05-integrations/monerium-b2b.md);
launch gates and terms inputs in
[`operations-monerium-b2b-rollout.md`](operations-monerium-b2b-rollout.md); procedures in
[`operations-monerium-b2b-runbook.md`](operations-monerium-b2b-runbook.md). The
consumer-flow design this grew out of remains a phase-2 proposal:
[`proposal-monerium-consumer-onramp.md`](proposal-monerium-consumer-onramp.md).

## Context

Partner-sourced business clients (SulPayments' OTC corporates, KYB'd under the partner's
FINMA/VQF licence with per-customer reliance attestations to Monerium) need EUR → USDC
on Ethereum with **zero Vortex-side interaction**: no app, no wallet ceremony, no digital
signature. Onboarding is paperwork only. The single blocker in the consumer design was
Monerium's link signature — connecting an IBAN to an on-chain address requires that
address to approve the fixed ownership message `"I hereby declare that I am the address
owner."` via EIP-1271.

## Decision: the attestor-constrained forwarder

Each client gets a dedicated minimal forwarding contract (`VortexForwarder`, an EIP-1167
clone of one immutable implementation, deployed via a CREATE2 factory and initialized
atomically) whose `isValidSignature` accepts **exactly one construction**: the Vortex
attestor key's signature over `keccak256(chainid ‖ address(this) ‖ hash)` where `hash`
is the EIP-191 hash of the fixed ownership message. Vortex can therefore complete the
Monerium link with no client involvement, while the attestor key is provably not a means
of access to funds.

**Why the naive alternative is unsafe:** Monerium validates *redeem orders* ("Send EUR
`<amount>` to `<IBAN>` …") through the same EIP-1271 interface. A general-purpose
validation key would let its holder redeem the client's EURe to an arbitrary IBAN —
a fiat theft path and unambiguous custody. The whole design follows from closing it.

Supporting decisions, all in force:

- **Conversion policy** (amended 2026-09-15): the swap runs over one of the factory's
  whitelisted Uniswap v3 routes — validated on chain to touch only EURe, EURC and USDC
  on the immutable router — chosen by the caller through a route index; the caller also
  supplies the partner reference rate, which the contract bounds to a band around
  Chainlink EUR/USD (staleness ceiling kept). The fill is settled into fee bands
  (amendment) and the Chainlink floor is enforced on the client's net after fee and
  subsidy; exact approvals and atomic delta checks stay; the fee goes to an immutable
  treasury.
- **No upgradeability, ever.** Immutable-and-migratable: evolution (new tokens, a new
  router, contract fixes) happens by deploying a new implementation + factory and
  migrating clients clone-by-clone — never by mutating deployed code. The custody
  argument depends on it. Routes, the fee policy and the vault limits are bounded
  *data* the guardian may change within immutable validation, not code.
- **No client key on the clone** (amended 2026-09-17; superseded the mandatory
  self-custodied `fallbackAddress` of 2026-07-17 and its `sweep`/config functions and
  dead-man sweep). The only exits are the client's fixed `destination` and, for a payment
  the promised window was missed on, the Vortex recovery wallet — see the second
  amendment. A destination change means a new clone (runbook §5).
- **Never send raw EURe to a CEX destination** — EURe leaves a clone only to the router
  or the Vortex recovery wallet.
- **No on-contract redeem validator.** The forwarder's EIP-1271 still validates only the
  link message. Returning a deposit to its sender happens off the clone: the keeper moves
  the payment to the Vortex recovery wallet and Vortex redeems from there (amendment
  2026-09-17), so the whitelabel credentials plus the attestor key still cannot drain a
  clone to an arbitrary IBAN. Monerium's issuer recovery stays the break-glass backstop
  (see T1 below).
- **EIP-191 hash only, chainid-bound** (the raw-keccak variant was removed after the G0
  sandbox validation; chainid binding closes cross-chain replay — review r1).
- **Three distinct Vortex keys** (attestor / keeper / guardian), none able to redirect
  funds; the keeper can move a payment only to the immutable recovery wallet and only
  once the clone's batch has been open for `RECOVERY_DELAY` (amendment 2026-09-17); the
  keeper runs on exactly one backend (the mykobo flow variant).
- **Managed-profile integration:** each client is a managed child profile under the
  partner manager (KYB mirror, credentials, read API, webhook tenancy). The flow is
  quoteless and deliberately **not** part of `ramp_states` — evaluated and rejected
  2026-08-26 (N:M deposit↔execution batching, no quote, phase-machinery mismatch); a
  read-level projection is the path if unified history is ever wanted. Tables stay
  `monerium_*` (the legacy OAuth integration owns no tables; no collision).
- **Deposit webhooks as a generic event family** (`DEPOSIT_RECEIVED` /
  `DEPOSIT_CONVERTED` / `DEPOSIT_RETURNED`, the last added 2026-09-17 for the refund
  path) on the public webhook contract, delivered durably (outbox,
  at-least-once) to the partner manager. A cap-split deposit emits one final
  `DEPOSIT_CONVERTED` after all portions settle, with `conversions[]` and aggregate
  attributed USDC rather than a misleading event per chunk.

## Amendment 2026-09-15: reference-priced fee bands and the subsidy vault

The partner agreement fixes the client's rate against a reference: the client receives
the Coinbase EURC-USDC reference minus 12.5 bps, and never worse than 15 bps below it.
A flat skim on whatever the DEX returns cannot express that, so the contract now settles
every fill into bands against a reference rate (decided with the partner; contracts were
not yet deployed, so this replaced the flat fee before launch with no migration):

- **Reference rate** (superseded 2026-09-18 by the bid/ask midpoint, see the third
  amendment). Before each swap the keeper computes a five-minute
  volume-weighted average of Coinbase Exchange EURC-USDC one-minute candles (typical
  price × volume), widened to an hour when the five minutes carry no volume, so a
  single thin print on a weekend or outside business hours never becomes the reference
  (suggested in review, 2026-09-15). It records price, window and time on the
  execution row and passes the rate into `swap`. The contract rejects a reference outside
  `MAX_REFERENCE_DEVIATION_BPS` of Chainlink; on the permissionless path the argument is
  ignored and Chainlink is the reference. Reading the price from Vortex's own oracle on
  Base was rejected: it blends a forex rate on weekdays and lives on another chain.
- **Fee bands** (per clone, ppm below the reference, `targetPpm` ≤ `floorPpm` ≤
  `MAX_FEE_PPM`, increases timelocked as before): a fill above `reference × (1 −
  target)` gives the surplus to the treasury as fee, capped at `MAX_FEE_PPM`; a fill
  between floor and target is passed through untouched; a fill below `reference × (1 −
  floor)` is topped up to the floor from the vault. The 2.5 bps dead band is intended.
- **Subsidy vault.** One `VortexSubsidyVault` shared by every clone, treasury-funded,
  pays only when called by a factory-registered clone, to the destination that clone
  passes (its own immutable one), within a guardian-settable per-swap cap and UTC-daily
  budget, can be paused, and withdraws only to the treasury. A vault that cannot cover
  reverts the whole swap, and the clone reverts unless exactly the shortfall arrived at
  its destination — a swap is never partially subsidized and a guardian-set vault cannot
  harm the client. The vault holds Vortex money only, so its limits bound Vortex's
  exposure, never the client's.
- **Floor on the net.** `SLIPPAGE_BPS` (60 bps since the 2026-09-17 amendment; 40 at this amendment) is enforced on fill − fee + subsidy,
  not on the raw fill; the router minimum is zero and the forwarder's post-condition is
  the guard, so a subsidy can never paper over a depegged reference.
- **Route whitelist.** The factory holds guardian-managed routes, validated on chain to
  EURe/EURC/USDC only, Uniswap's four tiers, at most two hops, the immutable router;
  entries are disabled, never removed. The keeper quotes every enabled route and passes
  the best index; a poor pick costs Vortex fee or subsidy, never the client, because the
  floor applies whichever route runs. On-chain best-of was rejected (quoter gas).
- **Keeper deferral.** The keeper mirrors the settlement off-chain and, when the vault
  could not cover, the net would breach the floor, the reference is unavailable or out
  of band, or no route quotes, it defers: no execution row, funds wait, marker armed.
- **Accepted limitation.** After the 24 h trigger anyone may execute the swap, priced
  against Chainlink and unsubsidized, so a forced swap after a deliberate deferral can
  land below the 15 bps floor. Accepted: the trigger exists so no Vortex outage can trap
  funds; the rate guarantee applies to keeper-executed swaps and the terms say so.
  Pausing instead of deferring was rejected as turning every market dip into an
  operator incident.
- **Accepted exposure.** The subsidy widens the sandwich-exploitable band from the
  floor to floor plus the per-swap cap, paid by the vault; private orderflow and a
  modest cap are the mitigation, and the permissionless path keeps the plain floor.

## Amendment 2026-09-17: whole-deposit settlement and the refund path

Product requirements from the partner (SulPayments): one USDC transfer per bank
payment, and an automatic refund of the exact EUR amount to the payer's bank account
when a payment cannot be converted inside the promised window. Vortex holding the funds
for that refund is agreed commercially. Decisions (the proposal that led here is
[`proposal-monerium-b2b-settlement-and-recovery.md`](proposal-monerium-b2b-settlement-and-recovery.md)):

- **Chunks accumulate on the clone; one forward per payment.** `swap(reference, route,
  amountIn)` converts an explicit chunk and keeps the USDC (subsidy included) on the
  clone; `forward(amount)` pushes the whole converted payment to `destination`. The
  keeper serves one deposit at a time (1 deposit : N swap executions), so deposits never
  share a swap and the N:M attribution of 2026-08 is gone. Approach A of the proposal
  (no escrow contract): smallest audit delta, per-client blast radius, USDC never
  leaves the client's clone until it goes to the destination.
- **Vortex-held recovery wallet, on-chain delay.** `recover(eure, usdc)` is keeper-only,
  pays only the immutable `RECOVERY_WALLET` — one wallet linked to a Vortex/SatoshiPay
  company profile at Monerium — and only once the clone's batch marker has been open for
  `RECOVERY_DELAY` = **2 hours** (immutable, P3). The clock starts when funds first
  arrive on the clone; a chunk swap never re-times it; a forward or recovery re-times
  whatever remains. The refund then leaves the Monerium profile that wallet belongs to:
  the recovered USDC is swapped back to EURe, a separate float wallet covers the
  slippage residue (the loss ledger), and a redeem order returns the exact issue amount
  to the payer's IBAN (payer IBAN and name come from the issue order). Manual per the
  runbook until automated.
- **Client fallback role removed.** `fallbackAddress`, `sweep`, `setDestination`,
  `setClientPaused` and the dead-man sweep are gone (the client never held a key in
  the pilot; the partner warrants the destination, B5). A destination change means a new
  clone (runbook §5). The permissionless `swap`/`forwardAll` path after `TRIGGER_DELAY`
  stays as the liveness guarantee, so a Vortex outage never traps converted funds.
- **Trust statement (replaces "Vortex keys cannot move client funds").** Vortex keys can
  move a client's funds only to the Vortex recovery wallet, only after `RECOVERY_DELAY`,
  and the contract can never send anywhere else. Consequences carried to G1 (Monerium
  re-approval of the Vortex-held fallback and of one company profile refunding many
  client corporates), G2 (custody scoping) and the partner terms (rollout §Terms 6).
- **Refund triggers.** Missed window (automated in a later phase; operator-triggered via
  the admin endpoint until then), operator intervention, and remainders below
  `minSwapAmount` (they cannot be swapped and are refunded). Chunk fees already taken on
  a refunded payment stay in the treasury and are netted in the ledger.
- **`SLIPPAGE_BPS` 40 → 60.** With a 2 h promise a weekend Chainlink gap that defers a
  swap turns into a refund, so the operating tolerance to a stale round (`SLIPPAGE_BPS −
  floorPpm`) moves from ~25 to ~45 bps; the twelve-month replay of the Coinbase
  EURC-USDC market against Chainlink shows ~80 h/year of floor-cause deferral at 40 bps
  over ten weekends and two five-minute blips at 60. The keeper's worst-case pricing
  power on the client widens by 20 bps in exchange. A genuine depeg beyond the 100 bps
  band still defers and, past the window, refunds.
- **Dormancy.** A dormant or suspended account still recovers its marked deposits (the
  refund path is for payments nobody converts), so a deposit into a dormant account is
  refunded rather than parked.

## Amendment 2026-09-18: subsidy ladder, per-swap subsidy cap, spot reference

- **The subsidy escalates with the time a chunk has waited.** Product wants the keeper
  to wait for the market before Vortex pays a shortfall, and to pay more the longer a
  chunk waits. The ladder is a Vortex spending policy, not a client protection (the
  client's floor never moves), so it lives in the keeper (`MONERIUM_B2B_SUBSIDY_LADDER`,
  seconds waited → max bps of the reference value; launch: 0 bps for six minutes, then
  10/20/30/40/50 bps in two-minute steps, 100 bps from minute sixteen, held until the
  refund deadline). The clock runs per chunk, from the mint or the previous chunk's
  confirmation, and the keeper re-quotes every cycle (`MONERIUM_B2B_KEEPER_CYCLE_SECONDS`,
  20 s). Deferred attempts log the shortfall so the ladder is tuned from data. A
  contract-side ladder was considered and rejected: the contract cannot observe a try,
  a keeper-supplied tier index would be unverifiable, and time-tiered vault caps would
  buy enforcement against a keeper the design already bounds by the vault's cap and
  budget.
- **The tier binds on chain anyway (`swap(..., maxSubsidy)`).** The keeper passes its
  tier as a per-swap cap and the forwarder refuses a top-up above it, so a fill that
  moved between the quote and the swap cannot draw more than the tier. The contract
  learns nothing about time or ladders; the vault's cap (`maxSubsidyPpm`, to be raised to
  the ladder's top, 100 bps) and daily budget remain the hard bounds (P13 note below).
- **Spot reference instead of the VWAP.** An average lags a moving market, and in a
  falling one the lag turns into subsidy. The reference is now the Coinbase Exchange
  EURC-USDC bid/ask midpoint read just before the swap (P12): no averaging, no lag; the
  midpoint rather than the last trade because a last print can be one-sided or stale on a
  quiet weekend, and a spread above 50 bps makes the keeper defer rather than price
  against a thin book. The 2026-09-16 drift replay that sized `SLIPPAGE_BPS` used the
  five-minute VWAP; spot moves those figures only marginally.

## Final parameters (decided 2026-08-26 unless noted)

| ID | Parameter | Value |
|---|---|---|
| B1 | Fee policy | **target 1250 ppm (12.5 bps), floor 1500 ppm (15 bps) below the reference**, per client, guardian-adjustable (amended 2026-09-15; replaces the flat 0 / 15 bps skim) |
| B2 | Penny-test amount | 5 USDC |
| B3 | Processing SLA wording | **Same business day**; weekend mints execute within the 52 h oracle window at possibly wider spreads |
| B4 | Pilot volume limits | **€50k/client/day, paper/contractual only** (no backend enforcement in the pilot; GA revisit) |
| B5 | Partner liability | Tier A defaults: partner warrants destination correctness; rotation loss borne by the client; dormancy re-activation on written partner confirmation |
| B6 | Redemption-limitation disclosure | Mandatory in client terms (committed to Monerium); draft in the rollout doc |
| P1 | `SLIPPAGE_BPS` | **60 bps on the client's net after fee and subsidy** (amended 2026-09-17; 40 from 2026-09-15, 100 on the raw fill before) |
| P2 | `MAX_FEE_PPM` | 10000 ppm (1%), immutable; caps both the fee and the floor policy (amended 2026-09-15; was `MAX_FEE_BPS` 100) |
| P3 | `RECOVERY_DELAY` | **2 hours** (amended 2026-09-17): the promised conversion window, enforced on chain as the earliest a payment may move to the recovery wallet. Replaces the dead-man sweep delay (7 days on 2026-09-15, 60 before), which had no target left once the fallback role was removed |
| P4 | Permissionless trigger delay | 24 h |
| P5 | Dormancy window | 60 days |
| P6 | `minSwapAmount` | floor €25 (immutable) / operational **€250** |
| P7 | `perSwapCap` | operational **€25k** / ceiling €50k (re-measure liquidity at the deploy block before raising) |
| P8 | `MAX_ORACLE_AGE` | **52 h** (observed Chainlink EUR/USD weekend gaps up to 48 h; applied to configs 2026-08-26) |
| P9 | Notification confirmation depth | 32 blocks (implemented) |
| P10 | Router pin and routes | SwapRouter02 immutable; routes are a guardian-managed, on-chain validated whitelist (EURe/EURC/USDC, four tiers, ≤ 2 hops); initial route EURe→EURC→USDC at the 5 bps tiers, re-verify at the deploy block (amended 2026-09-15) |
| P11 | Fee adjustability | Guardian `setFeePolicy(target, floor)` within `MAX_FEE_PPM`; raising either value is announced and applies after 24 h, lowering is immediate (amended 2026-09-15) |
| P12 | Reference rate | **Coinbase Exchange EURC-USDC bid/ask midpoint read just before the swap, deferring on a spread above 50 bps** (amended 2026-09-18; from 2026-09-15 a five-minute VWAP over one-minute candles widened to 60 min on no volume), keeper-computed per swap; `MAX_REFERENCE_DEVIATION_BPS` **100** (immutable, to confirm before deploy: must tolerate a weekend Chainlink gap); permissionless path uses Chainlink (2026-09-15). The floor on the net binds first: with `floorPpm` 15 bps and `SLIPPAGE_BPS` 40 bps, a reference more than `SLIPPAGE_BPS − floorPpm` ≈ 25 bps below Chainlink makes every normal fill (fee band or subsidized) revert on chain and defer off chain, so ~25 bps is the working downside margin against a stale round; the 100 bps band is the outlier ceiling for a keeper-supplied value, not the operating tolerance (2026-09-16) |
| P14 | Subsidy ladder | **`MONERIUM_B2B_SUBSIDY_LADDER` = `0:0,360:10,480:20,600:30,720:40,840:50,960:100`** (2026-09-18; keeper policy, tunable from deferral logs); per-chunk clock; the vault's per-swap cap must be at least the ladder's top |
| P13 | Subsidy vault limits | One shared vault; **50 bps of the reference value per swap, 200 USDC per UTC day** at launch, guardian-settable; withdraw to treasury only (2026-09-15) |
| T2 | Whitelabel MSA terms | Open — G1 negotiation (rollout doc), includes the per-IBAN suspension ask |
| T3 | KYB submission mechanism | Open, deliberately unbuilt — pilot corporates are approved by Monerium under partner KYC reliance and imported via the admin mapping; no identity-data submission path may exist until this settles (security-spec invariant 11) |
| T4 | Sandbox wire-format verifications | Webhook digest encoding, delivery id field, order-state vocabulary, and the EIP-191 link-hash variant were confirmed against the sandbox during G0; re-verify against production before first mainnet deposit |
| T1 | Issuer recovery message | **Resolved (verbal, 2026-08-26): identical to the link message** — already whitelisted, recovery works as built; `RECOVERY_HASH` stays 0; written confirmation folds into the G1 package |
| O1 | Client-migration tooling | Build when first needed; manual procedure in the runbook meanwhile |
| O2 | `FEE_RECIPIENT` treasury | **New dedicated Safe multisig** (immutable at implementation deploy); guardian key to hardware/multisig custody at GA |

## Review history (details in git history)

The consumer PRD went through an 18-finding architecture review (dispositioned in the
PRD's appendix) and a 12-finding re-review; the B2B build dispositioned the re-review as
follows — R01 manifest is consistency evidence, not a trust root (accepted); R03
enforceable delay start via the on-chain `strandedSince` marker (resolved); R04
snapshot-based attribution under per-forwarder advisory locks (resolved); R05 per-clone
protective-only guardian pause (resolved); R06 durable webhook persist-before-200
(resolved); R07 client config changes reconciled as expected transitions (accepted); R09
unsolicited-token rules incl. flagged unattributed inflows (resolved); R10 role/parameter
bound invariants as audit targets (resolved); R11 exit guarantees scoped to fallback-key
availability (accepted); R02/R08 consumer-only. A 10-finding internal code review (r1)
was fixed/dispositioned in July, and a 19-finding deep review (multi-lens + adversarial
verification) was fully fixed 2026-08-26, plus one attribution defect found by worked
example (oversized-deposit allocation).

## Risks accepted (with their compensating controls)

- **S0 — provisioning trust.** Vortex deploys and configures the contracts with no
  client verification moment; the published manifest + verifier make deployments
  *checkable*, not trustless. Accepted; heightened relative to the consumer flow.
- **S1 — Monerium credential control-plane.** Whitelabel credentials can re-link
  addresses and move IBANs (redirecting *future* mints only). Cannot be prevented
  client-side: association monitor is the detective control; Monerium-side
  authorization requirements are the G1 ask; response = rotate + suspend (runbook).
- **CEX destination rotation.** Not verifiable on-chain; carried contractually (B5)
  with penny test, dormancy gate, and minimum-forward diligence. Silent-loss risk
  converts to a pause via the dormancy gate.
- **Vortex custody on the refund path** (amendment 2026-09-17). A recovered payment
  sits in Vortex's own wallet until the bank refund goes out; a compromised keeper plus
  recovery key could divert a payment the window was missed on. Bounded by the immutable
  wallet, the on-chain delay, explicit amounts, a dedicated linked address holding
  nothing else, and the association monitor; accepted commercially by the partner and
  carried to G1/G2.
- **Broken destination** — with no client key on the clone, a wrong destination is
  caught by the penny test and the dormancy gate; a rotation loss is borne by the
  client/partner (B5); a destination change is a new clone.
- **Non-custody ≠ out of MiCA scope.** The constrained-attestor construction defeats
  the custody definition, but exchange/transfer-service scoping is a separate G2
  question. Never present "no custody" as "no licence needed".
- **Stuck-state table** (route death, feed retirement, depeg beyond bound, blacklisted
  destination, reference feed outage, exhausted subsidy budget): all fail-safe — swaps
  revert or the keeper defers, funds accumulate as EURe; past the promised window the
  payment is refunded through the recovery wallet, past 24 h anyone may convert and
  forward permissionlessly; the issuer backstop remains. Accepted.
- **Bounded keeper pricing power.** A compromised keeper can pick any whitelisted route
  and any reference inside the Chainlink band: worst case the fee reaches `MAX_FEE_PPM`
  or the vault pays up to its caps. Bounded by the band, the fee cap, the vault limits
  and the floor on the net; it can still never redirect funds — only, after the on-chain
  delay, move them to the recovery wallet. Accepted.
- **Subsidy exposure.** Up to the per-swap cap per swap and the daily budget per day,
  plus the widened sandwich band (amendment). Accepted; both limits are live-tunable.
- **Operational residuals:** reorgs deeper than the watcher's 12-block lag;
  financial-operation claim-crash windows require manual reconciliation; deposit
  batching is intra-client only and pro-rata attribution never changes a client's
  effective rate.

## Consequences

Zero-touch onboarding works end to end (validated against the Monerium sandbox: link
accepted, IBAN issued, no client interaction). A Vortex outage can never trap converted
funds (the permissionless path), and a payment the promised window was missed on is
refunded rather than parked, at the price of Vortex custody on that path. The cost: every rescue path must be designed in upfront
(no universal owner key), fee-policy increases are timelocked and venue changes are
bounded by on-chain route validation rather than admin switches, the partner's rate
guarantee is enforced by the contract at the cost of a treasury-funded subsidy budget,
and Vortex accepts elevated provisioning trust plus a control-plane risk at Monerium
that only contract terms and monitoring can bound.
