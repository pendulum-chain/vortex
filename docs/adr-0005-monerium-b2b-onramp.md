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
launch gates and the deploy checklist in
[`operations-monerium-b2b-rollout.md`](operations-monerium-b2b-rollout.md); procedures in
[`operations-monerium-b2b-runbook.md`](operations-monerium-b2b-runbook.md). The
consumer-flow design this grew out of remains a phase-2 proposal:
[`proposal-monerium-consumer-onramp.md`](proposal-monerium-consumer-onramp.md).

## Context

Partner-sourced business clients need EUR → USDC on Ethereum with **zero Vortex-side
interaction**: no app, no wallet ceremony, no digital signature. Onboarding needs no
client action at Vortex. The single blocker in the consumer design was Monerium's link signature —
connecting an IBAN to an on-chain address requires that address to approve the fixed
ownership message `"I hereby declare that I am the address owner."` via EIP-1271.

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
  supplies the reference rate, which the contract bounds to a band around
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
  the promised window was missed on, the client's refund wallet held by Vortex — see
  the amendments of 2026-09-17 and 2026-10-01. A destination change means a new clone (runbook §5).
- **Never send raw EURe to a CEX destination** — EURe leaves a clone only to the router
  or the client's refund wallet.
- **No on-contract redeem validator.** The forwarder's EIP-1271 still validates only the
  link message. Returning a deposit to its sender happens off the clone: the keeper moves
  the payment to the client's refund wallet and Vortex redeems from there (amendments
  2026-09-17 and 2026-10-01), so the whitelabel credentials plus the attestor key still
  cannot drain a clone to an arbitrary IBAN. Monerium's issuer recovery stays the break-glass backstop
  (see T1 below).
- **EIP-191 hash only, chainid-bound** (the raw-keccak variant was removed after the G0
  sandbox validation; chainid binding closes cross-chain replay — review r1).
- **Three distinct Vortex keys** (attestor / keeper / guardian), none able to redirect
  funds; the keeper can move a payment only to the clone's fixed refund wallet and only
  once the clone's batch has been open for `RECOVERY_DELAY` (amendments 2026-09-17 and
  2026-10-01); the
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

Vortex's default fee policy fixes the client's rate against a reference: the client
receives the Coinbase EURC-USDC reference minus 12.5 bps, and never worse than 15 bps
below it. A flat skim on whatever the DEX returns cannot express that, so the contract now
settles every fill into bands against a reference rate (contracts were not yet deployed,
so this replaced the flat fee before launch with no migration):

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
  pays only when called by a factory-registered clone, to that clone itself, within a
  guardian-settable per-swap cap and UTC-daily
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
  funds; the rate guarantee applies to keeper-executed swaps only.
  Pausing instead of deferring was rejected as turning every market dip into an
  operator incident.
- **Accepted exposure.** The subsidy widens the sandwich-exploitable band from the
  floor to floor plus the per-swap cap, paid by the vault; private orderflow and a
  modest cap are the mitigation, and the permissionless path keeps the plain floor.

## Amendment 2026-09-17: whole-deposit settlement and the refund path

Product requirements: one USDC transfer per bank payment, and an automatic refund of the
exact EUR amount to the payer's bank account when a payment cannot be converted inside
the promised window. Decisions:

- **Chunks accumulate on the clone; one forward per payment.** `swap(reference, route,
  amountIn)` converts an explicit chunk and keeps the USDC (subsidy included) on the
  clone; `forward(amount)` pushes the whole converted payment to `destination`. The
  keeper serves one deposit at a time (1 deposit : N swap executions), so deposits never
  share a swap and the N:M attribution of 2026-08 is gone. Chosen over a shared
  settlement escrow contract: smallest audit delta, per-client blast radius, USDC never
  leaves the client's clone until it goes to the destination.
- **Vortex-held recovery wallet, on-chain delay** (the single company-profile wallet was
  replaced by per-client refund wallets, amendment 2026-10-01). `recover(eure, usdc)` is keeper-only,
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
  the pilot; the partner supplies the destination, B5). A destination change means a new
  clone (runbook §5). The permissionless `swap`/`forwardAll` path after `TRIGGER_DELAY`
  stays as the liveness guarantee, so a Vortex outage never traps converted funds.
- **Trust statement (replaces "Vortex keys cannot move client funds").** Vortex keys can
  move a client's funds only to the Vortex recovery wallet, only after `RECOVERY_DELAY`,
  and the contract can never send anywhere else.
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
  against a thin book.
