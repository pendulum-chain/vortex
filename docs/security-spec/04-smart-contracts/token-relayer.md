# TokenRelayer Smart Contract

## What This Does

`TokenRelayer.sol` (Solidity ^0.8.20, ~175 lines) is a meta-transaction relayer deployed on EVM chains (Moonbeam/Polygon). It enables gasless ERC-20 token operations by combining ERC-2612 `permit` with EIP-712 signed payloads:

1. User signs an ERC-2612 `permit` (off-chain) granting the relayer an allowance
2. User signs an EIP-712 "Payload" authorizing the relayer to execute a specific action
3. A relayer (executor) submits both signatures on-chain, paying gas
4. The contract calls `permit()`, `transferFrom()` (pulling tokens into the relayer), `approve()` (to destination), and forwards an arbitrary call to a fixed `destinationContract`

The contract uses:
- **Nonce tracking**: `usedPayloadNonces[owner][nonce]` prevents replay
- **Execution tracking**: `executedCalls[keccak256(owner, nonce)]` marks completed executions
- **Token approval caching**: `tokenApproved[token]` → first use grants `type(uint256).max` approval to `destinationContract`
- **Deployer-only access**: `withdrawToken()` restricted to the deployer address

### Prior Security Reviews

Two independent security reviews have been conducted:
- `docs/token-relayer-security-review-2026-03-04.md` (first review)
- `contracts/relayer/SECURITY_AUDIT.md` (second review, more detailed)

Both found overlapping but not identical issues. All findings from both reviews are incorporated below.

> **Note (verified 2026-04-02):** All findings from both reviews have been **fixed** in the current contract (`TokenRelayer.sol`, pragma ^0.8.28). The contract now uses OpenZeppelin `Ownable`, `ReentrancyGuard`, `EIP712`, `ECDSA`, and `SafeERC20`. The status column below reflects the verified current state. The audit checklist items remain as verification steps to confirm fixes are complete and correct.

## Security Invariants

1. **Each (owner, nonce) pair MUST be usable exactly once** — `usedPayloadNonces[owner][nonce]` is set to `true` before any external call (line 69). Replay MUST be impossible.
2. **Signature verification MUST recover the correct signer** — The EIP-712 digest must be correctly constructed from the domain separator and struct hash. The recovered address must match the `owner` parameter.
3. **The `permit` and the payload MUST be independently verified** — The ERC-2612 permit is verified by the token contract. The EIP-712 payload is verified by the relayer's `_recoverSigner`. Both must succeed.
4. **Only the deployer MAY withdraw tokens** — `withdrawToken()` uses `require(msg.sender == deployer)`.
5. **The forwarded call MUST target the immutable `destinationContract`** — The relayer always calls the same destination, set at construction time.
6. **Token transfers MUST match the signed amounts** — `transferFrom` pulls exactly `value` tokens from the owner into the relayer. The same `value` is available for the forwarded call.

## Threat Vectors & Mitigations

These incorporate all findings from both prior security reviews:

