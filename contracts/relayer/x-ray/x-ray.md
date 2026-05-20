# X-Ray Report

> Vortex TokenRelayer | 138 nSLOC | 6d0c246ec (`create-spec-and-security-audit`) | Hardhat | 07/04/26

---

## 1. Protocol Overview

**What it does:** A meta-transaction relayer that accepts ERC-20 permit signatures and forwards arbitrary calls to a fixed destination contract.

- **Users**: Token holders who sign off-chain permit + payload signatures; a relayer bot submits the transaction on-chain
- **Core flow**: User signs permit (ERC-2612) + EIP-712 payload → relayer bot calls `execute()` → contract permits, transfers tokens in, approves destination, forwards call, revokes approval
- **Key mechanism**: EIP-712 signed payload authorization with nonce-based replay protection and permit-based gasless token approval
- **Token model**: Handles arbitrary ERC-20 tokens with ERC-2612 permit support; no protocol-native token
- **Admin model**: Single `Ownable` owner — can withdraw tokens and ETH; no timelock, no multisig, no governance

For a visual overview of the protocol's architecture, see the [architecture diagram](architecture.svg).

### Contracts in Scope

| Subsystem | Key Contracts | nSLOC | Role |
|-----------|--------------|------:|------|
| Relayer | TokenRelayer.sol | 138 | Accepts signed permits + payloads, relays token transfers and arbitrary calls to immutable destination |

### How It Fits Together

The core trick: Users never submit transactions themselves — they sign two off-chain messages (permit + payload), and a relayer bot submits them on-chain in a single atomic transaction.

### Execute Flow (Primary)

```
RelayerBot.execute(params)
├─ Checks: owner ≠ 0, token ≠ 0, nonce unused, deadline valid
├─ ECDSA.recover(EIP-712 digest) == owner
├─ Verify msg.value == payloadValue
├─ Effect: usedPayloadNonces[owner][nonce] = true
├─ _executePermitAndTransfer()
│   ├─ try: IERC20Permit.permit(owner → relayer)
│   │   └─ catch: require(allowance >= value)  ← *front-run resilience*
│   └─ IERC20.safeTransferFrom(owner → relayer)  ← *tokens pulled*
├─ IERC20.forceApprove(destination, value)  ← *exact approval*
├─ _forwardCall(data, msg.value) → destination.call{value}(data)  ← *arbitrary call*
└─ IERC20.forceApprove(destination, 0)  ← *revoke approval*
```

### Owner Withdrawal

```
Owner.withdrawToken(token, amount)
└─ IERC20.safeTransfer(owner, amount)  ← *recover stuck tokens*

Owner.withdrawETH(amount)
└─ owner.call{value: amount}("")  ← *recover stuck ETH*
```

---

## 2. Threat & Trust Model

### Protocol Threat Profile

> Protocol classified as: **Bridge/Relayer** with **Meta-transaction** characteristics

The contract functions as a relayer layer — accepting off-chain signed authorizations and forwarding token + call operations to a fixed destination. It shares bridge-like trust patterns (signature verification, relay mechanics, nonce tracking) combined with meta-transaction gasless execution via ERC-2612 permits.

### Actors & Adversary Model

| Actor | Trust Level | Capabilities |
|-------|-------------|-------------|
| Owner | Trusted | Can withdraw any ERC-20 tokens and native ETH from the contract. All operations instant — no timelock, no multisig. Ownership transferable via `Ownable.transferOwnership()` (single-step). |
| Relayer Bot | Bounded (can only submit valid signed payloads) | Submits `execute()` with user-signed permit + payload. Cannot forge signatures, but chooses gas price and timing. |
| User (Token Owner) | Bounded (signs permits and payloads) | Signs off-chain messages authorizing token spend + call forwarding. Nonce prevents replay. |

**Adversary Ranking** (ordered by threat level):

1. **Compromised Owner** — Single EOA controls all fund recovery functions with no delay; immediate drain of any tokens or ETH held by the contract.
2. **Signature replay / front-run attacker** — Observes signed permit + payload in mempool; can front-run the permit call (mitigated by try-catch) or attempt payload replay (mitigated by nonces).
3. **Malicious destination contract** — The immutable `destinationContract` receives arbitrary calls with forwarded ETH; if compromised or malicious, it could exploit the approval window or callback during `_forwardCall`.
4. **MEV searcher** — Can sandwich or front-run `execute()` transactions to extract value from the token transfer or forwarded call.