- **Weekend drift is paid, not refunded.** The Chainlink floor (`SLIPPAGE_BPS`) now
  bounds the fee target and the subsidy floor from below: when the reference sits more
  than ~45 bps under a stale Chainlink round, the fee gives way first and then the
  keeper's tier-bounded subsidy lifts the client's net to Chainlink − 60 bps, within the
  vault's cap, instead of the swap reverting and the payment refunding after the window.
  The client never gets less than the floor, occasionally more than the reference deal;
  Vortex pays the difference, bounded by the ladder's tier and the vault. A depeg beyond
  what the tier and the vault cover (the 2025-10 weekend needed ~440 bps) still reverts
  and refunds; the permissionless path still pays nothing. `SLIPPAGE_BPS` thus stays the
  hard line for what a compromised keeper can do to the client, and the ladder's top tier
  becomes the runtime knob for how much drift Vortex absorbs. The drift replay that sized `SLIPPAGE_BPS` was rerun on spot
  (2026-09-18, one-minute closes of Coinbase EURC-USDC as the midpoint's proxy vs the
  Chainlink rounds, 2025-09-18 to 2026-09-18, 88% of minutes traded; historical bid/ask
  is not public): weekend median −5.3 bps, p5 −26.5. Time a floor fill would breach the
  oracle floor: at 40 bps 122 h/year over 12 weekends with ten weekend episodes longer
  than the 2 h window; at 60 bps 48 h/year of which 47.8 h are the 2025-10-11/12 depeg
  weekend (out of the 100 bps band anyway) and the rest six blips of one to five
  minutes on three weekends. Spot is noisier than the VWAP at 40 bps and identical at
  60; the 60 bps decision stands.

## Amendment 2026-09-29: pilot parameter changes

- **No practical swap minimum.** The team decided not to enforce a meaningful minimum
  amount. The immutable `MIN_SWAP_FLOOR` and the operational `minSwapAmount` are both
  €1 (P6; €25 and €250 before). Almost every payment now converts instead of waiting
  for the refund path as sub-minimum. Accepted consequences: a very small payment costs
  Vortex more gas than it earns; a small payment forwarded to an exchange address can
  land below that exchange's minimum deposit (the destination is the partner's input,
  B5); and unsolicited EURe from €1 upward arms
  a clone's batch timers (from €25 before), which the stranded-balance monitor still
  reports. The guardian can raise the operational minimum at any time without a
  redeploy; it can never go below €1.
- **€10k chunks.** `perSwapCap` is €10k (P7; €25k before). The €25k was an operational
  choice from the pre-deploy liquidity baseline, not a limit. Smaller chunks mean less
  price impact per swap and a smaller top-up per chunk at the ladder's top (about
  115 USDC instead of 285), at the cost of more transactions and more time for large
  payments. When the market needs the ladder's top tier, each chunk can wait up to
  16 minutes, so a payment above roughly €70k could reach the two-hour window. The
  guardian can change the cap at any time up to the €50k ceiling.
- **Penny test optional.** The penny test (B2) is an optional check, recommended for
  exchange destinations, and not an activation requirement. A wrong destination is
  caught by the penny test only when one is run; an address an exchange retires after a
  long idle period is caught by the dormancy gate; a rotation on an account that keeps
  converting is caught by neither (B5).

## Amendment 2026-10-01: per-client refund wallets

- **One refund wallet per client, fixed in its forwarder.** The implementation-wide
  `RECOVERY_WALLET` is gone. Each clone takes a `recoveryAddress` at deployment
  (`deployForwarder(destination, recoveryAddress, targetPpm, floorPpm, salt)`), with no
  setter, rejected when zero, a token, the router, the clone itself or equal to the
  destination. `recover` pays only that address, still keeper-only and only after
  `RECOVERY_DELAY`.
- **A plain wallet, derived.** The refund wallet is an EOA whose key is
  `keccak256(MONERIUM_B2B_REFUND_SEED ++ "vortex-b2b-refund:" ++ moneriumProfileId)`, so one
  secret covers every client, the address is known before the clone is deployed (admin
  `GET /v1/admin/monerium-b2b/refund-address`), and a replacement clone for the same client
  keeps the same wallet. Account mapping refuses a clone whose `recoveryAddress` is not
  the derived wallet. A refund contract was considered and deferred: while refunds go to
  whichever IBAN paid in, a contract cannot know the payer and would sign whatever the
  keeper supplies, the same trust as a held key, with more audit surface. It becomes
  worthwhile with a fixed refund IBAN per client, when it can refuse every other IBAN;
  switching an existing client then means a new clone (runbook §5).
