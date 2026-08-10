# Fee Integrity

## What This Does

The block-flow quote pipeline computes one fee snapshot and persists it on the quote.
Every later consumer uses that snapshot for API display, swap sizing, subsidy math, and
fee-distribution transaction preparation. Historical functions such as
`calculateTotalReceiveOnramp()` and `calculateTotalReceive()` are not part of the current
architecture and MUST NOT be used as evidence for current behavior.

### Canonical block-flow pipeline

1. `blocks/core/quote-fees.ts` calculates the configured Vortex fee, partner markup, and
   provisional anchor fee using `Big.js` and server-side pricing rows.
2. `blocks/core/fees.ts` builds `PhaseCtx.fees` in both USD and the display fiat
   currency. A block that obtains a live provider or bridge price may replace only the
   component it owns:
   - Mykobo and Avenia fee blocks install their live provider fee;
   - routed blocks install the Squid network fee;
   - direct/no-bridge routes preserve a zero network fee.
3. Quote finalization persists the resulting snapshot in
   `quote_tickets.metadata.fees`. After quote creation, fee amounts are immutable.
4. `blocks/core/fee-distribution.ts` reads `metadata.fees.usd` when the registration
   transaction plan is built. It distributes `network + vortex + partnerMarkup`; the
   provider collects the anchor fee separately.

`calculateFeeComponents` still derives a provisional anchor fee from the `anchors`
table. Provider-backed production blocks replace it with the provider's live amount.
The provisional value MUST NOT be treated as authoritative for a route whose provider
block has not successfully supplied its override.

### Ordering is per flow

There is deliberately no global “fees before swap” or “fees after swap” rule. Fees are
distributed while the ephemeral holds the fee token:

- BRL/EUR off-ramp flows execute `DistributeFees` before the USDC-to-BRLA/EURC Nabla
  swap.
- BRL/EUR on-ramp flows execute `DistributeFees` after the BRLA/EURC-to-USDC Nabla
  swap.
- Alfredpay flows (USD/MXN/COP/ARS, USDT on Polygon) execute `DistributeFees` as the
  LAST phase before `complete`, after the user-facing leg (`destinationTransfer` /
  `alfredpayOfframpTransfer`) succeeded: the corridor deducts the components from the
  user leg during pricing (`AlfredpaySubsidizePre` / `AlfredpayOfframp`) and the block
  only collects the reserved residual (pass-through simulation).
- Anchor fees are netted by the provider and are not moved by `DistributeFees`.
- A flow without a `DistributeFees` block does not collect Vortex, network, or partner
  components on-chain. Such a flow MUST either quote those components as zero or add an
  explicit collection block.

The cataloged flow sequence is the authority. A broad statement that distribution must
always occur only after all user-facing phases is incorrect.

### Distribution

- **EVM (Base USDC, Polygon USDT):** one plain ephemeral-signed ERC-20 `transfer` per
  fee recipient at consecutive main-lane nonces (`createEvmFeeDistributionTransactions`):
  network + vortex fees to the vortex `payout_address_evm` (with the
  `DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS` fallback), partner markup to the pricing
  partner's address. Multicall3 batching is deliberately NOT used: `aggregate3`
  executes each call with the Multicall3 contract as `msg.sender`, so a batched
  ERC-20 `transfer` could only move the contract's (empty) balance and the batch
  reverts — the former split path failed every Base ramp with a nonzero partner markup
  and a configured partner payout address.
- The executor broadcasts the presigned transfers in nonce order with one durable
  financial-operation claim per transfer (`evm-fee-distribution[:nonce]`); confirmed
  claims replay without a second broadcast, the balance precondition covers only the
  unpaid transfers, and a mined-but-reverted transfer halts the ramp for manual
  reconciliation (its nonce is consumed, so the presign can never execute again).
- **Pendulum:** `utility.batchAll` groups USDC transfers, with the configured optional
  PEN buyback applied to the Vortex component.
- Network and Vortex components use the active Vortex payout address. Partner markup
  resolves through `pricing_partner_id ?? partner_id`. Payout addresses are resolved
  (and required) only for quotes whose rounded components are positive; a positive
  markup without a partner `payout_address_evm` fails quote creation
  (`assertEvmPartnerPayoutPresent`, computed-component based) and — if partner
  configuration changes between quote and registration — fails registration in the
  transfer builder. A charged fee can never be silently dropped.
- Fee **amounts** come from the immutable quote snapshot; every raw-unit consumer
  (transfers, settlement targets, reserve sizing, fallback refunds) derives them from
  the shared component rounding in `computeFeeComponentRawsFromUsd` /
  `getEvmFeeTotalRawFromUsd` so the amounts reconcile exactly. Payout **addresses**
  are deliberately resolved while the registration plan is built, so address rotation
  can affect an already-created but not-yet-registered quote.
- Distributed fees are final. The current implementation has no automatic clawback if
  a later delivery phase fails.

### Dynamic EVM destination execution fees