See [entry-points.md](entry-points.md) for the full permissionless entry point map.

### Trust Boundaries

- **User → Relayer Bot**: User trusts the relayer bot to submit their signed messages faithfully and in a timely manner. The bot cannot modify signed data but controls submission timing and gas. No on-chain enforcement of submission obligation.
- **Relayer Contract → Destination Contract**: The relayer grants exact-amount approval then forwards arbitrary calldata. The destination is immutable (set at construction), but the forwarded call is fully user-defined. If the destination contract has exploitable functions, the relayer's approval window (between `forceApprove` and revoke) is the attack surface.
- **Owner → Contract Funds**: Owner has instant, unrestricted withdrawal of all assets. No timelock or multisig protects this boundary. A compromised owner key means total loss of contract-held funds.

### Key Attack Surfaces

- **Owner key compromise** — Owner can instantly drain all ERC-20 tokens via `withdrawToken()` and all ETH via `withdrawETH()`. No timelock, no multisig, no delay. Single-step ownership transfer via `Ownable.transferOwnership()` (no acceptance step required). This is the highest-impact attack surface for any funds held by the contract.

- **Approval window during execute()** — Between `forceApprove(destination, value)` and `forceApprove(destination, 0)`, the destination contract has an active token approval. The `_forwardCall` makes a low-level `.call()` to the destination with arbitrary data during this window. If the destination contract can be made to call back into the token (or if the token has callbacks like ERC-777), the approval could be exploited. The `nonReentrant` guard on `execute()` mitigates re-entry into the relayer but does not prevent the destination from using the approval directly.

- **Forwarded call data integrity** — The EIP-712 payload signature includes `destination` hardcoded to `destinationContract` in `_computeDigest`, `token`, `value`, `data`, `ethValue`, `nonce`, and `deadline`. The user signs over these fields, so the relayer bot cannot alter them. However, the `data` field is opaque — the contract does not validate what function is being called on the destination. Security depends entirely on the user understanding what they're signing.

- **Permit front-running resilience** — The try-catch around `permit()` handles the case where an attacker front-runs the permit call. However, the fallback checks `allowance(owner, relayer) >= value` — if a previous permit set a higher allowance that was partially consumed, the check could pass with a stale allowance from a different context. The `safeTransferFrom` after the check ensures tokens are actually available.

### Protocol-Type Concerns

**As a Bridge/Relayer:**
- The `_forwardCall` uses a raw `.call()` without return data validation. Success is checked but return data is silently discarded (`(bool success, ) = ...`). If the destination returns meaningful error data, it's lost — `TokenRelayer:186-188`.
- Nonce management uses a per-user, per-nonce boolean mapping. There is no sequential nonce enforcement — nonces can be used in any order. This is by design (flexibility) but means a user cannot cancel a pending payload by incrementing their nonce; they must wait for expiry — `TokenRelayer:35`.

**As a Meta-transaction system:**
- The EIP-712 domain is `("TokenRelayer", "1")` with automatic chain ID handling via OZ's `EIP712`. On a chain fork, the domain separator updates correctly, preventing cross-chain replay — `TokenRelayer:68`.
- The `payloadDeadline` and `deadline` (permit) are separate parameters. A user could sign a permit with a long deadline but a short payload deadline, leaving a dangling permit approval if the payload expires — `TokenRelayer:42-49`.

### Temporal Risk Profile

**Deployment & Initialization:**
- The `destinationContract` is set immutably in the constructor with a zero-address check. No initialization front-running risk — `TokenRelayer:66-72`. However, ownership is set to `msg.sender` (deployer). If ownership transfer to a multisig is intended but delayed, the single EOA controls all withdrawal functions in the interim.

### Composability & Dependency Risks

**Dependency Risk Map:**

> **ERC-20 Token (arbitrary)** — via `TokenRelayer:execute()`
> - Assumes: Standard ERC-20 with ERC-2612 permit; `safeTransferFrom` handles non-standard return values
> - Validates: Uses SafeERC20 for transfers, try-catch for permit
> - Mutability: Depends on token — many ERC-20s (USDC, USDT) are upgradeable proxies
> - On failure: Permit failure falls back to allowance check; transfer failure reverts

> **Destination Contract (immutable address)** — via `TokenRelayer:_forwardCall()`
> - Assumes: Accepts arbitrary calldata, returns success/failure
> - Validates: Checks bool success only; return data discarded
> - Mutability: Address is immutable, but if destination is a proxy, implementation can change
> - On failure: Reverts entire execute() transaction