- **Linked to the client's profile, refunded from the client's IBAN.** Onboarding links
  the refund wallet to the client's Monerium profile next to the forwarder (an address
  belongs to exactly one profile). The refund runs on that wallet as before: reverse
  swap, float top-up to the exact amount, redeem to the payer, which Monerium pays out of
  the client's own IBAN. The float also tops up the
  wallet's ETH for its own transactions, sized from the current gas price. No Vortex
  company profile at Monerium is needed, and recovered funds of different clients never
  share a wallet. `MONERIUM_B2B_RECOVERY_PRIVATE_KEY` is replaced by
  `MONERIUM_B2B_REFUND_SEED`, required whenever the module is enabled.

## Final parameters (decided 2026-08-26 unless noted)

| ID | Parameter | Value |
|---|---|---|
| B1 | Default fee policy | **target 1250 ppm (12.5 bps), floor 1500 ppm (15 bps) below the reference**, per client, guardian-adjustable (amended 2026-09-15; replaces the flat 0 / 15 bps skim) |
| B2 | Penny-test amount | 5 USDC, **optional** (amended 2026-09-29): recommended for exchange destinations, not an activation requirement |
| B3 | Conversion window | **2 h from the mint** (P3; `MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES` default 120). Past it the payment is due for a refund: marked automatically with `MONERIUM_B2B_AUTO_RECOVERY=auto`, reported for an operator with `alert`, left to the operator with the default `off` (runbook §2.7). Weekend mints convert too, because the Chainlink bound accepts a price up to 52 h old (P8), at possibly wider spreads |
| B4 | Per-client volume limit | **Not enforced by the backend** (GA revisit); `perSwapCap` (P7) bounds each swap, not a client's daily volume |
| B5 | Destination responsibility | The partner supplies and confirms each destination; dormancy re-activation on written partner confirmation |
| B6 | Redemption limitation | A clone validates no redeem order, so its EURe is never redeemed to an IBAN directly: it leaves only by swap and forward to the destination, by recovery to the client's refund wallet, or through Monerium's issuer recovery (T1) |
| P1 | `SLIPPAGE_BPS` | **60 bps on the client's net after fee and subsidy** (amended 2026-09-17; 40 from 2026-09-15, 100 on the raw fill before) |
| P2 | `MAX_FEE_PPM` | 10000 ppm (1%), immutable; caps both the fee and the floor policy (amended 2026-09-15; was `MAX_FEE_BPS` 100) |
| P3 | `RECOVERY_DELAY` | **2 hours** (amended 2026-09-17): the promised conversion window, enforced on chain as the earliest a payment may move to the recovery wallet. Replaces the dead-man sweep delay (7 days on 2026-09-15, 60 before), which had no target left once the fallback role was removed |
| P4 | Permissionless trigger delay | 24 h |
| P5 | Dormancy window | 60 days |
| P6 | `minSwapAmount` | floor **€1** (immutable) / operational **€1**: no practical minimum (amended 2026-09-29; €25 / €250 before) |
| P7 | `perSwapCap` | operational **€10k** / ceiling €50k (amended 2026-09-29; €25k before; re-measure liquidity at the deploy block before raising) |
| P8 | `MAX_ORACLE_AGE` | **52 h** (observed Chainlink EUR/USD weekend gaps up to 48 h; applied to configs 2026-08-26) |
| P9 | Notification confirmation depth | 32 blocks (implemented) |
| P10 | Router pin and routes | SwapRouter02 immutable; routes are a guardian-managed, on-chain validated whitelist (EURe/EURC/USDC, four tiers, ≤ 2 hops); initial route EURe→EURC→USDC at the 5 bps tiers, re-verify at the deploy block (amended 2026-09-15) |
| P11 | Fee adjustability | Guardian `setFeePolicy(target, floor)` within `MAX_FEE_PPM`; raising either value is announced and applies after 24 h, lowering is immediate (amended 2026-09-15) |
| P12 | Reference rate | **Coinbase Exchange EURC-USDC bid/ask midpoint read just before the swap, deferring on a spread above 50 bps** (amended 2026-09-18; from 2026-09-15 a five-minute VWAP over one-minute candles widened to 60 min on no volume), keeper-computed per swap; `MAX_REFERENCE_DEVIATION_BPS` **100** (immutable, to confirm before deploy: must tolerate a weekend Chainlink gap); permissionless path uses Chainlink (2026-09-15). The floor on the net binds first: with `floorPpm` 15 bps and `SLIPPAGE_BPS` 40 bps, a reference more than `SLIPPAGE_BPS − floorPpm` ≈ 25 bps below Chainlink makes every normal fill (fee band or subsidized) revert on chain and defer off chain, so ~25 bps is the working downside margin against a stale round; the 100 bps band is the outlier ceiling for a keeper-supplied value, not the operating tolerance (2026-09-16) |
| P14 | Subsidy ladder | **`MONERIUM_B2B_SUBSIDY_LADDER` = `0:0,360:10,480:20,600:30,720:40,840:50,960:100`** (2026-09-18; keeper policy, tunable from deferral logs); per-chunk clock; the vault's per-swap cap must be at least the ladder's top |
| P13 | Subsidy vault limits | One shared vault; **50 bps of the reference value per swap, 200 USDC per UTC day** at launch, guardian-settable; withdraw to treasury only (2026-09-15) |
| T2 | Per-IBAN suspension | Best-effort: a manual request to Monerium (runbook §2.2) |
| T3 | KYB submission mechanism | Open, deliberately unbuilt — clients are approved by Monerium and imported via the admin mapping; no identity-data submission path may exist until a submission mechanism is designed and this row and security-spec invariant 11 are updated |
| T4 | Sandbox wire-format verifications | Webhook digest encoding, delivery id field, order-state vocabulary, and the EIP-191 link-hash variant were confirmed against the sandbox during G0; re-verify against production before first mainnet deposit |
| T1 | Issuer recovery message | **Identical to the link message** — already whitelisted, recovery works as built; `RECOVERY_HASH` stays 0 |
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
  addresses and move IBANs (redirecting *future* mints only). The white-label app is the
  partner's, so the partner holds credentials with the same power; it only creates
  profiles and submits KYB, and never links addresses, requests or moves IBANs, places
  orders, or changes Vortex's webhook subscription, so any such change is treated as an
  incident (runbook §2.5). Closing a profile also closes its IBAN, so profile closures are
  coordinated with Vortex operations. Cannot be prevented client-side: a preventive
  control (authorization requirements on `PATCH /ibans` and `POST /addresses`) can exist
  only at Monerium; the association monitor is the detective control; response = rotate
  + suspend (runbook).
