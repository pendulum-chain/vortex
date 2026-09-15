# Proposal: reference-priced fees and subsidies for the Monerium B2B forwarder

Status: implementation plan, agreed 2026-09-15. The forwarder contracts are not deployed,
so every change below lands in the current contract before launch; no clone migration is
involved. Parameter decisions fold into `adr-0005-monerium-b2b-onramp.md` once shipped.

## Context

The partner agreement fixes the client's rate against a reference: the client receives
the Coinbase EURC-USD reference minus 12.5 bps, and never worse than 15 bps below it.
Today `feeBps` is a flat skim on whatever the DEX returns, and nothing tops a poor fill
up. This proposal moves the fee to a band model enforced on chain, adds a treasury-funded
subsidy vault, makes the swap route configurable within bounds, and records three
decisions taken alongside: no payment bouncing, no guardian-triggered fallback sweep, and
a 7 day dead-man sweep.

## Decisions

- **No bouncing.** Returning EURe to a bank account is a Monerium redeem order, which
  needs the forwarder to approve the payout message via EIP-1271. The forwarder approves
  exactly one message, the link message, so no key can move funds to fiat. Adding a
  redeem path would let whoever holds the whitelabel credentials plus the attestor key
  drain every clone to an arbitrary IBAN. Liquidity problems are handled by waiting,
  lowering `perSwapCap`, and Monerium's own recovery for compliance cases.
- **No guardian sweep to the fallback address.** Only the client (via `sweep`) and the
  permissionless dead-man sweep move EURe to the fallback. A guardian shortcut would
  weaken "Vortex keys cannot move client funds".
- **Dead-man sweep delay (P3) becomes 7 days.** Because the sweep ignores pauses, 7 days
  is also the longest any Vortex-side hold can last; token-level freezes are Monerium's
  lever. Dormancy (P5) stays at 60 days; the two windows are independent.
- **Accepted limitation.** After the 24 h permissionless trigger anyone may execute the
  swap. That path prices against Chainlink and pays no subsidy, so a forced swap can land
  below the 15 bps floor. The rate guarantee applies to keeper-executed swaps; the partner
  terms say so.

## Parameters

| Parameter | Decision |
|---|---|
| Fee unit | parts per million (ppm) |
| Target, per clone | 1250 ppm; increases behind the 24 h timelock |
| Floor, per clone | 1500 ppm; same timelock; floor >= target |
| Max fee and max floor, immutable | 10000 ppm |
| Reference source | Coinbase Exchange EURC-USD ticker, fetched by the keeper per swap; price, timestamp and trade id stored per execution |
| Reference band vs Chainlink, immutable | 100 bps (to confirm; must survive weekend Chainlink staleness) |
| Oracle floor, immutable | 40 bps on the client's net after fee and subsidy; router minimum set to zero, the post-condition is the guard |
| Max subsidy per swap | guardian-settable on the vault, default 50 bps of the reference value |
| Daily subsidy budget | guardian-settable on the vault, default 200 USDC, UTC day bucket; one vault shared by all clones |
| Vault cannot cover | `pay` reverts, the whole swap reverts, funds wait, alert |
| Vault withdrawals | treasury only, immutable |
| Swap routes | guardian-managed whitelist on the factory, validated on chain, caller-selected index, no timelock |
| Route validation | hop tokens only EURe, EURC, USDC; Uniswap tiers 100/500/3000/10000; at most two hops; immutable router |
| Sweep delay (P3) | 7 days |
| Dormancy window (P5) | 60 days, unchanged |

Known tuning consequence: at the EUR 25k per-swap cap a worst-case subsidy is about
135 USDC, so the 200 USDC budget covers roughly one and a half such swaps per day across
all clients before the executor starts deferring. Both limits are live-adjustable.

## Contract design

Per swap the caller passes a reference rate (Chainlink decimals) and a route index.

1. Chainlink price is read with the existing staleness and sign checks. A privileged
   caller's reference must lie within `MAX_REFERENCE_DEVIATION_BPS` of it; a
   permissionless caller's argument is ignored and Chainlink is the reference.
2. The whitelisted route is executed through the immutable router with a zero minimum
   output. Atomic delta checks stay.
3. With `referenceOut = amountIn x reference`, `targetOut = referenceOut x (1 - target)`
   and `floorOut = referenceOut x (1 - floor)`:
   - output above `targetOut`: fee = output - targetOut, capped at `MAX_FEE_PPM`;
   - output between `floorOut` and `targetOut`: no fee, no subsidy;
   - output below `floorOut`: no fee; a privileged swap pulls `floorOut - output` from the
     vault straight to the destination, a permissionless swap pays nothing.
4. Post-condition: output - fee + subsidy >= Chainlink value x (1 - `SLIPPAGE_BPS`),
   otherwise revert. This catches a bad reference or an EURC depeg that a subsidy would
   otherwise paper over.
5. `SwapExecuted` carries reference, route index, fee, subsidy and forwarded amount.

One subsidy vault, shared by every clone, holds treasury-funded USDC, pays only when
called by a factory-registered clone, enforces the per-swap cap and the daily budget, can be paused,
and can be withdrawn only to the treasury. The factory holds the vault address and the
route list, both guardian-managed with events.

The subsidy widens the band a sandwich attacker can exploit from the floor to floor plus
the per-swap cap, paid by the vault. Keeper swaps keep going through the private relay;
the permissionless path has no subsidy and keeps the plain floor.

## Phases

1. **Contracts.** Vault; factory route whitelist and vault hook; forwarder fee policy in
   ppm with shared timelock, reference and route arguments, band check, fee bands, vault
   call, post-subsidy floor, extended event; 7 day sweep delay in fixtures; unit, invariant
   and fork suites; manifest scripts.
2. **Backend.** Reference module (Coinbase ticker, stored per execution; no reference
   means no swap). Executor quotes every whitelisted route, projects fee and subsidy,
   defers while the projected subsidy exceeds the per-swap cap or the remaining budget,
   passes reference and index over the private relay, parses the new event. Execution
   rows gain reference, route and subsidy; net becomes gross - fee + subsidy. Monitoring:
   vault runway, reference divergence, per-route quotes, stranding warning before the
   sweep. Provisioning takes ppm inputs. Converted event and deposits endpoint expose
   fee, subsidy and reference. Later: a minimum deposit age before budget may be spent.
3. **Docs.** ADR-0005 dated amendment (fee model, vault, reference, routes, P3, the
   decisions above); narrow "new routes need a new implementation" to new tokens or a
   new router; security spec pinned-path invariant becomes a validated route set with
   the floor as the bound, plus the sandwich-band note; architecture fees section,
   runbook, rollout terms, API docs.
4. **Rollout.** Sepolia validation with a funded vault and two routes, then mainnet
   deployment of implementation, factory and vault, vault funding, client onboarding.

## Open items

- Reference band value against Chainlink.
- Pacing rule for subsidies when many clients ramp at once (backend, later).
