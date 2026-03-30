# Security Audit Report — `TokenRelayer.sol`

**Date:** 2026-03-04  
**Auditor:** AI Security Review  
**Contract:** `TokenRelayer.sol` (175 lines, Solidity ^0.8.20)  
**Scope:** Full contract review including signature verification, token handling, access control, and reentrancy vectors.

---

## Summary

The `TokenRelayer` contract acts as a meta-transaction relayer. It accepts an ERC-20 `permit` signature and a custom EIP-712 "Payload" signature, then:
1. Calls `permit()` to set a token allowance from `owner → relayer`
2. Calls `transferFrom()` to pull tokens into the relayer
3. Forwards an arbitrary `call` to a fixed `destinationContract`

The contract has **several findings** ranging from critical to informational severity.

| Severity | Count |
|---|---|
| 🔴 Critical | 2 |
| 🟠 High | 2 |
| 🟡 Medium | 3 |
| 🔵 Low | 2 |
| ⚪ Informational | 3 |

---

## 🔴 Critical Findings

### C-1: Reentrancy in `execute()` — State Changes After External Calls

**Location:** Lines 62–97 (`execute` function)

**Description:**  
The function performs external calls (`permit`, `transferFrom`, `approve`, and the forwarded `destinationContract.call`) **before** marking the execution as completed on line 93:

```solidity
executedCalls[keccak256(abi.encodePacked(owner, nonce))] = true; // line 93
```

While the nonce is marked as used on line 69 (before external calls), the `executedCalls` mapping is updated after all external calls. More critically, the `_forwardCall` on line 89 makes a low-level `.call()` to an external contract with arbitrary `data`, which can trigger a reentrant call back into the relayer.

**Impact:** If the `destinationContract` is malicious or compromised, it could reenter `execute()` with different parameters. The nonce check mitigates replay of the *same* nonce, but reentrancy could interact with other state in unexpected ways (e.g., draining residual token balances held by the contract).

**Recommendation:**  
- Add OpenZeppelin's `ReentrancyGuard` and apply the `nonReentrant` modifier to `execute()`.
- Move all state changes before external calls (Checks-Effects-Interactions pattern).

```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TokenRelayer is ReentrancyGuard {
    function execute(ExecuteParams calldata params) external payable nonReentrant returns (bool) {
        // ... nonce + signature checks ...
        
        // Effects BEFORE interactions
        executedCalls[keccak256(abi.encodePacked(owner, nonce))] = true;
        
        // Interactions
        _executePermitAndSelfTransfer(...);
        bool callSuccess = _forwardCall(params.payloadData, msg.value);
        // ...
    }
}
```

---

### C-2: Signature Malleability — Missing `s` Value Validation in `ecrecover`

**Location:** Lines 123–127 (`_recoverSigner`)

**Description:**  
The `ecrecover` precompile is susceptible to **signature malleability**. For any valid signature `(v, r, s)`, there exists a second valid signature `(v', r, s')` where `s' = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141 - s`. The contract does not validate that `s` is in the lower half of the curve order.

An attacker who observes a valid signature in the mempool can compute the malleable counterpart. Although the nonce prevents **replay** of the exact same parameters, the malleable signature could be used in a front-running scenario — an attacker submits the transaction with the alternate signature before the legitimate relayer, potentially causing the relayer's transaction to revert (griefing).

**Impact:** Signature griefing / front-running. The relayer's legitimate transaction can be front-run and replaced by an attacker using the malleable signature.

**Recommendation:**  
Use OpenZeppelin's `ECDSA.recover()` which enforces `s` to be in the lower half of the secp256k1 curve:

```solidity
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

function _recoverSigner(bytes32 digest, uint8 v, bytes32 r, bytes32 s) private pure returns (address) {
    return ECDSA.recover(digest, v, r, s);
}
```

---

## 🟠 High Findings

### H-1: Unlimited Token Approval to `destinationContract`

**Location:** Lines 148–152 (`_executePermitAndSelfTransfer`)

```solidity
if (!tokenApproved[token]) {
    IERC20(token).approve(destinationContract, type(uint256).max);
    tokenApproved[token] = true;
}
```

**Description:**  
The relayer approves `type(uint256).max` tokens to the `destinationContract` the first time any token is used. This is a **permanent, unlimited approval**. If the `destinationContract` is upgradeable (proxy pattern), compromised, or has any vulnerability, it can drain **all tokens of every approved type** held by the relayer at any point in the future.