**Token Assumptions** (unvalidated):
- Fee-on-transfer tokens: `safeTransferFrom` transfers `value` but actual received amount may be less — the subsequent `forceApprove(destination, value)` would approve more than the contract holds, which is benign (destination can only take what's there), but accounting is imprecise
- Rebasing tokens: Balance could change between `safeTransferFrom` and `_forwardCall` — no internal accounting to detect this
- ERC-777 tokens: `tokensReceived` callback during `safeTransferFrom` could trigger reentrancy; `nonReentrant` on `execute()` mitigates this
- Blocklist tokens (USDC, USDT): If the relayer contract address is blocklisted, all operations involving that token will revert permanently

---

## 3. Invariants

### Stated Invariants

- "Nonce used" — each `(owner, nonce)` pair can only be consumed once: `require(!usedPayloadNonces[owner][nonce], "Nonce used")` — `TokenRelayer:86`
- "Payload expired" — payload must be executed before deadline: `require(block.timestamp <= params.payloadDeadline, "Payload expired")` — `TokenRelayer:87`
- "Invalid sig" — ECDSA-recovered signer must match declared owner: `require(ECDSA.recover(digest, ...) == owner, "Invalid sig")` — `TokenRelayer:100`
- "Incorrect ETH value provided" — msg.value must exactly match signed payloadValue: `require(msg.value == params.payloadValue, "Incorrect ETH value provided")` — `TokenRelayer:102`

### Inferred Invariants

- **Zero residual approval**: After every successful `execute()`, the destination contract's allowance from the relayer is 0. Derived from `TokenRelayer:121,127` (`forceApprove(value)` then `forceApprove(0)`). If violated: destination retains ability to pull tokens from the relayer.
- **CEI ordering**: State changes (`usedPayloadNonces` update) happen before all external interactions. Derived from `TokenRelayer:104-106`. If violated: replay within reentrancy.
- **Permit-or-allowance**: Token transfer proceeds if either permit succeeds OR pre-existing allowance ≥ value. Derived from `TokenRelayer:172-180`. If violated: legitimate transactions fail when permit is front-run.

---

## 4. Documentation Quality

| Aspect | Status | Notes |
|--------|--------|-------|
| README | Present | `contracts/README.md` — workspace-level only |
| NatSpec | ~5 annotations | Constructor, `withdrawToken`, `withdrawETH`, `_executePermitAndTransfer` have NatSpec; `execute()` lacks `@param`/`@return` documentation |
| Spec/Whitepaper | Missing | No formal specification document |
| Inline Comments | Adequate | Key decisions documented (CEI pattern, front-run resilience, approval revocation). References to audit findings (H-2, L-1, etc.) |
| Security Audit | Present | `SECURITY_AUDIT.md` — AI-generated review with 12 findings; critical findings (C-1, C-2) have been addressed in current code |

---

## 5. Test Analysis

| Metric | Value | Source |
|--------|-------|--------|
| Test files | 2 | File scan (integration scripts, not unit test suites) |
| Test functions | 0 | No `it()`/`describe()`/`test()` blocks — scripts are standalone execution flows |
| Line coverage | 0% | Coverage tool ran; tests failed — missing env vars (SECRET1, SECRET2, RELAYER_SECRET) |
| Branch coverage | 0% | Same — env var dependency prevents execution |

### Test Depth

| Category | Count | Contracts Covered |
|----------|-------|-------------------|
| Unit | 0 | none |
| Stateless Fuzz | 0 | none |
| Stateful Fuzz (Foundry) | 0 | none |
| Stateful Fuzz (Echidna) | 0 | none |
| Formal Verification (Certora) | 0 | none |
| Formal Verification (Halmos) | 0 | none |

### Gaps

- **No unit tests**: The 2 test files (`relayer-execution.ts`, `relayer-execution-squid.ts`) are integration/execution scripts requiring live env vars (private keys, RPC), not repeatable unit tests. No Hardhat/Mocha test framework usage detected.
- **No fuzz testing**: Signature verification, nonce handling, and permit edge cases (front-running, malleability) are prime candidates for stateless fuzzing.
- **No formal verification**: The EIP-712 digest construction and ECDSA recovery path would benefit from formal verification to ensure no signature bypass exists.
- **No invariant testing**: The "zero residual approval" and "nonce uniqueness" invariants are critical and untested.

---

## 6. Developer & Git History

> Repo shape: normal_dev — Normal development history with 4 source-touching commits over 1 month. Analyzed branch: `create-spec-and-security-audit` at `6d0c246ec`.

### Contributors

| Author | Commits | Source Lines (+/-) | % of Source Changes |
|--------|--------:|--------------------|--------------------:|
| Marcel Ebert | 4 | +266 / -48 | 100% |

### Review & Process Signals

| Signal | Value | Assessment |
|--------|-------|------------|
| Unique contributors (repo-wide) | 12 | Larger team on the monorepo |
| Unique contributors (contracts) | 1 | Single developer for all contract source |
| Merge commits | 745 of 5323 (14%) | Formal review process exists at repo level |
| Repo age | 2023-10-02 → 2026-04-07 | 2.5 years |
| Recent source activity (30d) | 0 source commits | Quiet — no source changes in last 30 days |
| Test co-change rate | 75% | 3 of 4 source commits also modified test files |

### File Hotspots

| File | Modifications | Note |
|------|-------------:|------|
| contracts/TokenRelayer.sol | 4 | Only source file — all 4 commits touch it |

### Security-Relevant Commits

| SHA | Date | Subject | Score | Key Signal |
|-----|------|---------|------:|------------|
| e63d38bce | 2026-03-04 | Upgrade smart contract with security findings | 14 | Explicit security language, changes signature/auth handling, net code removal |
| a8ff3f2c8 | 2026-03-04 | Refactor directory structure | 11 | Adds runtime guards (+23), tightens access control (+21), changes token transfer logic |
| 125f601d5 | 2026-03-04 | Adjust issues with TokenRelayer.sol | 10 | Rewrites runtime guards, changes signature/auth handling, changes accounting logic |
| 83973b1fa | 2026-03-04 | Adjust comments | 7 | Rewrites access control, changes signature handling |

All 4 source commits occurred on the same day (2026-03-04), indicating a concentrated security hardening pass in response to the AI security audit.

### Security Observations

- **Single-developer contract code**: 100% of contract source written by one author. No evidence of peer review specifically on the Solidity code, though the broader repo has merge commit history.
- **Security hardening batch**: All 4 source commits on a single day address findings from `SECURITY_AUDIT.md` — C-1 (ReentrancyGuard), C-2 (ECDSA.recover), H-1 (exact approvals), H-2 (destination in digest), M-1 (ETH recovery), M-2 (permit try-catch), L-1 (remove executedCalls), L-2 (events), I-1 (Ownable), I-3 (EIP712). This is a positive signal — findings were systematically addressed.
- **No test updates with substance**: While test files were co-modified in 3/4 commits, the test files remain execution scripts, not unit tests. The test co-change rate (75%) overstates actual test coverage improvement.
- **No recent activity**: Zero source commits in the last 30 days. The contract appears stable but may also indicate paused development before deployment.

### Cross-Reference Synthesis

- TokenRelayer.sol is the sole source file, the sole hotspot (4 modifications), and the subject of all 4 fix-scored commits — all review effort should concentrate here.
- The security hardening commits (score 10-14) addressed the critical and high findings from the AI audit. The current code shows ReentrancyGuard, ECDSA.recover, exact approval + revoke, and destination hardcoded in digest — confirming remediation of C-1, C-2, H-1, H-2.
- Despite the fix commits having test co-changes, no actual unit tests exist — the "zero coverage" finding from Section 5 is confirmed by git history showing only script modifications, not test suite additions.
- Single-developer risk (Section 6) amplifies the owner key compromise surface (Section 2) — both the code authorship and the admin key likely trace to the same individual.

---

## X-Ray Verdict

**FRAGILE** — Single 138-nSLOC contract with addressed audit findings but zero automated tests and no operational safeguards on admin functions.

**Structural facts:**
1. 138 nSLOC in 1 contract — minimal attack surface by size, but every line is security-critical (signature verification, token handling, arbitrary call forwarding).
2. 0 unit tests, 0 fuzz tests, 0 formal verification — the 2 "test" files are integration scripts requiring live secrets, providing zero repeatable coverage.
3. Single developer wrote 100% of contract code; all 4 source commits on one day as a security hardening batch.
4. Owner has instant, unrestricted withdrawal of all contract-held tokens and ETH — no timelock, no multisig, single-step ownership transfer.
5. Prior AI security audit findings (12 total: 2 critical, 2 high) have been addressed in the current code — ReentrancyGuard, ECDSA.recover, exact approval/revoke, EIP712, Ownable all integrated.