- BUY flows with a non-direct EVM payout quote the native execution cost of both the
  treasury-to-ephemeral funding transfer and the presigned payout. Base and Base Sepolia
  additionally query the GasPriceOracle for each transaction's L1 security fee upper
  bound; omitting this component underprices a fee charged on every normal Base-family
  transaction.
- The quote applies `EVM_DESTINATION_NETWORK_FEE_MARGIN_BPS` once and persists the
  resulting absolute `maximumFeePerGas`, funding/payout gas limits, and Base L1
  maxima. Runtime acceptance never reconstructs a ceiling from current deployment
  configuration. Arbitrum gas limits add the NodeInterface parent-chain poster-gas
  component; a plain transfer is not assumed to fit in 21,000 gas there.
- The persisted-metadata read boundary validates every funding-program-v2 field before
  treasury arithmetic: the version and EVM network, transfer kind, positive bounded
  decimal-integer fee/gas fields, positive execution-fee decimal, and paired Base-family
  L1 maxima. An absent envelope remains the legacy static program.
- Registration preflights the persisted envelope before provider registration hooks
  can create an independently durable payment ticket, then checks the exact prepared
  payout against the same absolute limits.
- Immediately before the treasury funding transfer, execution re-estimates the L2 fee
  and both Base L1 upper bounds (funding and payout). If any exceeds the persisted absolute envelope,
  the phase pauses recoverably before claiming or broadcasting a new financial operation.
  The journal resolves an already-confirmed operation before this preflight, so a
  receipt-confirmed send remains replayable after a balance-poll timeout even if fees
  subsequently rise. An accepted new transfer carries the checked gas and EIP-1559 fee
  caps explicitly.
- The native amount delivered to the ephemeral is based on the bounded signed payout
  liability, not arbitrary client fields. The gas limit must match the server blueprint
  and the signed fee cap cannot exceed the shared production signer's 3× multiplier.
  Base-family payouts reserve the persisted maximum payout L1 fee, rather than an
  early exact oracle value that can become stale before settlement.
- Funding metadata carries program version 2. Quotes without that metadata execute
  the historical static-funding program and operation identities. Dynamic financial
  operations use v2 attempt classes and bind their request hash to the stable target
  balance, so a confirmed send can be replayed after an RPC-balance polling timeout.
- Dynamic quote production is opt-in through
  `EVM_DYNAMIC_DESTINATION_FUNDING_ENABLED`. Deploy the dual-reader/dual-executor code
  to every API and worker replica while disabled, then enable quote production. This
  prevents an old worker from consuming v2 metadata during a rolling deployment.
- The residual between a signed/quoted cap and the effective fee is accepted native
  dust for now. It is not solved by this policy and remains documented in
  `ephemeral-accounts.md`; a future smart-contract or paymaster flow can eliminate it.

### Alfredpay corridors: solvency and failure safety

- **Charging** — the onramp deducts vortex/partner components from the provider mint
  before sizing the bridge/transfer leg; the offramp deducts them from the bridged USD
  leg before pricing the Alfredpay deposit. The residual stays reserved on the Polygon
  ephemeral until `distributeFees`.
- **Solvency** — the onramp pre-swap settlement reserves the swap target PLUS the fee
  residual (`SubsidizePreMetadata.feeReserveRaw`), and the offramp
  `finalSettlementSubsidy` targets deposit + fees, so a short provider leg cannot
  starve the fee transfers.
- **Failure safety** — fees are collected only after the user-facing leg succeeded.
  The offramp refund fallback is sized deposit + charged fees so a failed ramp
  returns the user's full value; the onramp mint fallback stays full-mint.
- **Rollout** — the fee phase shipped as flow version 2 of the three Alfredpay flows
  with a drain-then-deploy gate; persisted v1 identities fail closed at
  registration/dispatch and require manual recovery.

### Rounding

Big.js modes are explicit where security-sensitive:

| Point | Current rule |
|---|---|
| Quote component/display totals | half-up to the documented decimal precision |
| Substrate distribution raw units | round down (`toFixed(0, 0)`) |
| EVM distribution raw units | half-up (`toFixed(0)`) |
| Provider-side amounts that require truncation | round down |

The EVM/Substrate raw-unit difference is current behavior, not a universal invariant.
Changing it requires explicit compatibility and accounting review because existing
quotes may already contain snapshots prepared under the old rule.

## Security Invariants

1. **One snapshot MUST govern display and collection** — the API, flow sizing, and
   distribution MUST derive fee amounts from the persisted `metadata.fees` snapshot.
2. **Fee parameters MUST NOT be client-controllable** — rates and fixed amounts come
   only from server pricing configuration and provider quotes.
3. **Fee arithmetic MUST use arbitrary precision** — monetary computation uses
   `Big.js`; native JavaScript floating-point arithmetic is not authoritative.
4. **Negative fee components MUST be clamped to zero.**
5. **Provider and network overrides MUST occur before quote finalization** — a live
   corridor MUST NOT execute using the provisional anchor value or a network fee from a
   route that is not present.