**Impact:** Total loss of all tokens held by the relayer contract if `destinationContract` is ever compromised.

**Recommendation:**  
Approve only the exact amount needed per transaction instead of `type(uint256).max`:

```solidity
IERC20(token).approve(destinationContract, 0); // reset first (for tokens like USDT)
IERC20(token).approve(destinationContract, value);
```

Or revoke the approval after the forwarded call completes:

```solidity
IERC20(token).approve(destinationContract, value);
_forwardCall(params.payloadData, msg.value);
IERC20(token).approve(destinationContract, 0); // revoke
```

---

### H-2: Arbitrary Call Execution — No Payload Data Validation

**Location:** Lines 156–158 (`_forwardCall`)

```solidity
function _forwardCall(bytes memory data, uint256 value) internal returns (bool) {
    (bool success, ) = destinationContract.call{value: value}(data);
    return success;
}
```

**Description:**  
The forwarded call sends **arbitrary calldata** to the `destinationContract`. The only constraint is that the `owner` signed the payload, but there is no validation of *what* the payload does. The signed payload includes `destination` in the EIP-712 struct, but **this `destination` field is never checked against `destinationContract`** — it is only hashed into the digest for signature verification.

This means:
- The user signs a payload specifying `destination: 0xABC`, but the contract always forwards to the immutable `destinationContract`, regardless of what was signed.
- If the user believes their signed payload targets a specific contract but the relayer's `destinationContract` is different, the signed data would be executed on an unintended target.

**Impact:** User intent mismatch. The signed `destination` field provides no actual routing guarantee. Users may be misled about which contract will execute their data.

**Recommendation:**  
Either:
1. Verify that the signed `destination` matches `destinationContract`:
```solidity
// In _computeDigest or execute:
require(signedDestination == destinationContract, "Destination mismatch");
```
2. Or remove `destination` from the signed payload struct if it's always `destinationContract`.

---

## 🟡 Medium Findings

### M-1: No `receive()` or `fallback()` — ETH Can Be Trapped

**Location:** Contract-wide

**Description:**  
The `execute()` function is `payable` and forwards `msg.value` via `_forwardCall`. However, if the forwarded call returns **less ETH than was sent** (partial refund) or if ETH is sent to the contract by any other means, there is **no mechanism to recover native ETH**. The contract has no `receive()` function, no `fallback()`, and the `withdrawToken()` function only handles ERC-20 tokens.

**Impact:** Native ETH sent to or trapped in the contract is permanently lost.

**Recommendation:**  
Add an ETH withdrawal function for the deployer:

```solidity
function withdrawETH(uint256 amount) external {
    require(msg.sender == deployer, "Only deployer");
    (bool success, ) = deployer.call{value: amount}("");
    require(success, "ETH transfer failed");
}

receive() external payable {}
```

---

### M-2: `permit()` Front-Running / DoS Vector

**Location:** Line 143 (`_executePermitAndSelfTransfer`)

```solidity
IERC20Permit(token).permit(owner, address(this), value, deadline, v, r, s);
```

**Description:**  
The `permit()` call can be front-run. An attacker who sees the transaction in the mempool can extract the permit signature and call `permit()` directly on the token contract before the relayer's transaction executes. When the relayer's `execute()` then calls `permit()`, it will **revert** because the nonce has already been consumed.

This is a known issue with ERC-2612 permit. The actual allowance is still set correctly (the front-runner sets it), but the relayer's transaction reverts, causing a DoS.

**Impact:** Griefing / DoS — legitimate relayer transactions can be blocked.

**Recommendation:**  
Wrap the `permit()` call in a try-catch so that if it reverts (because someone front-ran it), the function can still proceed if the allowance is already sufficient:

```solidity
try IERC20Permit(token).permit(owner, address(this), value, deadline, v, r, s) {
    // permit succeeded
} catch {
    // permit was front-run, check allowance is sufficient
    require(
        IERC20(token).allowance(owner, address(this)) >= value,
        "Permit failed and insufficient allowance"
    );
}
```

---

### M-3: Missing `payloadValue` in Test ABI — Potential Integration Bug

**Location:** Test file `relayer-execution.ts`, line 73–101

**Description:**  
The test ABI for `tokenRelayerAbi` is **missing the `payloadValue` field** in the `ExecuteParams` struct. The actual contract expects a `payloadValue` field (line 42 in the contract), but the test ABI omits it. This means the test is constructing transactions with an incorrect ABI, which would either fail at runtime or encode data incorrectly.

