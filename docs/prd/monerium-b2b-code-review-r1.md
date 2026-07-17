# Monerium B2B Forwarder — Adversarial Code Review R1

**Reviewer:** adversarial security review (automated)
**Date:** 2026-07-17
**Scope:** `contracts/monerium-forwarder/` (VortexForwarder + Factory + tests) against the B2B variant spec, implementation plan (invariants §2.3, dispositions §5), and deferred-decisions registry.
**Build/test:** `forge build` clean; `forge test --no-match-contract Fork` = 28 pass / 0 fail. Two PoC tests written during review (guardian stranding-reset, permissionless min-out execution) both passed, then removed.

## Verdict

The core non-custody property **holds on-chain**: there is no path for Vortex (attestor/guardian/keeper/deployer) to redirect converted USDC away from the client's `destination` or to a Vortex address, and `isValidSignature` cannot validate a Monerium redeem order. **No P0 found.** The strongest issue is a P1 liveness/griefing escalation: the guardian can indefinitely defeat the permissionless recovery backstop that the design deliberately kept guardian-proof. Several P2 notes and concrete test gaps follow.

## Findings table

| # | Sev | Title | Location |
|---|-----|-------|----------|
| F1 | **P1** | Guardian can indefinitely freeze the permissionless recovery paths via `minSwapAmount` raise + `poke()` (violates invariant §2.3.5; defeats un-pausable dead-man sweep) | `VortexForwarder.sol:265-276`, `293`, `328`; `VortexForwarderFactory.sol:96-98,120-124` |
| F2 | P2 | No `chainid`/domain separator in the EIP-1271 bound → cross-chain replay of the link attestation if the forwarder is ever deployed at the same address on another chain (EURe is multichain) | `VortexForwarder.sol:254` |
| F3 | P2 | Oracle staleness check omits round-completeness (`answeredInRound`/`roundId`) | `VortexForwarder.sol:337-339` |
| F4 | P2 | Permissionless `swapAndForward` is MEV-exposed (no private orderflow); executes at up to `SLIPPAGE_BPS` worse, sandwich-extractable | `VortexForwarder.sol:283-311` |
| F5 | P2 | Spec/code drift: variant §3.3 shows `abi.encode`, code uses `abi.encodePacked`; attestor signs the raw `bound` digest. Off-chain signer must match exactly or links silently fail | `VortexForwarder.sol:254` vs variant §3.3 |
| F6 | P2 | `swapAndForward` clears `strandedSince` even when a `perSwapCap` remainder ≥ `minSwapAmount` stays; permissionless path must re-poke + re-wait `TRIGGER_DELAY` per cap-chunk | `VortexForwarder.sol:328` |
| F7 | P2 | `RECOVERY_HASH` mechanism (disabled) only preserves non-custody **iff** Monerium's recovery message is parameterless — a hard constraint on how registry T1 may be resolved | `VortexForwarder.sol:237` |
| F8 | P2 | EURe compliance-transfer-revert behaviour unmodeled/undocumented: if Monerium freezes the forwarder's EURe, both `sweepStrandedEure` and client `sweep` revert (funds stuck) | `VortexForwarder.sol:349-356,379-384` |
| F9 | P2 (nit) | `_setMinSwapAmount` relies on unparenthesised `&&`/`||` precedence | `VortexForwarderFactory.sol:121` |
| F10 | P2 (nit) | Invariant §2.3.3 says "at most the two whitelisted hashes"; code accepts up to three hash constants (191, RAW, RECOVERY) | `VortexForwarder.sol:236-237` vs plan §2.3.3 |
| — | — | Test-suite gaps (enumerated in §"Test gaps") | — |

---

## F1 (P1) — Guardian defeats the permissionless recovery backstop

**Verified (PoC passed).**