| ID | Severity | Threat | Status |
|---|---|---|---|
| **C-1** | 🔴 Critical | **Reentrancy in `execute()`** — `executedCalls` is set AFTER all external calls (permit, transferFrom, approve, destinationContract.call). If `destinationContract` is malicious, it can reenter. Nonce prevents same-nonce replay but not cross-state reentrancy. | ✅ **Fixed** — `ReentrancyGuard` added (`nonReentrant` on `execute()`), CEI pattern followed (`usedPayloadNonces` set before external calls at line 106), `executedCalls` mapping removed. |
| **C-2** | 🔴 Critical | **Signature malleability** — `ecrecover` in `_recoverSigner` doesn't validate that `s` is in the lower half of the secp256k1 curve. Malleable signatures enable front-running/griefing. | ✅ **Fixed** — Uses `ECDSA.recover()` from OpenZeppelin (line 100), which enforces low-s and rejects `address(0)`. |
| **H-1** | 🟠 High | **Unlimited token approval** — First use of any token grants `type(uint256).max` approval to `destinationContract`. If destination is upgradeable/compromised, all token types held by relayer can be drained. | ✅ **Fixed** — Exact approval via `forceApprove(destinationContract, params.value)` before call (line 121), then revoked to 0 after call (line 127). |
| **H-2** | 🟠 High | **Destination mismatch** — The signed `destination` field in the EIP-712 struct is never validated against the actual `destinationContract`. User may believe they're signing for a different contract. | ✅ **Fixed** — `_computeDigest` hardcodes `destinationContract` as the destination in the struct hash (line 145), so the signed destination is always the contract's immutable `destinationContract`. |
| **M-1** | 🟡 Medium | **No ETH recovery** — `execute()` is `payable` but no `receive()`/`fallback()` or ETH withdrawal exists. Trapped ETH is permanently lost. | ✅ **Fixed** — `receive() external payable` added (line 75), `withdrawETH()` function added (line 208) with `onlyOwner` and event. |
| **M-2** | 🟡 Medium | **Permit front-running** — Attacker extracts permit signature from mempool and calls `permit()` directly, causing the relayer's tx to revert. | ✅ **Fixed** — Permit wrapped in try-catch in `_executePermitAndTransfer()` (lines 172-180). Falls back to checking existing allowance. |
| **M-3** | 🟡 Medium | **Test ABI mismatch** — Test file missing `payloadValue` field in struct, potentially masking bugs. | ✅ **Fixed** — Both test files (`relayer-execution.ts`, `relayer-execution-squid.ts`) include `payloadValue` in their type definitions. |
| **L-1** | 🔵 Low | **Redundant `executedCalls` mapping** — Duplicates `usedPayloadNonces` information. Wastes ~20k gas per execution. | ✅ **Fixed** — `executedCalls` removed. `isExecutionCompleted()` now queries `usedPayloadNonces` (line 215-216). |
| **L-2** | 🔵 Low | **No event for `withdrawToken`** — Token withdrawals are not logged on-chain, making auditing harder. | ✅ **Fixed** — `TokenWithdrawn` event added (line 62), emitted in `withdrawToken()` (line 200). `ETHWithdrawn` event also added. |
| **I-1** | ⚪ Info | **No access control library** — Rolls own deployer check instead of using OZ `Ownable`. | ✅ **Fixed** — Uses OZ `Ownable` (line 4, 25). `onlyOwner` modifier on withdrawal functions. |
| **I-2** | ⚪ Info | **Redundant return from `execute()`** — Always returns `true` because failures revert. | ✅ **Fixed** — `execute()` now returns `void` (line 79). |
| **I-3** | ⚪ Info | **Manual EIP-712 construction** — Could use OZ `EIP712` helper for domain separator handling (chain ID changes on forks). | ✅ **Fixed** — Inherits OZ `EIP712` (line 10, 25), uses `_hashTypedDataV4()` (line 142). |

## Audit Checklist

### Critical (all fixed — verify correctness)

- [x] C-1: `execute()` has `nonReentrant` modifier AND follows CEI pattern — verified: `usedPayloadNonces` set at line 106 before any external call
- [x] C-2: Uses `ECDSA.recover()` from OpenZeppelin (line 100) — validates `s` value and rejects `address(0)`
- [x] Contract compiles successfully with all OpenZeppelin imports resolved (verify with `bun compile:contracts:relayer`). **PASS** — compilation verified.

### High (all fixed — verify correctness)

- [x] H-1: Exact approval via `forceApprove(destinationContract, params.value)` (line 121), revoked to 0 after call (line 127)
- [x] H-2: `_computeDigest` hardcodes `destinationContract` as destination in struct hash (line 145) — signed destination always matches

### Medium (all fixed — verify correctness)

- [x] M-1: `receive() external payable` (line 75) + `withdrawETH()` (line 208) with `onlyOwner`
- [x] M-2: Permit wrapped in try-catch in `_executePermitAndTransfer()` (lines 172-180), falls back to allowance check
- [x] M-3: Both test files include `payloadValue` in type definitions

### Low/Info (all fixed)

- [x] L-1: `executedCalls` mapping removed; `isExecutionCompleted()` uses `usedPayloadNonces`
- [x] L-2: `TokenWithdrawn` event (line 62) emitted in `withdrawToken()` (line 200); `ETHWithdrawn` also added
- [x] I-1: Uses OZ `Ownable` (line 4, 25) with `onlyOwner` modifier
- [x] I-3: Inherits OZ `EIP712` (line 10, 25), uses `_hashTypedDataV4()` for domain separator

### General

- [PARTIAL] All OpenZeppelin dependencies are pinned to specific versions (not floating). **PARTIAL** — uses caret range `^5.2.0` instead of exact pin; allows minor/patch updates which could introduce changes.
- [x] Contract constructor verifies `destinationContract` is not the zero address (line 70)
- [x] Owner set via `Ownable(msg.sender)` in constructor (line 67)
- [x] Nonce check (`usedPayloadNonces`) happens before any external call (line 86)
- [x] No `selfdestruct` or `delegatecall` to untrusted addresses. **PASS** — verified: neither pattern present in contract source.
- [N/A] Verify deployed contract bytecode matches source (if already on mainnet). **N/A** — requires on-chain verification, not a source code audit item.