**Impact:** Tests may not accurately validate the contract's behavior, masking bugs.

**Recommendation:**  
Update the test ABI to include `{ name: "payloadValue", type: "uint256" }` in the struct components, between `payloadData` and `payloadNonce`.

---

## 🔵 Low Findings

### L-1: Redundant `executedCalls` Mapping

**Location:** Lines 30 and 93

**Description:**  
The `executedCalls` mapping tracks `keccak256(owner, nonce) → bool`, but the `usedPayloadNonces` mapping on line 29 already tracks `owner → nonce → bool` and is checked first (line 67). Both store essentially the same information — whether a given `(owner, nonce)` pair has been used.

**Impact:** Unnecessary gas cost (~20,000 gas for SSTORE) on every `execute()` call. No security impact, but adds code complexity and gas overhead.

**Recommendation:**  
Remove `executedCalls` and use `usedPayloadNonces` for the `isExecutionCompleted` query:

```solidity
function isExecutionCompleted(address signer, uint256 nonce) external view returns (bool) {
    return usedPayloadNonces[signer][nonce];
}
```

---

### L-2: No Event for `withdrawToken`

**Location:** Lines 166–169

**Description:**  
The `withdrawToken()` function transfers tokens to the deployer but emits no event. This makes it harder to monitor and audit token movements from the contract.

**Recommendation:**  
Add an event:

```solidity
event TokenWithdrawn(address indexed token, uint256 amount, address indexed to);

function withdrawToken(address token, uint256 amount) external {
    require(msg.sender == deployer, "Only deployer");
    require(IERC20(token).transfer(deployer, amount), "Transfer failed");
    emit TokenWithdrawn(token, amount, deployer);
}
```

---

## ⚪ Informational Findings

### I-1: No Access Control Library Used

The contract rolls its own deployer-based access control (`deployer` + manual `require` checks) instead of using OpenZeppelin's `Ownable` or `AccessControl`. While functionally correct for a single-admin pattern, using a battle-tested library reduces risk of mistakes and provides standard interfaces (e.g., ownership transfer).

---

### I-2: `execute()` Returns Redundant Value

The `execute()` function returns `callSuccess` (line 96), but line 90 already `require(callSuccess, ...)`. If the call fails, the function reverts, so it can only ever return `true`. The return value is misleading.

**Recommendation:** Either remove the return value or remove the require and let callers handle failures.

---

### I-3: Consider Using EIP-712 Helpers from OpenZeppelin

The contract manually constructs the EIP-712 domain separator and digest. OpenZeppelin provides `EIP712` abstract contract that handles domain separator caching, chain ID changes on forks, and proper hashing — reducing the surface area for bugs.

```solidity
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract TokenRelayer is EIP712 {
    constructor(address _dest) EIP712("TokenRelayer", "1") {
        // ...
    }
}
```

---

## Recommendations Summary

| # | Finding | Severity | Fix Effort |
|---|---|---|---|
| C-1 | Add `ReentrancyGuard` + CEI pattern | 🔴 Critical | Low |
| C-2 | Use OZ `ECDSA.recover()` for malleability protection | 🔴 Critical | Low |
| H-1 | Replace `type(uint256).max` approval with exact amounts | 🟠 High | Low |
| H-2 | Validate signed `destination` matches `destinationContract` | 🟠 High | Low |
| M-1 | Add ETH recovery mechanism | 🟡 Medium | Low |
| M-2 | Wrap `permit()` in try-catch for front-run resilience | 🟡 Medium | Low |
| M-3 | Fix test ABI to include `payloadValue` | 🟡 Medium | Low |
| L-1 | Remove redundant `executedCalls` mapping | 🔵 Low | Low |
| L-2 | Add event to `withdrawToken` | 🔵 Low | Low |
| I-1 | Use OpenZeppelin `Ownable` | ⚪ Info | Low |
| I-2 | Remove redundant return from `execute()` | ⚪ Info | Low |
| I-3 | Use OpenZeppelin `EIP712` helper | ⚪ Info | Medium |

---

> [!CAUTION]
> **C-1 (Reentrancy)** and **C-2 (Signature Malleability)** should be addressed before any mainnet deployment. Both have low fix effort and high impact.

> [!WARNING]
> **H-1 (Unlimited Approval)** is particularly dangerous if `destinationContract` is upgradeable or could be compromised in the future.
