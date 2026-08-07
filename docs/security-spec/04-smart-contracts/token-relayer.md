# TokenRelayer Smart Contract

## What This Does

`TokenRelayer.sol` (Solidity ^0.8.28) is a meta-transaction relayer deployed on EVM chains. It enables gasless ERC-20 token operations by combining ERC-2612 `permit` with EIP-712 signed payloads:

1. User signs an ERC-2612 `permit` (off-chain) granting the relayer an allowance
2. User signs an EIP-712 "Payload" authorizing the relayer to execute a specific action
3. A relayer (executor) submits both signatures on-chain, paying gas
4. The contract calls `permit()`, `transferFrom()` (pulling tokens into the relayer), `approve()` (to destination), and forwards an arbitrary call to a fixed `destinationContract`

The contract uses:

- **Nonce tracking**: `usedPayloadNonces[owner][nonce]` prevents replay.
- **Execution-local token accounting**: pre-transfer, post-transfer, and post-destination balances prove that the signed amount was received and fully consumed without touching a pre-existing balance.
- **Exact transient approval**: the destination receives an allowance no larger than the measured receipt, and the allowance is revoked after the call.
- **Current-owner recovery**: OpenZeppelin `Ownable` restricts token/ETH recovery to the current, transferable owner rather than permanently to the deployer.
- **Executor refund accounting**: native currency returned by the destination is returned in the same transaction to `msg.sender`, which supplied `msg.value`.

### Prior Security Reviews

The point-in-time review reports were consolidated into this specification because their
unresolved findings described an older contract version. Their findings remain in Git history;
all lasting threats, fixes, and deployment caveats are incorporated below.

> **Status note:** The findings from the two 2026-04-02 reviews were fixed in the then-current deployment. The post-#1232 review added execution-local token/native balance accounting and a codeless-destination guard to the source. Those later changes require new deployments and address-registry updates on every supported chain; source conformance MUST NOT be described as production remediation until that rollout is verified (RISK-007).

## Security Invariants

1. **Each (owner, nonce) pair MUST be usable exactly once** — `usedPayloadNonces[owner][nonce]` is set to `true` before any external call. Replay MUST be impossible.
2. **Signature verification MUST recover the correct signer** — The EIP-712 digest must be correctly constructed from the domain separator and struct hash. The recovered address must match the `owner` parameter.
3. **Token spending authority and payload authority MUST be independently verified** — The token contract verifies the ERC-2612 permit; if that permit was already consumed, a sufficient existing allowance is required. Separately, the relayer computes the EIP-712 payload digest and requires `ECDSA.recover(...) == owner`.
4. **Only the current owner MAY withdraw tokens or native currency** — `withdrawToken()` and `withdrawETH()` use OpenZeppelin `onlyOwner`. Ownership is transferable; the deployer is only the initial owner.
5. **The forwarded call MUST target the immutable `destinationContract`** — The relayer always calls the same destination, set at construction time.
6. **A successful execution MUST be isolated from every other token balance** — The relayer measures its token balance around `safeTransferFrom` and requires the receipt to equal signed `value`. It approves only the measured receipt. After the destination call and allowance revocation, the balance MUST equal its pre-execution baseline. A fee-on-transfer/rebasing receipt mismatch or partial destination consumption therefore reverts the whole transaction, including nonce use and token movement.
7. **The signed payload authorizes exact arbitrary calldata to the immutable destination** — The EIP-712 digest binds `keccak256(payloadData)`, token, value, ETH value, owner, nonce, deadline, relayer address, chain ID, and immutable destination address. The relayer does not interpret or allowlist destination selectors. Users and transaction construction MUST treat the payload as authorization for those exact bytes, not as proof of a higher-level business outcome beyond the enforced token-balance postcondition.
8. **Token shortfalls MUST NOT be automatically subsidized without a separate bounded design** — Current behavior is fail-closed through `TokenReceiptMismatch`. Any future platform-funded top-up requires a separately accounted funding source, a signed or normative policy, and an immutable per-call cap; it MUST NOT draw from unrelated relayer balances.
9. **Destination refunds MUST return to the executor** — The execution snapshots native balance excluding `msg.value` and sends any post-call excess to `msg.sender`. A failed refund reverts the entire execution.

## Threat Vectors & Mitigations

These incorporate all findings from both prior security reviews:

| ID | Severity | Threat | Status |
|---|---|---|---|
| **C-1** | 🔴 Critical | **Reentrancy in `execute()`** — `executedCalls` is set AFTER all external calls (permit, transferFrom, approve, destinationContract.call). If `destinationContract` is malicious, it can reenter. Nonce prevents same-nonce replay but not cross-state reentrancy. | ✅ **Fixed** — `ReentrancyGuard` added (`nonReentrant` on `execute()`), CEI pattern followed (`usedPayloadNonces` set before external calls at line 106), `executedCalls` mapping removed. |
| **C-2** | 🔴 Critical | **Signature malleability** — `ecrecover` in `_recoverSigner` doesn't validate that `s` is in the lower half of the secp256k1 curve. Malleable signatures enable front-running/griefing. | ✅ **Fixed** — Uses `ECDSA.recover()` from OpenZeppelin (line 100), which enforces low-s and rejects `address(0)`. |
| **H-1** | 🟠 High | **Unlimited token approval** — First use of any token grants `type(uint256).max` approval to `destinationContract`. If destination is upgradeable/compromised, all token types held by relayer can be drained. | ✅ **Fixed** — Exact approval uses the measured `received` amount before the call, then is revoked to zero. |
| **H-2** | 🟠 High | **Destination mismatch** — The signed `destination` field in the EIP-712 struct is never validated against the actual `destinationContract`. User may believe they're signing for a different contract. | ✅ **Fixed** — `_computeDigest` hardcodes `destinationContract` as the destination in the struct hash, so the signed destination is always the contract's immutable `destinationContract`. |
| **H-3** | 🟠 High | **Nominal amount can consume a pre-existing relayer balance** — A fee-on-transfer token can credit less than signed `value` while the destination receives an allowance for the nominal amount. | ✅ **Fixed in source; deployment pending** — `execute` measures actual receipt, requires `received == value`, approves only `received`, and requires the post-call balance to return exactly to its pre-execution baseline. No automatic subsidy is performed. |
| **H-4** | 🟠 High | **Successful partial consumption strands signer funds** — EVM-level destination success previously consumed the nonce even if the destination used only part of the execution's token contribution. | ✅ **Fixed in source; deployment pending** — the post-call token-balance equality check makes partial consumption revert atomically. Successful executions log requested, received, and consumed amounts. |
| **M-1** | 🟡 Medium | **No ETH recovery or execution attribution** — `execute()` is payable and the destination can return unused native currency. | ✅ **Fixed in source; deployment pending** — `receive()` accepts destination refunds, execution returns its native balance delta to the executor that supplied `msg.value`, and only unrelated/pre-existing native currency remains owner-recoverable. |
| **M-4** | 🟡 Medium | **Codeless immutable destination appears successful** — A low-level call to an EOA returns success while executing no payload and can strand all transferred tokens. | ✅ **Fixed in source; deployment pending** — construction rejects zero or codeless destinations; execution also refuses to forward if code is no longer present. |
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

### High

- [x] H-1: Exact approval uses the measured receipt and is revoked to zero after the call.
- [x] H-2: `_computeDigest` hardcodes `destinationContract` as destination in struct hash (line 145) — signed destination always matches
- [x] H-3/H-4: source measures token receipt and destination consumption against an execution-local balance baseline; fee-on-transfer shortfalls and residuals revert without consuming the nonce.
- [ ] Deploy the hardened bytecode on every supported chain, update the configured relayer-address registry, verify bytecode, and retire the previous deployments before treating H-3/H-4 as remediated in production.

### Medium

- [x] M-1: destination native refunds are returned to the executor; `receive()` plus owner withdrawal remains the recovery path for unrelated native transfers.
- [x] M-2: Permit wrapped in try-catch in `_executePermitAndTransfer()` (lines 172-180), falls back to allowance check
- [x] M-3: Both test files include `payloadValue` in type definitions

### Low/Info (all fixed)

- [x] L-1: `executedCalls` mapping removed; `isExecutionCompleted()` uses `usedPayloadNonces`
- [x] L-2: `TokenWithdrawn` event (line 62) emitted in `withdrawToken()` (line 200); `ETHWithdrawn` also added
- [x] I-1: Uses OZ `Ownable` (line 4, 25) with `onlyOwner` modifier
- [x] I-3: Inherits OZ `EIP712` (line 10, 25), uses `_hashTypedDataV4()` for domain separator

### General

- [x] OpenZeppelin contracts are pinned to exact version `5.6.1` in both the relayer package and lockfile. **PASS**
- [x] Contract constructor verifies `destinationContract` is neither zero nor codeless; forwarding also fails if code is no longer present.
- [x] Owner set via `Ownable(msg.sender)` in constructor and all recovery authority follows current `owner()`, including after ownership transfer.
- [x] Nonce check (`usedPayloadNonces`) happens before any external call (line 86)
- [x] No `selfdestruct` or `delegatecall` to untrusted addresses. **PASS** — verified: neither pattern present in contract source.
- [ ] Verify deployed contract bytecode matches source (if already on mainnet). **N/A** — requires on-chain verification, not a source code audit item.
