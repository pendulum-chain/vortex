# ADR 0005: Monerium B2B Zero-Touch Onramp

**Status:** Accepted (selected 2026-07-17; parameters finalized and documents consolidated
2026-08-26). This ADR is the single source of truth for the *decisions and risk
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

- **Conversion policy** (unchanged from the consumer design): pinned EURe→EURC→USDC
  Uniswap v3 route, contract-constructed calldata (never caller-supplied — the swap is
  permissionless after the trigger delay), Chainlink EUR/USD minimum-output bound with
  staleness ceiling, exact approvals, atomic delta checks, fee skim to an immutable
  treasury.
- **No upgradeability, ever.** Immutable-and-migratable: evolution (new pools, new
  routes, contract fixes) happens by deploying a new implementation + factory and
  migrating clients clone-by-clone — never by mutating deployed code. The custody
  argument depends on it.
- **Mandatory self-custodied `fallbackAddress`** for every client (Tier C "no fallback"
  dropped 2026-07-17 — condition of Monerium's acceptance; Tier B "partner-held
  recovery key" rejected 2026-07-14 — the partner declines custody-like powers). All
  emergency flows point to it: client `sweep`/config functions plus the permissionless
  dead-man sweep.
- **Never send raw EURe to a CEX destination** — EURe recovery targets are the
  fallback address only.
- **No on-contract redeem validator.** Redemption = withdraw to fallback, then redeem
  normally; Monerium's issuer recovery is the break-glass backstop (see T1 below).
- **EIP-191 hash only, chainid-bound** (the raw-keccak variant was removed after the G0
  sandbox validation; chainid binding closes cross-chain replay — review r1).
- **Three distinct Vortex keys** (attestor / keeper / guardian), none able to move or
  redirect funds; the keeper runs on exactly one backend (the mykobo flow variant).
- **Managed-profile integration:** each client is a managed child profile under the
  partner manager (KYB mirror, credentials, read API, webhook tenancy). The flow is
  quoteless and deliberately **not** part of `ramp_states` — evaluated and rejected
  2026-08-26 (N:M deposit↔execution batching, no quote, phase-machinery mismatch); a
  read-level projection is the path if unified history is ever wanted. Tables stay
  `monerium_*` (the legacy OAuth integration owns no tables; no collision).
- **Deposit webhooks as a generic event family** (`DEPOSIT_RECEIVED` /
  `DEPOSIT_CONVERTED`) on the public webhook contract, delivered durably (outbox,
  at-least-once) to the partner manager.

## Final parameters (decided 2026-08-26 unless noted)

| ID | Parameter | Value |
|---|---|---|
| B1 | Service fee | **0 bps pilot / 15 bps GA starting point** (per client, guardian-adjustable) |
| B2 | Penny-test amount | 5 USDC |
| B3 | Processing SLA wording | **Same business day**; weekend mints execute within the 52 h oracle window at possibly wider spreads |
| B4 | Pilot volume limits | **€50k/client/day, paper/contractual only** (no backend enforcement in the pilot; GA revisit) |
| B5 | Partner liability | Tier A defaults: partner warrants destination correctness; rotation loss borne by the client; dormancy re-activation on written partner confirmation |
| B6 | Redemption-limitation disclosure | Mandatory in client terms (committed to Monerium); draft in the rollout doc |
| P1 | `SLIPPAGE_BPS` | 100 (1%) |
| P2 | `MAX_FEE_BPS` | 100 (1%), immutable |
| P3 | Dead-man sweep delay | 60 days |
| P4 | Permissionless trigger delay | 24 h |
| P5 | Dormancy window | 60 days |
| P6 | `minSwapAmount` | floor €25 (immutable) / operational **€250** |
| P7 | `perSwapCap` | operational **€25k** / ceiling €50k (re-measure liquidity at the deploy block before raising) |
| P8 | `MAX_ORACLE_AGE` | **52 h** (observed Chainlink EUR/USD weekend gaps up to 48 h; applied to configs 2026-08-26) |
| P9 | Notification confirmation depth | 32 blocks (implemented) |
| P10 | Router pin | SwapRouter02, 5 bps fee tiers; re-verify pools at the deploy block |
| P11 | Fee adjustability | Guardian `setFeeBps` within `MAX_FEE_BPS`; increases behind a 24 h announced timelock, decreases immediate (implemented) |
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
- **Fallback-key loss + broken destination** — ordinary self-custody residual, borne
  by the client (terms; do not overpromise exits — R11).
- **Non-custody ≠ out of MiCA scope.** The constrained-attestor construction defeats
  the custody definition, but exchange/transfer-service scoping is a separate G2
  question. Never present "no custody" as "no licence needed".
- **Stuck-state table** (route death, feed retirement, depeg beyond bound, blacklisted
  destination): all fail-safe — swaps revert, funds accumulate as EURe, client exits
  keep working; recovery is client-side sweep plus the issuer backstop. Accepted.
- **Operational residuals:** reorgs deeper than the watcher's 12-block lag;
  financial-operation claim-crash windows require manual reconciliation; deposit
  batching is intra-client only and pro-rata attribution never changes a client's
  effective rate.

## Consequences

Zero-touch onboarding works end to end (validated against the Monerium sandbox: link
accepted, IBAN issued, no client interaction). Clients keep unilateral exits that no
Vortex failure can block. The cost: every rescue path must be designed in upfront
(no universal owner key), fee/venue changes are governed by timelocks and migrations
rather than admin switches, and Vortex accepts elevated provisioning trust plus a
control-plane risk at Monerium that only contract terms and monitoring can bound.
