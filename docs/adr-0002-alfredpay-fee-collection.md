# ADR 0002: Alfredpay Fee Collection and Sequential EVM Fee Distribution

Status: accepted 2026-08-04, implemented in
[PR #1310](https://github.com/pendulum-chain/vortex/pull/1310).

## Context

After the block-flow rewrite (#1232), the Alfredpay corridors (USD/MXN/COP/ARS, USDT on
Polygon) deducted vortex/partner fee components from the user-facing leg during pricing
but had no `DistributeFees` block: the residual stranded unrecoverably on the Polygon
ephemeral (cleanup lanes sweep only USDC/axlUSDC, and the platform holds no ephemeral
keys). Separately, the Base partner-split path batched ERC-20 transfers through
Multicall3 `aggregate3`, which executes calls with the contract as `msg.sender` and can
never move the ephemeral's tokens — every Base ramp with a nonzero partner markup and a
configured partner payout address reverted at `distributeFees`.

An earlier implementation ([PR #1288](https://github.com/pendulum-chain/vortex/pull/1288))
targeted the pre-#1232 architecture and was never merged. Its money-flow reasoning was
carried over; none of its code applied.

## Decision

1. **EVM fee distribution uses plain sequential ephemeral-signed ERC-20 transfers**, one
   per fee recipient at consecutive main-lane nonces, on Base (USDC) and Polygon (USDT).
   Multicall3 batching is rejected on `msg.sender` grounds. Each transfer runs under its
   own durable financial-operation claim; ambiguous or reverted outcomes halt the ramp
   for manual reconciliation rather than retrying.
2. **The three Alfredpay flows collect fees as a trailing `distributeFees` phase (flow
   version 2)**, after the user-facing leg succeeded. The corridor deducts the
   components during pricing; the block's simulation is a pass-through and only the
   reserved residual is collected. Settlement keeps that residual funded (onramp
   pre-swap reserve, offramp deposit + fees target), and the offramp refund fallback
   returns the user's bridged value.
3. **A partner target discount promises the user's final, net-of-platform-fees rate** in
   both directions: the subsidy shortfall is measured from the fee-net actual output, so
   a subsidy may economically offset charged fees (bounded by `maxSubsidy`) while the
   fee components remain reserved and collected.
4. **Rollout is drain-then-deploy.** Version 1 Alfredpay identities are not kept
   dispatchable; deploys are gated on draining unexpired v1 quotes and in-flight v1
   ramps, and anything that slips through fails closed for manual recovery. A generic
   multi-version recovery catalog remains future work for the first flow change that
   cannot be drained.
5. **A charged fee must always have a recipient and a collection path.** Quote creation
   rejects a positive computed markup without a partner `payout_address_evm` (a
   configured markup that rounds to zero raw units needs no address); registration fails
   closed if partner configuration changed after quoting or if the fee-token
   configuration is missing for a fee-charging quote.

## Consequences

- Displayed vortex/partner fees on Alfredpay corridors are actually collected; the
  Base partner split works. Stranded fees from ramps before this change are not
  recoverable and were mitigated operationally with corridor-scoped zero-fee pricing
  rows.
- Distributed fees remain final (no clawback after a later phase fails —
  RISK-010 in the [risk register](security-spec/RISK-REGISTER.md)).
- Deploys touching Alfredpay flow topology require the drain runbook; enabling nonzero
  fees requires `DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS` and `payout_address_evm` on the
  active vortex (and markup-partner) pricing rows.
- Discounted offramps spend more subsidy than before (the promised net rate is now
  honored); unchanged with `targetDiscount = 0`.

## Links

- Normative behavior: [`security-spec/03-ramp-engine/fee-integrity.md`](security-spec/03-ramp-engine/fee-integrity.md),
  [`security-spec/03-ramp-engine/discount-mechanism.md`](security-spec/03-ramp-engine/discount-mechanism.md),
  [`security-spec/03-ramp-engine/ramp-phase-flows.md`](security-spec/03-ramp-engine/ramp-phase-flows.md),
  [`security-spec/05-integrations/alfredpay.md`](security-spec/05-integrations/alfredpay.md)
- Implementation: [PR #1310](https://github.com/pendulum-chain/vortex/pull/1310);
  superseded draft: [PR #1288](https://github.com/pendulum-chain/vortex/pull/1288)
