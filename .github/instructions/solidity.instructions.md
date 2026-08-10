---
applyTo: "contracts/**/*.sol"
---

# Solidity review instructions

- Compare relayer changes with `docs/security-spec/04-smart-contracts/token-relayer.md`; any weakened invariant or stale security claim is a finding.
- Trace checks-effects-interactions across every external call. Nonces and replay protection must be committed before interaction, reentrancy must be blocked, and any revert must roll back the full execution.
- Verify that signed data binds the chain, verifying contract, immutable destination, owner, token, value, native value, nonce, deadline, and exact payload bytes. Use OpenZeppelin EIP-712/ECDSA behavior rather than custom recovery.
- Account for tokens using execution-local before/after balances and safe ERC-20 operations. Fee-on-transfer, rebasing, partial consumption, pre-existing balances, and stale allowances must fail closed without spending unrelated funds.
- Keep approvals exact and transient, validate low-level call success and return behavior, reject zero or codeless destinations, and return native refunds to the executor without opening a reentrancy path.
- Check current-owner access control for recovery operations, emitted audit events, zero-address handling, and behavior after ownership transfer.
- Require regression tests for replay, expiry, wrong signer/domain/destination, permit front-running, destination revert/reentrancy, receipt mismatch, partial token consumption, refund failure, and withdrawal authorization when the affected logic changes.
- Treat deployment modules and configured addresses as part of the security change. Source fixes are not production fixes until every supported chain is updated and verified.
