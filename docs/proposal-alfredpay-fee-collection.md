# Proposal: Collect Vortex/Partner Fees on Alfredpay Corridors

**Status: accepted (2026-08-04), implementation in progress.** The four questions in
§10 were decided: net-rate alignment approved, drain-then-deploy rollout, Base fix
bundled, stranded-funds audit out of scope (interim zero-fee pricing rows assumed).
Supersedes
[PR #1288](https://github.com/pendulum-chain/vortex/pull/1288), which implemented this
feature on the pre-#1232 architecture and was overtaken by the block-flow rewrite. This
proposal re-establishes the feature on the current block-flow engine. The old PR (branch
`claude/elated-wright-5ad4c5`) remains the reference for the money-flow reasoning; none
of its code applies as a patch.

## 1. Problem

The Alfredpay corridors (USD/MXN/COP/ARS, settled in USDT on Polygon) currently
**charge** vortex and partner-markup fees but never **collect** them:

- The onramp deducts `ctx.fees.usd.vortex + partnerMarkup` from the provider mint before
  sizing the bridge/transfer leg
  (`phases/blocks/phases/subsidize-pre/simulation.ts:162`, `simulateAlfredpaySubsidizePre`).
- The offramp deducts the same components from the bridged USD leg before pricing the
  Alfredpay payout (`phases/blocks/phases/alfredpay-offramp/simulation.ts`,
  `providerInput = actualFiat + subsidy − deductibleUsd`).
- No Alfredpay flow contains a `DistributeFees` block
  (`flows/alfredpay-offramp.ts`, `flows/alfredpay-onramp-direct.ts`,
  `flows/alfredpay-onramp-cross-chain.ts`), so the deducted residual **strands on the
  Polygon ephemeral**. The cleanup lanes only sweep USDC/AXLUSDC dust, never USDT, and
  no presigned transaction can move the residual — the platform cannot recover it.

This violates `fee-integrity.md` invariant 1 ("one snapshot MUST govern display and
collection") and is tracked there as the OPEN item "uncollected displayed components".
History: the pre-#1232 tree first shipped an "interim honesty fix" zeroing these
components, then PR #1288 implemented real collection. Neither was merged before #1232
rewrote the pipeline, so current staging has **neither** — fees are charged, displayed,
and stranded. (Whether funds strand in practice depends on the `partner_pricing_configs`
rows for these corridors — see §9.)

Two collateral regressions relative to PR #1288's fixes also exist on staging:

1. **Base Multicall3 split distribution is broken.**
   `blocks/core/fee-distribution.ts` batches plain ERC-20 `transfer` calls through
   `Multicall3.aggregate3`; those execute with the Multicall3 contract as `msg.sender`,
   so they can only move the contract's (empty) balance and the batch reverts. Any Base
   ramp with a nonzero partner markup and a configured partner `payout_address_evm`
   fails at `distributeFees`. The `fee-integrity.md` audit checkbox claiming this path
   is sound is stale.
2. **A positive markup without a partner payout address is silently dropped** (log +
   warn) by the EVM builder, and the quote-time guard `requiresEvmPartnerPayout`
   (`services/quote/index.ts`) only covers BRL routes.

## 2. Facts about the current architecture the design builds on

- **Quote-side charging already exists** (§1) and the persisted fee snapshot
  (`quote_tickets.metadata.globals.fees`, USD + display fiat) is already immutable and
  is what registration reads. No equivalent of the old PR's `platformFeeSnapshot`
  machinery is needed.
- **Flows are versioned, static topologies.** `FlowBuilder.build(name, meta, version)`
  derives `phaseFlow`, transition edges, and a SHA-256 topology hash
  (`core/identity.ts`); quotes persist the flow identity and
  `resolvePersistedBlockFlow` / `getBlockFlowByIdentity` (`flows/catalog.ts`) fail
  closed on any identity not in the catalog. All flows are currently `version = 1`, and
  the catalog holds exactly one version per flow — there is no recovery registration for
  prior versions yet.
- **The `distributeFees` phase and executor already exist** for BRL/EUR flows.
  `DistributeFeesExecutor` (`phases/distribute-fees/execution.ts`) broadcasts a single
  presigned tx through `runFinancialOperation` (durable `financial_operations` claim,
  deterministic keccak256 hash of the presign for reconciliation) and **skips cleanly
  when no presigned `distributeFees` tx exists**. The phase-name registry accepts the
  same executor class across flows and rejects a second class for the same phase name.
- **Nonces are allocated per `(network, signer)` from lane + flow order**
  (`core/prepare.ts`): `main` sequential in flow order, `backup` after main (or pinned
  via `reuseFirstMainNonce`), `cleanup` last. A block contributes nonce-free
  `TxIntent`s.
- **The SDK needs no changes.** It signs any `UnsignedTx` on an EVM network with the
  EVM ephemeral generically, producing the primary plus 4 same-call backups
  (`packages/shared/src/helpers/signUnsigned.ts`); server-side validation matches
  presigns to blueprints by `(phase, network, nonce, signer)`.
- **One dispatch bug blocks Polygon:** `transactions/validation.ts`
  (`getTransactionTypeForPhase`) treats `distributeFees` as EVM only when
  `network === Base`; Polygon would be misvalidated as Substrate.

## 3. Goals and non-goals

**Goals**

1. Collect the charged vortex (+ network, currently 0) and partner-markup components on
   Polygon in USDT for all three Alfredpay flows, after the user-facing leg succeeds.
2. Fail closed everywhere a charged fee could otherwise be dropped (payout-address
   guards at quote time and registration time).
3. Fix the Base Multicall3 split path with the same shared mechanism (sequential
   ephemeral-signed transfers).
4. Keep failure paths whole: a failed ramp returns the user's full value
   (deposit + charged fees), and fee transfers stay funded (settlement targets include
   the fee reserve).
5. Ship a versioned rollout that cannot strand in-flight ramps or unexpired quotes.

**Non-goals**

- No fee clawback after distribution (RISK-010 stands).
- No change to anchor-fee handling (provider-collected).
- No aggregate subsidy budgeting (RISK / accepted).
- No SDK or frontend changes.

## 4. Design

### 4.1 Shared sequential EVM fee-transfer builder (replaces Multicall3)

Rework `blocks/core/fee-distribution.ts`'s EVM side into a network/token-parameterized
builder that returns **one plain ERC-20 `transfer` spec per recipient**:

- network + vortex fees → the active `vortex` pricing row's `payout_address_evm`, with
  the `DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS` fallback;
- partner markup → the pricing partner's (`pricing_partner_id ?? partner_id`)
  `payout_address_evm`; a positive markup with no address **throws** (fails
  registration) instead of logging and dropping;
- amounts derived once via a canonical component-raw helper (network+vortex floored to
  raw units as one bucket, markup floored separately; `totalRaw` = their sum) that every
  other consumer (settlement targets, reserve sizing, tests) reuses — the old PR's
  `computeFeeComponentRaws` / `getAlfredpayFeeTotalRaw`, ported to read
  `metadata.globals.fees.usd`;
- zero-amount transfers are omitted; zero-fee quotes yield an empty list.

Base (USDC) and Polygon/Alfredpay (USDT) both consume this builder.
`contracts/Multicall3.ts` is deleted. Multicall3 fundamentally cannot work here:
`aggregate3` executes calls with the Multicall3 contract as `msg.sender`.

### 4.2 A parameterized `DistributeFees` block appended to the Alfredpay flows

Extend the existing `DistributeFees` block (`phases/distribute-fees/`) with parameters
instead of adding a new phase name (the registry requires one executor class per phase
name, and reuse keeps wiring/validation untouched):

- `network` / `token` (Base+USDC today; Polygon+USDT for Alfredpay);
- a **pass-through simulate mode** for Alfredpay: the fee deduction already happens in
  `AlfredpaySubsidizePre` (onramp) and `AlfredpayOfframp.simulate` (offramp), so the
  block must not deduct again — it passes the `PhaseIO` through unchanged and records
  its own metadata (canonical raw totals, token, network) for the executor's balance
  precondition;
- `prepareTxs` emits one `main`-lane `TxIntent` per transfer from §4.1, signed by the
  EVM ephemeral.

Flow placement (fees are collected only after the user-facing leg succeeded — the
old PR's ordering argument still holds; per `fee-integrity.md`, ordering is per flow):

- `AlfredpayOfframp` flow: `... → alfredpayOfframpTransfer → distributeFees`.
  Main-lane Polygon nonces become: deposit transfer 0, fee transfers 1..N; the
  user-refund fallback keeps nonce 0 via `reuseFirstMainNonce`; cleanup follows.
- `AlfredpayOnrampDirect`: `... → finalSettlementSubsidy → destinationTransfer →
  distributeFees` (same ephemeral, same network: fee nonces follow the destination
  transfer, so the user is paid first by both phase order and nonce order).
- `AlfredpayOnrampCrossChain`: same append; the Polygon fee-transfer nonces follow the
  Squid approve/swap, while phase order still defers broadcasting until after
  `destinationTransfer` on the destination chain.

Zero-fee quotes need no special topology: the builder emits no intents and the executor
already no-ops through the phase. This replaces the old PR's conditional
`nextPhaseSelector` hack with plain static topology.

### 4.3 Executor: sequential multi-transfer broadcast with durable idempotency

Extend `DistributeFeesExecutor`'s EVM branch from "exactly one presign" to "all
`distributeFees` presigns, sorted by nonce":

- one `runFinancialOperation` claim **per transfer**, `attemptClass` keyed by nonce
  (e.g. `evm-fee-distribution:<nonce>`), deterministic hash = keccak256 of that presign
  — confirmed transfers replay locally on retry, unpaid ones proceed;
- reconcile confirmed transfers **before** the balance precondition and require only the
  outstanding amount (decode the pending presigns' `transfer` calldata), so a partial
  success can never wedge the phase behind a balance that no longer exists;
- a mined-but-**reverted** transfer consumed its nonce, so its presign can never succeed
  again: surface as reconciliation-required (halt for manual recovery via the same-call
  backups), never silent auto-retry;
- legacy compatibility: in-flight Base ramps registered before this change carry a
  single presign and possibly a stored `distributeFeeHash`; keep honoring both.

### 4.4 Solvency: settlement and reserve targets include the fee residual

- **Offramp** — `FinalSettlementSubsidyExecutor`'s Alfredpay branch currently tops the
  Polygon ephemeral up to `alfredpayOfframp.inputAmountRaw` (deposit only). Change to
  deposit **plus** the canonical fee total, so the fee transfers are always covered
  after the deposit succeeds. (Subject to the existing
  `MAX_FINAL_SETTLEMENT_SUBSIDY_USD` cap.)
- **Onramp** — `simulateAlfredpaySubsidizePre` writes `targetInputAmountRaw` =
  fee-net target; the executor tops up only to that, so a short provider mint starves
  the fee residual. Reserve `targetOutput + feeTotal` on the ephemeral (while the
  swap/transfer leg continues to consume only `targetOutput`).
- **Failure paths** — the offramp refund fallback must be sized deposit + fees (the
  user was charged those fees against the quoted payout, so a failed ramp returns full
  value); the onramp mint fallback stays full-mint. Fee transfers are never broadcast
  on failure paths.

### 4.5 Guards: a charged fee always has a recipient

- Extend `requiresEvmPartnerPayout` (`services/quote/index.ts`) to the Alfredpay
  corridors (SELL with an Alfredpay output currency; BUY with an Alfredpay input
  currency), and base the check on the **computed rounded component** (a configured
  markup that rounds to zero raw units must not require an address), which means moving
  the check after fee simulation rather than keying on `markupType` alone.
- Registration-time fail-closed guard in the builder (§4.1) covers partner config
  changes between quote and registration.
- The vortex payout address (row value or `DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS`) is
  required only when the quote carries nonzero fees.

### 4.6 Subsidy semantics: align the offramp with the net-rate promise (decision)

The two directions currently disagree:

- **Onramp** (already correct): shortfall is measured from the fee-net actual output
  against the gross expected output — the target discount promises the user's **final
  net rate**, and the subsidy may economically offset the fee (bounded by
  `maxSubsidy`), while the fee itself is still collected in full.
- **Offramp**: the subsidy is sized against the **gross** bridged value and the fee is
  subtracted afterwards — a discounted offramp user lands short of the promised rate by
  exactly the fee.

**Decided: align the offramp with the onramp semantics** (size the subsidy against
`actualFiat − fee`), matching PR #1288's reviewed design and its rewrite of the
"subsidization must not bypass fee collection" invariant: the subsidy may economically
offset fees; it must never reduce, skip, or redirect the collected components. With
`targetDiscount = 0` the directions are already identical, so this only changes
discounted quotes (increased subsidy spend remains capped by `maxSubsidy`).

Hygiene, same area: `simulateAlfredpaySubsidizePre` compares `targetDiscount !== 0`
on a value that Sequelize may return as a DECIMAL **string**; normalize numerically
(the old PR hit this exact bug).

### 4.7 Flow versioning and rollout

Appending a phase changes each Alfredpay flow's phase list, transitions, and topology
hash. **Decided: drain-then-deploy** — the three Alfredpay flows are bumped to
`version = 2` (so stale persisted identities fail closed with a clear
`@1`-unsupported error rather than a hash mismatch), and no recovery registration for
v1 is built. The deploy is gated operationally: stop Alfredpay quoting, wait until no
unexpired Alfredpay quotes and no in-flight Alfredpay ramps remain, then deploy. Any
v1 identity that slips through fails closed at registration/dispatch and needs manual
recovery. A generic multi-version recovery mechanism stays future work for the first
flow change that cannot be drained.

The Base flows need **no** version bump: their phases/transitions are unchanged; only
the number of `distributeFees` transactions in the registration-time plan changes, and
plans are derived at registration, not persisted at quote time.

### 4.8 Validation dispatch

`getTransactionTypeForPhase`: `distributeFees` (and only it — the subsidy phases keep
their current mapping) is EVM when `network === Base || network === Polygon`.

## 5. Deliberate differences from PR #1288

| PR #1288 (old architecture) | This proposal (block-flow) |
|---|---|
| Conditional next phase (`hasFeeDistribution ? "distributeFees" : "complete"`) in two handlers | Static topology; phase always present, executor no-ops on zero fees |
| Hand-rolled `distributeFeeHashes: Record<nonce, hash>` in state metadata | Per-transfer `financial_operations` claims with deterministic presign hashes |
| `platformFeeSnapshot` frozen at initialize (Discount ran before Fee on that route) | Not needed: `metadata.globals.fees` is already the single persisted snapshot all consumers read |
| Fee charging added to quote engines | Charging already exists on staging; only collection, reconciliation, and guards are added |
| Handler-level Polygon/Base dispatch by quote metadata | Block parameterization; the flow declares network/token |

## 6. Implementation steps

Each step compiles, passes the suite, and is a reviewable commit.

1. **`fix(api)`: sequential EVM fee transfers replace Multicall3 on Base.**
   §4.1 builder (Base only at this point) + §4.3 executor multi-presign support +
   fail-closed markup guard + delete `contracts/Multicall3.ts`.
   Verify: new Base split regression test (profile-priced partner: both payout
   addresses receive exact amounts on the fake ledger — the old aggregate3 batch
   credits nobody); legacy single-presign path covered.
2. **`feat(api)`: collect vortex/partner fees on Alfredpay corridors.**
   §4.2 block parameterization + three v2 flows + §4.4 settlement/reserve sizing +
   §4.5 guards + §4.8 validation dispatch + fallback sizing. Unit test: persisted v1
   Alfredpay identities fail closed (drain-then-deploy contract).
3. **`fix(api)`: offramp net-rate subsidy alignment** (§4.6) +
   `targetDiscount` string-comparison hygiene.
4. **`docs(api)`: security-spec sync** (§8) — in the same PR as the behavior changes
   per repo policy; listed separately here only for drafting order.

## 7. Test plan

- **Block unit tests** (`blocks/__tests__/`):
  - builder: split vs vortex-only vs zero-fee; rounding at component level; throw on
    markup-without-address; Base/USDC and Polygon/USDT parameterizations;
  - `*.flow.test.ts`: updated phase arrays + v2 identity; v1 recovery resolution;
  - `*.transactions.test.ts`: exact `(phase, network, nonce, signer, lane)` layout for
    all three Alfredpay flows, including fallback nonce pinning;
  - `wiring.test.ts`: still one executor class for `distributeFees`.
- **Corridor scenario tests** (`tests/corridors/`):
  - happy-path fee collection BUY (direct + cross-chain) and SELL: quote output reduced
    by the fee, `distributeFees` in phase history, exact payout balances on the fake
    ledger (extend `scriptHappyWorld` to apply fee-transfer effects);
  - discount + fee: promised net rate delivered while the full fee is collected
    (onramp; offramp too once §4.6 lands);
  - partial-distribution retry: first transfer confirmed, second fails once → retry
    pays only the outstanding transfer, each recipient credited exactly once;
  - mined-but-reverted transfer → reconciliation-required, no rebroadcast;
  - markup-without-payout-address: quote rejected (Alfredpay corridors), and
    registration fails closed if config changes after quoting;
  - positive markup rounding to zero: no address required, no transfer built;
  - zero-fee quote: phase present, no transfers, ramp completes;
  - offramp failure path: refund equals deposit + charged fees;
  - `alfredpay-currencies.scenario.test.ts`: fee collection across all four fiats.
- **Full suite** + `bun typecheck` + Biome.

## 8. Security-spec updates (same change)

- `fee-integrity.md`: replace the Multicall3 "Distribution" description with the
  sequential-transfer scheme and why Multicall3 cannot work; correct the stale
  audit checkbox; close the OPEN items "uncollected displayed components" (Alfredpay)
  and "missing partner payout" (now fail-closed); document the Alfredpay/Polygon
  distribution (ordering, solvency, idempotency, amount canonicalization — port the
  old PR's section, adapted to financial-operations idempotency).
- `discount-mechanism.md`: net-rate subsidy semantics for invariant 6 (and the
  offramp paragraph) per §4.6's outcome.
- `block-flow-architecture.md` checklist: note the first real multi-version catalog
  mechanism if §4.7 lands as designed.
- `RISK-REGISTER.md`: unchanged (RISK-010 still applies to the new corridors).

## 9. Ops / rollout checklist

- **Interim stop-loss (assumed applied until this ships):** corridor-scoped zero-fee
  `partner_pricing_configs` rows (`fiat_currency` ∈ {USD, MXN, COP, ARS}) for the
  `vortex` partner, via the admin API. The stranded-funds audit for past ramps is out
  of scope for this change.
- **Drain-then-deploy (§4.7):** stop Alfredpay quoting, wait out unexpired Alfredpay
  quotes and in-flight Alfredpay ramps, then deploy the v2 flows.
- Before enabling nonzero fees after deploy: `DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS` set in
  prod; `vortex` rows for BUY and SELL carry `payout_address_evm`; partner rows with
  markup on these corridors carry `payout_address_evm`.

## 10. Decisions (resolved 2026-08-04)

1. **Offramp net-rate alignment (§4.6)** — approved; implement with the feature.
2. **Rollout (§4.7)** — drain-then-deploy; no recovery-version mechanism now.
3. **Base Multicall3 fix (§6 step 1)** — bundled in this PR, not split.
4. **Stranded funds (§9)** — out of scope; interim zero-fee mitigation assumed.
