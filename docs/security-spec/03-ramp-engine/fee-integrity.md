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
distributed while the ephemeral holds USDC:

- BRL/EUR off-ramp flows execute `DistributeFees` before the USDC-to-BRLA/EURC Nabla
  swap.
- BRL/EUR on-ramp flows execute `DistributeFees` after the BRLA/EURC-to-USDC Nabla
  swap.
- Anchor fees are netted by the provider and are not moved by `DistributeFees`.
- A flow without a `DistributeFees` block does not collect Vortex, network, or partner
  components on-chain. Such a flow MUST either quote those components as zero or add an
  explicit collection block.

The cataloged flow sequence is the authority. A broad statement that distribution must
always occur only after all user-facing phases is incorrect.

### Distribution

- **EVM/Base:** Base USDC is sent directly when only the Vortex destination is needed,
  or atomically through Multicall3 `aggregate3` at
  `0xcA11bde05977b3631167028862bE2a173976CA11` for split Vortex/partner payouts.
- **Pendulum:** `utility.batchAll` groups USDC transfers, with the configured optional
  PEN buyback applied to the Vortex component.
- Network and Vortex components use the active Vortex payout address. Partner markup
  resolves through `pricing_partner_id ?? partner_id`.
- Fee **amounts** come from the immutable quote snapshot. Payout **addresses** are
  deliberately resolved while the registration plan is built, so address rotation can
  affect an already-created but not-yet-registered quote.
- Distributed fees are final. The current implementation has no automatic clawback if
  a later delivery phase fails.

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
| Missing payout address silently loses revenue | Vortex destination fails closed; partner gap remains tracked |
| Rounding is represented inaccurately | Current EVM and Substrate rules are documented separately |
| Later phase fails after collection | Accepted recovery gap; operational reconciliation is required |

## Audit Checklist

- [x] `blocks/core/fees.ts` is the only block-flow writer of the base fee snapshot;
  provider/network blocks replace only owned components.
- [x] Quote finalization persists `metadata.fees`; registration and status do not
  recompute fee amounts.
- [x] `fee-distribution.ts` reads `metadata.fees.usd` and excludes `anchor`.
- [x] BRL/EUR off-ramp flows distribute before Nabla; BRL/EUR on-ramp flows distribute
  after Nabla.
- [x] Direct BRL/EUR same-token routes quote zero bridge network fee.
- [x] EVM distribution uses direct ERC-20 transfer or atomic Multicall3 with
  `allowFailure: false`.
- [x] Partner payout attribution uses `pricing_partner_id ?? partner_id`.
- [x] Negative calculated components are clamped to zero.
- [ ] **OPEN — uncollected displayed components:** any live flow that displays positive
  Vortex/partner/network fees but has no `DistributeFees` block violates invariant 1.
- [ ] **OPEN — missing partner payout:** the EVM builder currently logs and drops a
  positive markup when the pricing partner has no payout address. Quote/registration
  must fail instead.
- [ ] **OPEN — cross-chain rounding consistency:** EVM raw distribution uses half-up
  while Substrate truncates. Preserve current behavior until a versioned accounting
  decision changes it.
- [ ] **OPEN — post-distribution failure recovery:** no automated clawback/refund exists
  after fees have been distributed.
- [ ] Mykobo fee-tier selection depends on `MYKOBO_CLIENT_DOMAIN`; configuration and
  live provider fee must agree before the rail executes.