The dead-man sweep (`sweepStrandedEure`) and the permissionless `swapAndForward` are the design's guardian-proof liveness backstops. `sweepStrandedEure` is *deliberately not pause-gated* (`VortexForwarder.sol:345-347` comment: "recovery must work during incidents"), and implementation-plan invariant §2.3.5 states `strandedSince` is "monotonic per stranding episode; reset only by swap success/balance drop." Both guarantees are bypassable by the guardian.

`poke()` (`:265-276`) arms/clears the marker against the **mutable, global** `FACTORY.minSwapAmount()`:

```solidity
if (balance >= FACTORY.minSwapAmount()) { if (strandedSince == 0) strandedSince = ...; }
else if (strandedSince != 0) { strandedSince = 0; ... }   // "balance drop" branch
```

The guardian can synthesise the "balance drop" by **raising the threshold above an existing balance** (`setMinSwapAmount`, `Factory.sol:96`, bounded only by `[MIN_SWAP_FLOOR, perSwapCap]` — floor is 1e18, so any real balance can be undercut). Sequence:

1. Client has 100 EURe stranded; `strandedSince` armed at t0. Day 59 of the 60-day dead-man window.
2. Guardian `setMinSwapAmount(200e18)` (in bounds).
3. Anyone `poke()` → `balance(100) < min(200)` → `strandedSince = 0`. The 59 days are erased.
4. While the guardian holds `min > balance`, `poke()` can never re-arm, so `sweepStrandedEure` reverts `NotStranded` **forever**, and `swapAndForward` reverts `BelowMinimum` (`:293`) — no conversion either.

Net: the guardian unilaterally re-creates the exact "stranded forever, no permissionless rescue" terminal state the dead-man sweep was built to eliminate. This is **strictly more power than pause** (pause leaves `sweepStrandedEure` callable). It is a liveness/griefing escalation, not theft — the client's own `fallbackAddress` can still `sweep()` — but it voids a stated security property for any client relying on the zero-touch/permissionless path, and because `minSwapAmount` is **global**, one raise freezes every client below the threshold at once.

**Fix:** decouple the stranding marker from the guardian-tunable operational `minSwapAmount`. Options, cleanest first:
- Arm/clear `poke()` against the **immutable `MIN_SWAP_FLOOR`** instead of `FACTORY.minSwapAmount()`. The marker then only tracks "a non-trivial balance is parked," which the guardian cannot move.
- Or snapshot the arming threshold in storage when `strandedSince` is first set and clear only if balance falls below *that* snapshot.
- Or only clear on `balance == 0` / an actual observed decrease (track last-seen balance).

Whichever is chosen, add an invariant/fuzz action that raises `minSwapAmount` mid-stranding and asserts `strandedSince` and the SWEEP_DELAY deadline are preserved.

---

## F2 (P2) — Cross-chain replay of the link attestation

`isValidSignature` binds only to `address(this)` (`:254`): `bound = keccak256(abi.encodePacked(address(this), hash))`. No `block.chainid`. The design doc claims "no cross-contract replay," but cross-**chain** replay is uncovered. Monerium EURe is deployed on multiple chains (Ethereum, Gnosis, Polygon, Arbitrum, …). Clone addresses are CREATE2-deterministic in the factory address + salt + init code; if the factory lands at the same address on two chains (common when teams want consistent addresses) and the same salt is used, the clone address collides, and **one attestor signature validates the Monerium link on both chains**. An attestation minted to link the mainnet forwarder would also validate a link of the identical Gnosis-side address (possibly to a different profile).

**Status:** the fork test pins mainnet only; whether multichain deployment is intended is **unverified-hypothesis**. If it ever is, this rises to P1. It is cheap to close now.

**Fix:** `bound = keccak256(abi.encodePacked(block.chainid, address(this), hash))` and mirror it in the off-chain attestor signer.

---

## F3 (P2) — Oracle staleness omits round-completeness

`_minOut` (`:337-339`) checks `answer <= 0` (handles negative and zero — good) and `updatedAt` age, but not `answeredInRound >= roundId` nor `roundId != 0`. On a Chainlink feed that carries a stale answer forward in a stuck round, `updatedAt` can still look fresh. `minOut` is the sole on-chain price protection, so a wrong-but-recent round weakens it within the `SLIPPAGE_BPS` band. Defense-in-depth.