6. **Flow-local ordering MUST match the collection currency** — each cataloged flow
   places `DistributeFees` at the point where the ephemeral holds USDC.
7. **Anchor fees MUST be included in the quoted economics but excluded from on-chain
   distribution** — the provider collects them.
8. **Distribution MUST transfer the snapshot's network, Vortex, and partner-markup
   components without recalculating rates.**
9. **Partner markup MUST use pricing attribution** —
   `pricing_partner_id ?? partner_id` identifies the payout partner.
10. **Pricing changes MUST NOT alter an existing quote's amounts** — payout-address
    rotation before registration is the only deliberate live configuration lookup.
11. **A missing required Vortex payout destination MUST fail transaction preparation**
    — it must not silently drop fees.
12. **A positive partner markup without a payout destination MUST be rejected before
    execution or recorded as an explicit conformance gap** — logging and dropping it is
    not fee integrity.
13. **Discount display MUST NOT rewrite charged components** — a subsidized rate
    improvement is a separate platform-funded benefit.
14. **Reconciliation MUST compare like with like** — on-chain totals exclude anchor
    fees; provider statements account for the anchor component.
15. **Failure after fee distribution is an accepted recovery gap** — no spec may imply
    an automatic fee refund until one exists.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| Client injects lower fee fields | Request fee fields are ignored; server builds the snapshot |
| Pricing changes rewrite an in-flight quote | Amounts are persisted and read from `metadata.fees` |
| Wrong universal ordering changes the effective charge | Cataloged per-flow order is normative |
| Anchor fee is collected twice | Anchor included in quote total but excluded from `DistributeFees` |
| Partner payout is misattributed | Resolve with `pricing_partner_id ?? partner_id` |
| Missing payout address silently loses revenue | Vortex destination fails closed; a positive computed markup without a partner address fails quote creation and registration |
| Batched transfers cannot move ephemeral funds | Multicall3 removed; plain sequential ephemeral-signed transfers only |
| Retry double-pays a fee recipient | One durable financial-operation claim per transfer; confirmed claims replay without broadcasting |
| Rounding is represented inaccurately | Current EVM and Substrate rules are documented separately |
| Later phase fails after collection | Accepted recovery gap; operational reconciliation is required |

## Audit Checklist

- [x] `blocks/core/fees.ts` is the only block-flow writer of the base fee snapshot;
  provider/network blocks replace only owned components.
- [x] Quote finalization persists `metadata.fees`; registration and status do not
  recompute fee amounts.
- [x] `fee-distribution.ts` reads `metadata.fees.usd` and excludes `anchor`.
- [x] BRL/EUR off-ramp flows distribute before Nabla; BRL/EUR on-ramp flows distribute
  after Nabla; Alfredpay flows distribute last, after the user-facing leg.
- [x] Direct BRL/EUR same-token routes quote zero bridge network fee.
- [x] EVM distribution uses plain sequential ephemeral-signed ERC-20 transfers, one per
  recipient. **CHANGED 2026-08** — the former split path batched transfers through
  Multicall3 `aggregate3`, which executes with the contract as `msg.sender` and could
  never move the ephemeral's tokens; the previous checkbox asserting that path was
  sound was wrong. Pinned by the "fee collection" test in
  `apps/api/src/tests/corridors/brl-offramp.scenario.test.ts`.
- [x] Partner payout attribution uses `pricing_partner_id ?? partner_id`.
- [x] Negative calculated components are clamped to zero.
- [x] **Alfredpay corridors charge AND collect vortex/partner fees** — previously the
  components were deducted from the user leg but no `DistributeFees` block existed, so
  the residual stranded unrecoverably on the Polygon ephemeral (invariant 1
  violation). **FIXED 2026-08** — flow version 2 appends the Polygon/USDT collection
  phase after the user-facing leg; solvency, failure-path sizing, and idempotency per
  the "Alfredpay corridors" section above. Pinned by the fee-collection tests in
  `mxn-onramp.scenario.test.ts` and `mxn-offramp.scenario.test.ts` (payout-address
  balances asserted on the fake ledger).
- [x] **Partner markup without a payout address fails closed** — quote creation rejects
  a positive COMPUTED markup on every EVM-collecting corridor when the pricing partner
  lacks `payout_address_evm` (a configured markup that rounds to zero raw units needs
  no address), and the transfer builder throws at registration if configuration
  changed after quoting. **FIXED 2026-08**; previously logged and dropped.
- [ ] **OPEN — cross-chain rounding consistency:** EVM raw distribution uses half-up
  while Substrate truncates. Preserve current behavior until a versioned accounting
  decision changes it.
- [ ] **OPEN — post-distribution failure recovery:** no automated clawback/refund exists
  after fees have been distributed.
- [ ] Mykobo fee-tier selection depends on `MYKOBO_CLIENT_DOMAIN`; configuration and
  live provider fee must agree before the rail executes.
