# Proposal: whole-deposit settlement and automatic refund recovery (Monerium B2B onramp)

**Status:** accepted 2026-09-17 with every recommendation in §8; phases 0 and 1 are
implemented on PR #1375 (`feat/monerium-forwarder-fee-subsidy`), phases 2 and 3 are in
progress. The decisions live in the second amendment of
[`adr-0005-monerium-b2b-onramp.md`](adr-0005-monerium-b2b-onramp.md); the behaviour in
[`architecture-monerium-b2b-onramp.md`](architecture-monerium-b2b-onramp.md). This document
stays as the design rationale (the approaches compared, the feasibility findings) until the
remaining phases land, then it is deleted.

## 1. What product asked for

1. **One pay-in, one pay-out.** The keeper keeps swapping in `perSwapCap` chunks, but the
   chunks are an implementation detail: USDC accumulates on chain and the client's
   destination receives **one transfer for the whole bank payment** once every chunk is
   converted. Partner (SulPayments) bookkeeping then maps one SEPA credit to one USDC
   transfer.
2. **Automatic refund when the promise is missed.** If a bank payment is not fully
   converted inside the promised window, Vortex returns the **exact EUR amount** to the
   payer's bank account: EURe and any chunk-swapped USDC move to a Vortex recovery
   wallet, USDC is swapped back to EURe, a separate subsidy wallet covers the slippage
   residue, and a Monerium redeem order pays the source IBAN.
3. **Custody for recovery is agreed commercially.** The forwarder's fallback address
   becomes a Vortex-controlled wallet. This reverses three 2026-09-15 decisions in
   ADR-0005: "no payment bouncing", "no Vortex-triggered sweep to the fallback", and the
   client-chosen self-custodied fallback (Tier A).

**Assumptions used below** (each is an open decision in §8):

- The window is **2 hours** (the brief says "1 hour" once and "2 hours" twice).
- The clock starts at the **EURe mint block timestamp** (on-chain, verifiable; the
  provider `processedAt` is within minutes of it).
- "Exact amount" = the `amount` string of the Monerium issue order, to the cent.

## 2. What this changes in the trust model (say it once, plainly)

Today's invariant is *"Vortex keys can trigger, never move or redirect"*. After this
change it becomes:

> Vortex keys can move a client's funds **only** to a fixed Vortex recovery wallet,
> **only** after `RECOVERY_DELAY` has elapsed since the batch opened, and the contract can
> still never send anywhere else (destination, treasury fee, recovery wallet, router).

Consequences that are not engineering: G1 item 1 (Monerium accepted the attestor pattern
*"conditional on fallback capability"*) must be re-approved for a Vortex-held fallback;
G2 must re-scope custody (the ADR's "non-custody" argument is gone for the recovery
path); rollout terms §2 and §6 ("every exit target is client-controlled") are rewritten;
the client loses the self-custody exit that no Vortex failure could block. What survives:
the permissionless swap-and-forward after `TRIGGER_DELAY` (a Vortex outage still cannot
trap funds on chain).

## 3. Part A — whole-deposit forwarding: approaches

### A0. The rung we cannot stop at (keeper-only)

Add `amountIn` to `swapAndForward` and let the keeper swap **one deposit per execution**.
This alone removes deposit merging (two deposits within a minute no longer share a swap)
and is a two-line contract change. It does **not** solve chunking: the mainnet EURe pools
carry roughly €25k within ~14 bps (T6 baseline), so a €100k ticket as one swap breaches
the 40 bps floor and defers forever. Chunking stays, so accumulation is needed. A0 is
nevertheless the first step of both approaches below.

### A. Accumulate on the clone (recommended)

The clone keeps the USDC it swaps and forwards it in one explicit transfer.

```solidity
function poke() external;                                         // arms batchOpenedAt
function swap(uint256 referenceRate, uint256 routeIndex, uint256 amountIn) external;
function forward(uint256 amount) external;                        // keeper/guardian → destination
function forwardAll() external;                                   // anyone, after TRIGGER_DELAY → destination
function recover(uint256 eureAmount, uint256 usdcAmount) external; // keeper/guardian, after RECOVERY_DELAY → RECOVERY_WALLET
```