**Fix:** read `roundId`/`answeredInRound` from `latestRoundData` and require `answeredInRound >= roundId` and `roundId != 0`.

---

## F4 (P2) — Permissionless swap path is MEV-exposed

The keeper is planned to submit `swapAndForward` via private orderflow (plan §3). The permissionless branch (`:286-290`, anyone after `TRIGGER_DELAY`) is not, and executes with `amountOutMinimum = minOut` = worst allowed (1%). A searcher can call it in the public mempool and sandwich to the `SLIPPAGE_BPS` floor. A rando can also `poke()` immediately after any deposit to start the 24h clock (arming is intended/permissionless), then extract ≤1% once the keeper is ≥24h down. Within the documented "worst case within slippage bound," but it is a per-swap value leak specific to the fallback path and should be documented (and bounded by keeping `SLIPPAGE_BPS` tight / keeper promptness).

**PoC confirmed:** a `rando` call after `TRIGGER_DELAY` with the router paying exactly `minOut` forwards the worst-allowed amount to `destination`.

---

## F5 (P2) — Spec/code encoding drift + raw-digest signing

Variant §3.3 pseudocode: `keccak256(abi.encode(address(this), LINK_HASH))`. Code (`:254`): `abi.encodePacked`. Packed encoding of `(address, bytes32)` is unambiguous (both fixed-length), so this is **safe**, but the two documents disagree, and the off-chain attestor MUST match the code exactly. Additionally, the contract `ecrecover`s over `bound` directly — the attestor signs the **raw 32-byte digest**, not an EIP-191 `personal_sign` of it (the test uses `vm.sign(pk, bound)` accordingly). A signer that uses `personal_sign` will produce non-validating links.

**Fix:** reconcile the spec to `abi.encodePacked`, and document "attestor signs the raw `bound` digest (no EIP-191 prefix)".

---

## F6 (P2) — `strandedSince` reset discards `perSwapCap` remainder

`swapAndForward` unconditionally sets `strandedSince = 0` on success (`:328`). When `amountIn` is capped by `perSwapCap` and a remainder ≥ `minSwapAmount` stays, the marker is nonetheless cleared. The leftover then needs a fresh `poke()` + a full `TRIGGER_DELAY` before the permissionless path can move the next chunk, so a balance above the cap drains one cap-chunk per (poke + 24h) cycle if the keeper is absent. Liveness slowness, not a loss.

**Fix (optional):** after the swap, if the remaining EURe balance ≥ `minSwapAmount`, leave `strandedSince` untouched (or reset to `block.timestamp`) so the remainder stays enrolled in the permissionless schedule.

---

## F7 (P2) — `RECOVERY_HASH` non-custody constraint (registry T1 guardrail)

`RECOVERY_HASH` is `bytes32(0)` (disabled) in all current configs, so **no live issue**. But the whole non-custody argument for a whitelisted hash depends on the message being **fixed/parameterless** — the same reason the link hash is safe and a redeem order is not. If T1 reveals that Monerium's recovery message contains variable fields (amount, IBAN, bank account), a single compile-time `RECOVERY_HASH` is either useless (hash varies per recovery) or unsafe if broadened to a scheme-match. This is not a finding against current code; it is a **hard constraint on resolving T1**: only enable `RECOVERY_HASH` if the recovery message is parameterless, otherwise the constrained-1271 safety property does not carry over. Worth stating explicitly in the registry T1 row.

---

## F8 (P2) — EURe transfer-restriction assumption undocumented/untested