- **CEX destination rotation.** Not verifiable on-chain; left to the partner (B5). The
  dormancy gate turns a rotation after 60 idle days into a pause, and an optional penny
  test catches a wrong address when run; a rotation on an account that keeps converting
  is not detected, and its forwards keep going to the old address.
- **Vortex custody on the refund path** (amendment 2026-09-17). A recovered payment
  sits in Vortex's own wallet until the bank refund goes out; a compromised keeper plus
  recovery key could divert a payment the window was missed on. Bounded by the immutable
  wallet, the on-chain delay, explicit amounts, a dedicated linked address holding
  nothing else, and the association monitor.
- **Broken destination** — with no client key on the clone, a wrong destination is
  caught by an optional penny test or by the dormancy gate; a destination change is a new
  clone.
- **Stuck-state table** (route death, feed retirement, depeg beyond bound, blacklisted
  destination, reference feed outage, exhausted subsidy budget): all fail-safe — swaps
  revert or the keeper defers, funds accumulate as EURe; past the promised window the
  payment is refunded through the client's refund wallet, past 24 h anyone may convert and
  forward permissionlessly; the issuer backstop remains. Accepted.
- **Link-message change.** The forwarder validates only Monerium's exact ownership
  message (a constant of the implementation), so a change to that message at Monerium
  fails every new link closed, and with it new onboarding, until a new implementation and
  factory are deployed; issuer recovery validates the same message (T1).
- **SEPA recall after forwarding.** A payment recalled by the payer's bank after its USDC
  was forwarded cannot be reversed on chain; the system has no clawback path.
- **Bounded keeper pricing power.** A compromised keeper can pick any whitelisted route
  and any reference inside the Chainlink band: worst case the fee reaches `MAX_FEE_PPM`
  or the vault pays up to its caps. Bounded by the band, the fee cap, the vault limits
  and the floor on the net; it can still never redirect funds — only, after the on-chain
  delay, move them to the client's refund wallet. Accepted.
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
bounded by on-chain route validation rather than admin switches, the client's rate
guarantee is enforced by the contract at the cost of a treasury-funded subsidy budget,
and Vortex accepts elevated provisioning trust plus a control-plane risk at Monerium
that only Monerium-side controls and monitoring can bound.