- `swap` = today's `swapAndForward` minus the final transfer: fee bands, oracle floor on
  the net, route whitelist unchanged. The **subsidy is paid to the clone**, not to the
  destination (`pay(address(this), …)`, delta-checked on the clone's own balance).
  `amountIn` is explicit (`minSwapAmount ≤ amountIn ≤ min(balance, perSwapCap)`), so the
  keeper decides which deposit a chunk belongs to. Permissionless callers after
  `TRIGGER_DELAY` keep today's semantics (Chainlink reference, no subsidy, amount clamped).
- `forward(amount)` transfers exactly `amount` USDC to `destination`. The keeper calls
  it with `Σ chunk nets (+ subsidies)` of one deposit once every chunk is confirmed.
  `forwardAll()` is the liveness fallback (Vortex dead for 24 h ⇒ anyone can push the
  whole balance to the destination; batches may merge on that path — documented).
- Marker: `strandedSince` becomes `batchOpenedAt` — armed by `poke()`/`swap()` when
  EURe ≥ `MIN_SWAP_FLOOR` or USDC > 0 and the marker is 0; **never re-armed by a partial
  swap** (today's re-arm on a cap remainder would restart the 2 h clock); cleared only
  when EURe < floor **and** USDC == 0 after `forward`/`recover`.
- Removed: `fallbackAddress`, `onlyFallback` (`setDestination`, `setFallbackAddress`,
  `setClientPaused`, `sweep`), `sweepStrandedEure`, `SWEEP_DELAY`, `clientPaused`.
  `guardianPaused` stays protective: it blocks `swap`/`forward`, never `recover` (an
  incident is exactly when pause-then-recover is wanted).
- Events: `SwapExecuted` loses `forwarded`; new `Forwarded(caller, amount)` and
  `Recovered(caller, eure, usdc)`.

Pros: no new contract, per-client isolation unchanged (a bug in one clone never touches
another client's USDC), USDC never leaves the client's own contract until it goes to the
destination, the smallest audit delta (~40 lines net after deletions), one fewer ERC20
transfer per chunk than B. Cons: the clone becomes stateful across deposits — when two
deposits are in flight their USDC is one fungible balance on chain and the 1:1 ledger
lives in the database plus the `Forwarded` amounts (a mislabelled keeper cannot steal,
only misattribute between the same client's deposits); R09 unsolicited USDC now waits
for the next `forward`/`forwardAll` instead of riding along with a swap.

*Variant A′ (optional hardening):* keep a `mapping(bytes32 batchId => uint256)` in the
clone and make `swap`/`forward` batch-keyed, so the chain itself proves each forwarded
amount equals that batch's chunk sum. Adds ~25 lines and a keeper-chosen key; buys an
on-chain audit trail but not protection (the keeper picks the key either way). Skip
unless the partner asks for on-chain per-payment proofs.

### B. Shared settlement escrow

The clone swaps as today but sends the USDC (net + subsidy) to one shared
`VortexSettlement` contract, credited under `(clone, batchId)`; the keeper releases a
batch to `clone.destination()` when it is complete.

```solidity
// VortexForwarder
function swapAndForward(uint256 referenceRate, uint256 routeIndex, uint256 amountIn, bytes32 batchId) external;
function recoverEure(uint256 amount) external;                    // still needed for the EURe leg
// VortexSettlement (shared, immutable in the implementation)
function credit(bytes32 batchId, uint256 amount) external;        // clones only (factory.isForwarder)
function release(address clone, bytes32 batchId) external;        // keeper; anyone after TRIGGER_DELAY
function recover(address clone, bytes32 batchId) external;        // keeper, after RECOVERY_DELAY → RECOVERY_WALLET
```

Pros: explicit per-payment ledger and events on chain (`Credited`/`Released` per
batch), batches never mix even at the contract level, the clone's swap path is nearly
untouched. Cons: a **new contract in audit scope (~150 lines)** and a concentration risk
(one contract holds every client's in-flight USDC — a bug there hits all clients, where
A's blast radius is one clone); an extra transfer per chunk; the clone **still** needs a
recover function for the EURe remainder, so B does not avoid the clone changes, it adds
to them; two places to gate on delays and pause; the destination is read from the clone
at release time (fine, but one more cross-contract assumption for the auditor).

### Comparison

| | A (clone accumulates) | B (shared escrow) |
|---|---|---|
| New contracts | none | one |
| Audit delta | ~40 lines net in the clone | clone changes **plus** the escrow |
| Blast radius of a bug | one client | all clients' in-flight USDC |
| On-chain per-payment proof | no (DB + `Forwarded` amounts); A′ adds it | yes |
| Gas per chunk | unchanged | +1 ERC20 transfer |
| Custody narrative | USDC stays on the client's contract | USDC pooled in a Vortex contract |
| Backend accounting | `deposit_id` on executions, one `forward` tx | same, plus batch keys |

**Recommendation: A.** It is the smallest change that meets the requirement, keeps the
per-client isolation the whole design is built on, and the partner's bookkeeping needs
one USDC transfer with the exact amount, which A delivers. Reconsider A′ only if the
partner wants chain-native per-payment proofs.

### Backend for Part A (either approach)

- **Executor becomes 1 deposit : N executions.** Pick the oldest minted, chain-indexed
  deposit that is not fully converted and not in recovery; `amountIn = min(remaining,
  perSwapCap)`; `swap(...)`. Execution rows get `deposit_id` and a `kind`
  (`swap | forward | recover | reverse_swap | topup`) so the existing crash-safe send
  pipeline (nonce persisted before broadcast, calldata-exact recovery scan) serves every
  keeper transaction instead of being duplicated per kind.
- **Delete the N:M attribution.** With the deposit chosen before the swap, the R04
  cursor-gated snapshot allocation, `monerium_deposit_allocations`, `selectDepositsForExecution` and `allocateUsdcProRata` have no job left (~250 lines plus tests). The
  mint watcher stays: a chain-indexed mint is still what makes a deposit convertible.
- **Forward step.** When every `swap` execution of a deposit is confirmed, create a
  `forward` execution for `Σ(usdcOut − fee + subsidy)` and send it. `DEPOSIT_CONVERTED`
  fires after the forward is 32 blocks deep and carries `forwardTxHash` and
  `usdcForwardedRaw`; `conversions[]` stays for transparency.
- **Deposit status** gains `converting` (first chunk sent), `forwarded` (terminal),
  `recovering`, `refunded` (terminal), `recovery_failed` (manual), still forward-only.
- **Below-minimum deposits** (< `minSwapAmount`, €250) can no longer merge with the next
  deposit. Decision §8 D5; the lean default is to refund them through the recovery path
  (no loss, one SEPA fee).
- Monitors: drop the sweep-imminent note; the stranded monitor reads `batchOpenedAt`
  and also warns on USDC that sits unforwarded past N minutes.

## 4. Part B — recovery: design and feasibility

### 4.1 Roles and wallets

| Wallet | Holds | Key | Purpose |
|---|---|---|---|
| Recovery wallet(s) `RECOVERY_WALLET` | EURe + USDC only during a recovery | Vortex, keeper-class KMS | receives `recover()`, signs the reverse swap and the Monerium redeem |
| Float wallet | EURe float | Vortex | pays the slippage residue so the redeem is exact; its outflow **is** the loss ledger |
| Treasury / `FEE_RECIPIENT` | fees, surplus | Safe | receives reverse-swap surplus and sweeps |

**One recovery wallet under a Vortex/SatoshiPay company profile (D3, decided
2026-09-17).** A Monerium redeem burns EURe from a *linked* address of a profile. Product
prefers to return the money from a Vortex/SatoshiPay corporate account linked in
Monerium, so the recovery wallet is one EOA linked to that profile, `RECOVERY_WALLET` is
one immutable in the implementation, and no per-client linking or HD derivation is
needed. Implications to carry, none of them technical blockers:

- **Payer of record.** Every refund is a SEPA credit from SatoshiPay's Monerium account
  to a third party, not a return from the client's own profile. Monerium supports
  outgoing third-party payments (partners page: "IBANs support both incoming and
  outgoing third-party payments"; the `Counterpart` schema exists to identify the
  recipient, not to restrict it), but the pattern "one corporate profile paying many
  unrelated corporates" needs Monerium compliance sign-off alongside G1 item 1, and G2
  must scope it (SatoshiPay executing payments on behalf of clients).
- **Segregation.** Recovered client EURe sits on SatoshiPay's profile until redeemed.
  Use a dedicated profile, or at least a dedicated linked address that holds nothing
  but in-flight recoveries, so balances never commingle with SatoshiPay's own funds; the
  float wallet is a second dedicated address.
- **Onboarding.** That company profile must be KYB-approved in the whitelabel app (the
  whitelabel credentials can only place orders for profiles of that app).
- **Per-order rules apply to the company profile.** `supportingDocumentId` above
  €15,000 (M3), any outgoing limits (M5), and the client's bank statement shows
  Monerium/SatoshiPay as the sender, so the memo must carry the original payment
  reference for the client's reconciliation.
- **Audit trail.** Monerium sees no link between the refund and the client's profile;
  the recovery row plus the memo are the only join.

### 4.2 On-chain primitive

`recover(eureAmount, usdcAmount)` on the clone (Part A): keeper/guardian only, requires
`batchOpenedAt != 0 && now − batchOpenedAt ≥ RECOVERY_DELAY` (immutable, 2 h), sends to
`RECOVERY_WALLET`, emits `Recovered`. Explicit amounts, because another deposit's EURe
or USDC may be sitting on the clone. The on-chain delay is a coarse lower bound (it
counts from the first arrival of the batch, not per deposit); the keeper enforces the
per-deposit deadline exactly. If the keeper poked late (outage), the chain blocks
recovery for up to 2 h after the poke — acceptable.

### 4.3 Orchestration (backend state machine, one row per recovered deposit)

```
deadline hit ──► recovering.moving   recover(eure, usdc) on the clone           [execution kind=recover]
             ──► recovering.swapping reverse swap USDC→EURe from the recovery wallet [kind=reverse_swap]
             ──► recovering.topping  float sends (deposit − EURe held) to the recovery wallet [kind=topup]
             ──► recovering.redeeming POST /orders kind=redeem, exact amount, source IBAN  [financial_operations, exactly-once]
             ──► refunded            order.updated processed (webhook inbox already exists)
             ──► recovery_failed     any step exhausted its retries → runbook, alert
```

- **Trigger.** Per deposit: `mint block time + RECOVERY_DEADLINE` and the deposit is not
  `forwarded`. Also operator-triggered via an admin endpoint for compliance/incident
  cases. The account is flagged `recovering` so the executor stops chunking it; recovery
  waits for any pending execution to settle before sending `recover` (both run under the
  existing per-forwarder advisory lock).
- **Reverse swap.** `exactInput` of all recovered USDC over the reversed whitelisted
  route (USDC → EURC → EURe), `minOut` from the keeper's reference with the same 40 bps
  tolerance, through the private orderflow RPC. One code path: a shortfall is topped up
  by the float, a surplus stays on the recovery wallet and is swept to the treasury.
- **Redeem.** The shared client already has `createRedemptionOrder` and
  `buildMoneriumSepaRedemptionMessage` ("Send EUR {amount} to {iban} at {minute}", must
  be within five minutes, signed by the recovery key). `amount` = the issue order's
  amount string; `counterpart.identifier.iban` = the payer IBAN of the issue order;
  `counterpart.details` = payer name/country from the same order; `memo` references the
  original payment. The inbox/deposit processor is extended to accept `kind: "redeem"`
  events for recovery-wallet addresses.
- **Ledger** (recovery row): EURe recovered, USDC recovered, EURe from reverse swap,
  float top-up (= the subsidy figure product wants), surplus, fees already collected on
  the deposit's chunks (offset, D9), redeem order id, timestamps per phase.
- **Rollout:** `MONERIUM_B2B_AUTO_RECOVERY=off | alert | auto`. `alert` computes and
  logs the recovery plan for every breached deadline and an operator runs it via the
  admin endpoint; `auto` executes it. Start in `alert`.

### 4.4 Leaner alternative for the USDC leg (D4)

**R2: no reverse swap in the critical path.** The float pays `deposit − EURe recovered`
in full, the redeem goes out immediately, and the recovered USDC is swept to the
subsidy vault (which needs USDC anyway) or sold back by a treasury job at leisure.
Recovery shrinks to `recover` → `topup` → redeem (three steps, no DEX interaction under
time pressure, no MEV exposure, no reverse-route liquidity dependency). Cost: the float
must be sized for the largest in-flight ticket, and the loss ledger becomes an internal
FX trade (float out in EURe, treasury in USDC) rather than a pure residue figure. Product
explicitly wants the residue-only subsidy ledger, so **R1 (reverse swap) is the plan and
R2 is the fallback** if the reverse route proves unreliable in the fork exercise.

### 4.5 Feasibility: what is confirmed and what must be asked

Confirmed in code/docs:

- Monerium redeem orders to a SEPA IBAN exist, are signed with the message format the
  shared client already builds, accept EOA signatures, and the API client is in place
  (`packages/shared/src/services/monerium`). Orders ≥ €15,000 require
  `supportingDocumentId`. SEPA Instant is used when the payer's bank supports it, else
  next business day.
- The issue-order webhook already lands in the durable inbox. Monerium's OpenAPI spec
  (`docs.monerium.com/redocusaurus/api.yaml`, `CounterpartResponse`) defines the
  counterpart of **issue orders** as `identifier.iban` (or a generic `BankAccount`) plus
  `details.name` (sender name, required) and an optional `details.address`; there is no
  country and no first/last split. The refund order therefore uses `identifier.iban`
  from the issue order, `details.companyName = name` and `details.country` from the IBAN
  country prefix (corporate clients; individual payers need a name split).
- The keeper's crash-safe send pipeline and the exactly-once `financial_operations`
  ledger are reusable for every recovery step.

Must be verified with Monerium / in the sandbox before committing the contract shape:

| # | Question | Decides |
|---|---|---|
| M1 | Does Monerium accept the Vortex-held fallback and one SatoshiPay profile refunding many client corporates (re-approval of G1 item 1)? (Address↔profile uniqueness is moot: one wallet under the company profile.) | G1, G2 |
| M2 | ~~Payer IBAN and name on issue orders~~ **Answered by the spec** (`CounterpartResponse`, "Issue orders": `identifier.iban`, `details.name`, optional `details.address`). Remaining: capture one real sandbox SEPA order to confirm the webhook carries the same object. | refund target derivation |
| M3 | Is `supportingDocumentId` required for a return-to-originator ≥ €15k, or can it be waived / auto-satisfied (e.g. the original payment confirmation)? | whether large-ticket refunds can be automated |
| M4 | Redeem to an IBAN that is not the profile holder's own (third-party payer) under a corporate profile; memo/reference conventions Monerium wants on a return; any native return facility (none documented). | D10, compliance |
| M5 | Outgoing limits, fees, cut-offs on redemptions. | promise wording |
| M6 | (Only if we ever drop the recovery wallet) EIP-1271 redeem from the clone itself. | R0 alternative |

Verdict: **feasible**, with M3 as the one item that can block full automation.
If M3 is a hard requirement, refunds ≥ €15k stay `alert` mode with an operator upload,
which is still a big improvement over today (funds wait indefinitely).

### 4.6 Failure modes

| Failure | Behaviour |
|---|---|
| `recover` reverts (delay not elapsed, paused? no — recover ignores pause) | retry next cycle; alert after N |
| reverse route thin / quote below tolerance | retry with backoff up to 30 min, then fall back to R2 for this recovery (float pays all) |
| float empty | phase stalls at `topping`, error alert (new float-runway monitor); nothing is lost |
| Monerium rejects the order (compliance, document) | `recovery_failed`, runbook; funds sit on the recovery wallet |
| crash mid-step | every chain step is an execution row with nonce-before-broadcast; the redeem is a claimed `financial_operations` row |
| deposit swapped 100 % but `forward` not confirmed at the deadline | forward completes; the deadline applies to the last swap (D7) |
| second deposit lands during the first one's recovery | explicit amounts in `recover`; the second deposit keeps converting on its own timeline |

## 5. Consequences product must see before saying yes

1. **A deferral becomes a refund.** Today a weekend Chainlink gap makes the keeper
   *defer* and the client waits. With a 2 h promise every deferral longer than 2 h is a
   bank bounce. The drift replay (Coinbase EURC-USDC five-minute VWAP vs Chainlink EUR/USD,
   2025-09 → 2026-09) gives, at `SLIPPAGE_BPS = 40`, ~80 h/year of floor-cause deferral across 10 of
   52 weekends, episodes up to 29 h; at 60 bps it is ~0.2 h/year. **Decide
   `SLIPPAGE_BPS` (60 recommended) before the immutable deploy**, or the refund path
   fires on ordinary weekends. Independent of that, the 2025-10-10 depeg weekend (~48 h
   out of band) would have refunded everything — correct behaviour, but say so in terms.
2. **The reference venue bug must be fixed first.** `reference-rate.ts` reads Coinbase
   `EURC-USD`, which is delisted; today that means every swap defers, which under this
   proposal means every deposit is refunded. Switch to `EURC-USDC` (pending decision).
3. **Fees on a refunded deposit.** Chunk fees already went to `FEE_RECIPIENT`; the float
   still refunds the full amount. Net them in the ledger (D9); no on-chain claw-back.
4. **Gas and float.** One extra transaction per deposit (`forward`, ~70k gas) and four
   per recovery. Float sizing = max concurrent tickets × slippage residue under R1
   (small), or × full ticket under R2.
5. **Trust and terms.** §2 above; the partner agreement's "Vortex cannot move funds"
   language and the Monerium G1 approval both change.

## 6. Change inventory

**Contracts** (`contracts/monerium-forwarder`, Approach A): `VortexForwarder` as in §3.A;
`VortexForwarderFactory.deployForwarder` drops `fallbackAddress` (adds `recoveryWallet` if
per-clone); `ImmutableConfig` gains `recoveryWallet` (if shared) and `recoveryDelay`,
loses `sweepDelay`; `VortexSubsidyVault.pay` unchanged (the clone passes itself as `to`);
manifest v4 (`manifest-core.ts`, `verify-manifest.ts`). Tests: rewrite the sweep/fallback
tests into forward/recover/gating/pause tests; invariants "USDC leaves only to
destination or recovery wallet", "EURe leaves only to router or recovery wallet",
"recover impossible before `RECOVERY_DELAY`", "partial swap never resets `batchOpenedAt`";
fork exercise (runbook §7) extended with a forward and a recovery.

**Backend** (`apps/api`): migrations — `monerium_accounts` drop `fallback_address`, add
`recovery_wallet` (+ derivation index), `monerium_conversion_executions` add `kind`,
`deposit_id`, drop `monerium_deposit_allocations`, new `monerium_recoveries`, deposit
status enum extension; executor (1:N, `forward` step, `kind`-aware calldata expectations);
delete allocation code; recovery orchestrator + recovery/float signers (`chain.ts`);
deposit processor accepts redeem events; manager events (`DEPOSIT_CONVERTED` gains the
forward tx, new `DEPOSIT_RETURNED`); admin endpoints (trigger/list recoveries); monitors
(float runway, recovery-stuck, association monitor covers the recovery address);
config/env (`MONERIUM_B2B_RECOVERY_*`, `MONERIUM_B2B_FLOAT_PRIVATE_KEY`,
`MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES`, `MONERIUM_B2B_AUTO_RECOVERY`); provisioning
reads back `recoveryWallet` instead of `fallbackAddress`.

**Shared/API contract**: `WebhookEventType.DEPOSIT_RETURNED`, payload types, `DepositStatus`
values; OpenAPI json/d.ts, `wire-contract.snapshot.md`, `docs/api/pages/07-webhooks.md`
and `14-managed-profiles.md`.

**Docs**: ADR-0005 amendment 2 (decisions flipped, custody accepted, D-list outcomes,
registry rows P3→`RECOVERY_DELAY`, B5, new rows for float/recovery keys);
`architecture-monerium-b2b-onramp.md` (new sequence + lifecycle diagrams, fees section:
subsidy to the clone); `security-spec/05-integrations/monerium-b2b.md` (invariants 12,
keeper 1/3/4/5/6, monitoring 3/5, threat vectors: Vortex custody path, recovery-key
compromise); rollout (G1 re-approval + M1–M5, terms 2/6 rewrite, ledger);
runbook (§2 recovery operations, float operations, §3 triage rows, §5 destination
rotation now = new clone, §6 recovery/float keys, §7 fork exercise).

**Kept from PR #1375 unchanged:** fee bands, reference VWAP, route whitelist, subsidy
vault and its limits, keeper deferral logic, crash recovery, monitors 1/2/4/6, the
managed-profile wiring, the durable inbox/outbox.

## 7. Phasing and verification

| Phase | Scope | Verify |
|---|---|---|
| 0 — prerequisites on PR #1375 | reference venue → `EURC-USDC`; decide `SLIPPAGE_BPS`; answers to M1–M3 (sandbox SEPA simulation covers M2) | forge + api suites green; sandbox order payload captured |
| 1 — whole-deposit settlement | Approach A contracts incl. the `recover()` primitive; executor 1:N + `forward`; delete N:M attribution; `DEPOSIT_CONVERTED` with forward tx; deposit statuses; manual recovery runbook + admin trigger (operator executes the four steps by hand) | forge unit/invariant/fork; api executor + manager-events tests; fork exercise §7 with a €60k deposit → 3 chunks → 1 forward |
| 2 — automated recovery | orchestrator in `alert` mode, then `auto`; recovery/float signers; redeem-event processing; float + recovery monitors | api state-machine tests with mocked chain; sandbox end-to-end refund (M2/M3 permitting); fork exercise recovery leg |
| 3 — partner surface | `DEPOSIT_RETURNED`, read API fields, OpenAPI/wire snapshot, docs pages | `bun docs:api:check`, `wire-contract:check`, integration test |

Estimated shape: phase 1 is net-negative in backend lines (attribution deleted) and
~+150/−120 in Solidity; phase 2 is the bulk of new code (~800–1,000 lines incl. tests).

## 8. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | Window: 1 h or 2 h (immutable `RECOVERY_DELAY`, plus `RECOVERY_DEADLINE` config) | 2 h |
| D2 | Clock start: mint block time vs provider `processedAt` | mint block time |
| D3 | Recovery wallet: per client under the client's profile vs one wallet under a Vortex/SatoshiPay company profile | **decided: company profile** (§4.1) |
| D4 | USDC leg: R1 reverse swap (residue-only subsidy ledger) vs R2 float absorbs | R1, R2 as automatic fallback when the reverse route fails |
| D5 | Deposits below `minSwapAmount`: refund, merge with the next deposit, or lower the minimum | refund |
| D6 | Destination rotation without a client fallback key: new clone (runbook §5) vs guardian `setDestination` behind the 24 h timelock | new clone; add the setter only when a client asks |
| D7 | Deadline semantics when all chunks are swapped but not forwarded | forward completes; deadline gates the last swap |
| D8 | Refund on market-caused deferral (weekend drift, depeg) vs pause the clock while out of band | refund, with `SLIPPAGE_BPS = 60`; the promise must say so |
| D9 | Chunk fees on a refunded deposit | keep in treasury, net in the ledger |
| D10 | Third-party payer: refund to source IBAN always | yes (SEPA return semantics) |
| D11 | Approach A vs B (vs A′) | A |
| D12 | Rollout: ship phase 1 with manual recovery, automate in phase 2 | yes |