EURe is a regulated e-money token with a compliance controller that can restrict transfers. The design handles the USDC (Circle) blacklist (atomic revert keeps funds as EURe). It does **not** document the case where the forwarder's *own* address (or `fallbackAddress`) is EURe-frozen: then `sweepStrandedEure` (`:353`) and client `sweep` (`:382`) both revert `TransferFailed` and funds are genuinely stuck. The mocks model no EURe transfer restriction, so this is neither documented nor tested. Out of contract scope to fix, but the "EURe always transferable for the forwarder/fallback" assumption should be stated (and covered in ops/terms).

---

## F9 / F10 (P2 nits)

- **F9:** `_setMinSwapAmount` (`Factory.sol:121`) — `value < MIN_SWAP_FLOOR || value > perSwapCap && perSwapCap != 0` is correct only because `&&` binds tighter than `||` (and the construction ordering sets cap after min while cap==0). Add parentheses: `value < MIN_SWAP_FLOOR || (perSwapCap != 0 && value > perSwapCap)`.
- **F10:** Invariant §2.3.3 wording says "at most the two whitelisted hashes"; the code accepts up to three constants (`LINK_HASH_191`, `LINK_HASH_RAW`, `RECOVERY_HASH`) = two *messages*, three *hashes*. Align the wording.

---

## Spec-vs-code invariant check (plan §2.3 + §5)

| Invariant / disposition | Status |
|---|---|
| §2.3.1 assets leave only via enumerated paths | **Holds.** Exit points: router pull (approved `amountIn`, `Overspend`-checked, reset to 0), USDC fee→`FEE_RECIPIENT` (≤`feeBps`, on swap delta only), USDC→`destination`, EURe→`fallbackAddress` (delayed), fallback `sweep`. Nothing else. |
| §2.3.2 no delegatecall/selfdestruct, CALL-only, value==0, reentrancy-guarded, safe-ERC20 | **Holds.** `nonReentrant` on all fund-movers; low-level calls carry no value; safe-transfer return-data handling present. |
| §2.3.3 1271 validates only whitelisted hashes, none authorize Vortex asset movement | **Holds** (wording nit F10). Redeem orders cannot validate. |
| §2.3.4 guardian delay-only, fallback client-only, non-upgradeable | **Mostly holds; F1 breaches the spirit** — guardian gains an unbounded freeze over permissionless recovery. Deploy-time `destination` trust is the documented S0 residual (guardian sets `destination` at `deployForwarder`; only fallback can change it after — contract correctly blocks post-deploy guardian changes). |
| §2.3.5 `strandedSince` not manipulable to skip/extend delays | **Breached — see F1.** Guardian can reset via a synthetic "balance drop." |
| R03 strandedSince marker | Implemented; F1 caveat. |
| R05 pause protective-only, never traps fallback | Holds — `sweep`/`sweepStrandedEure`/`setDestination` ungated by pause; invariant test covers fallback-sweep-while-paused. |
| R09 unsolicited tokens | Holds — fallback `sweep(token,to)`; unsolicited USDC forwarded to `destination` (fee applied to swap delta only, not to unsolicited USDC — correct). |

**Factory/clone lifecycle:** `deployForwarder` clones + initializes atomically and is `onlyGuardian` (no initialize front-run — verified). `initialize` is `msg.sender == FACTORY` gated and one-shot; implementation self-bricks in its constructor (test-covered). CREATE2 address cannot be squatted by third parties (deployer = factory). `predictAddress` matches deployment (test-covered). Two-step guardian transfer is sound; `transferGuardian(0)` just cancels a pending transfer. Clones read `FACTORY.guardian()` dynamically, so a transfer re-points every clone with no per-clone migration. `implementation` is immutable (no swap). All good.

## Test gaps (item 6)

Named, missing tests (each maps to a finding or an untested branch):

1. **Guardian raises `minSwapAmount` mid-stranding** — the exact F1 gap; no test toggles the threshold against an armed marker.
2. **Cross-chain replay** — untestable until a chainid is in the bound (F2); add once fixed.
3. **Oracle negative/zero answer** — `InvalidPrice` (`:338`) is never triggered; tests only exercise the stale (`updatedAt`) path.
4. **`RECOVERY_HASH` enabled branch** — every config uses `recoveryHash: bytes32(0)`, so the `isRecovery` path (`:237`) and its "recovery hash only, nothing else" property are entirely untested.
5. **Signature malleability / v** — the high-s check (`:251`) and `v ∉ {27,28}` (`:252`) rejections are untested; only wrong-signer and foreign-hash are covered.
6. **`signature.length != 65`** rejection (`:239`) untested.
7. **`guardianPaused` does NOT block `sweepStrandedEure`** — the "recovery during incident" property is asserted only for the fallback `sweep`, not the permissionless dead-man path.
8. **EURe transfer reverts** (compliance freeze) on the sweep/exit paths (F8) — mocks never fail a transfer.
9. **Fee rounding to zero** for dust swaps (`fee = usdcReceived*feeBps/BPS` floors to 0).
10. **`setFallbackAddress`** authority/gating (only `setDestination` is covered for fallback authority).
11. **Perpetual-remainder liveness** (F6): balance > `perSwapCap`, keeper absent — assert how many (poke + `TRIGGER_DELAY`) cycles are needed.

## Notes that are NOT findings

- Deploy-time `destination` correctness is the documented S0 provisioning trust (variant §4, plan R01); the contract cannot verify it and relies on the off-chain manifest + client confirmation. Correctly restricted post-deploy.
- Reentrancy: EURe/USDC are not ERC-777; all fund-movers are `nonReentrant`; a hooked token could reenter only ungated no-op functions (`poke`) with no harmful effect. The router-reentrancy guard is test-covered.
- Registry placeholders (fees, timings, T1–T5) are known-open and not reported as findings.

---

## Author dispositions (2026-07-17)

| Finding | Disposition | Resolution |
|---|---|---|
| F1 (P1) guardian disarms dead-man via minSwapAmount raise | **Fixed** (commit eff320f68) | `poke()` arms/clears against immutable `MIN_SWAP_FLOOR`; regression test added |
| P2: no chainid in EIP-1271 binding | **Fixed** | Binding is now `keccak256(chainid ‖ address(this) ‖ hash)`; cross-chain replay test added; backend attestor updated; **re-validated against Monerium sandbox (201, linked)** |
| P2: two accepted link-hash variants | **Fixed** | Narrowed to `LINK_HASH_191` only — G0 sandbox confirmed Monerium presents EIP-191; raw-variant rejection tested |
| P2: strandedSince reset discards perSwapCap remainder | **Fixed** | Swap re-arms the marker when post-swap balance ≥ floor; test added |
| P2: oracle round-completeness (answeredInRound) | **Rejected** | `answeredInRound` is deprecated by Chainlink for OCR feeds; `answer > 0` + `updatedAt` staleness ceiling is the current recommended validation. Zero/negative-answer test added |
| P2: permissionless swap path MEV-exposed | **Accepted-documented** | Bounded by oracle `minOut` by design; the permissionless path is a liveness fallback, not the normal path. Noted in security spec |
| P2: spec/code drift on attestation digest encoding | **Fixed** | Variant doc §3.3 sketch aligned with code (encodePacked, chainid, single hash) |
| P2: RECOVERY_HASH non-custody depends on parameterless recovery message | **Accepted** | Requirement added to registry T1: enable only if Monerium's recovery message is parameterless (or parameters are payout-neutral); else keep disabled |
| P2: EURe compliance-freeze behavior unmodeled | **Accepted-documented** | Added to variant doc failure notes: issuer freeze ⇒ nothing moves until resolved; inherent to e-money tokens |
| Test gaps (11 named) | **Closed (9) / N/A (2)** | Added: threshold-raise regression, RECOVERY_HASH-enabled branch, oracle answer≤0, 1271 malleability + length + bad-v, cross-chain replay, raw-variant rejection, cap-remainder re-arm. N/A: EURe-transfer-restriction assumption (documented instead), fee-rounding edge (covered by existing pro-rata unit tests backend-side) |
