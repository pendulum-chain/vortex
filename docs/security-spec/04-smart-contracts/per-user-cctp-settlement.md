# Per-User CCTP Settlement Contract

## What This Does

`PerUserCctpSettlement.sol` is a first-iteration proof of concept for customer-specific settlement contracts on Base. It deliberately skips the future EURC→USDC swap step and assumes the contract already holds Base USDC. Anyone may call `sweepUsdc()`, which burns the contract's full USDC balance through Circle CCTP V2 with the Forwarding Service hook so Circle handles the destination-chain mint transaction to the immutable Ethereum recipient configured at deployment.

The PoC also includes `PerUserCctpSettlementFactory.sol`, which deploys per-user settlement contracts with shared immutable USDC and TokenMessenger addresses.

## Security Invariants

1. **The Ethereum mint recipient MUST be immutable** — The recipient is constructor-set and exposed only through read-only getters. There is no setter or upgrade path.
2. **The contract MUST NOT expose admin withdrawal of USDC** — USDC can only leave through `TokenMessengerV2.depositForBurnWithHook()` with the immutable mint recipient.
3. **The contract MUST NOT expose arbitrary external calls** — The only external protocol call is the configured CCTP TokenMessenger's `depositForBurnWithHook()` function.
4. **Sweeps MUST burn the full current USDC balance** — The PoC does not support partial withdrawals or operator-selected recipients.
5. **CCTP approvals MUST be exact and temporary** — The contract approves exactly the current USDC balance to the TokenMessenger and resets the allowance to zero after a successful burn.
6. **Sweep execution MUST be non-reentrant** — `sweepUsdc()` uses `ReentrancyGuard` because both the ERC-20 and TokenMessenger calls are external.
7. **Destination domain MUST be Ethereum** — The destination domain is hardcoded to Circle domain `0`; Base is the source deployment chain for the intended PoC.
8. **Forwarding Service MUST use Circle's reserved hook data and no destination caller** — The hook data is the static `cctp-forward` payload and `destinationCaller` is always `bytes32(0)`, because Circle forwarding does not support wrapper/authorized-caller flows.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Recipient redirection** — An operator tries to change the Ethereum payout wallet after funds arrive. | The recipient is immutable and there is no setter, owner, proxy, or arbitrary execution path. |
| **Admin drain** — A deployer or owner withdraws USDC instead of burning it to the user. | The contract has no owner and no token/native withdrawal functions. |
| **Approval drain** — TokenMessenger or a compromised spender uses leftover allowance later. | The approval is for the exact sweep amount and is revoked after `depositForBurn()` succeeds. |
| **Reentrant burn attempt** — A malicious mock/token/protocol reenters `sweepUsdc()` during the burn path. | `sweepUsdc()` is guarded by OpenZeppelin `ReentrancyGuard`. |
| **Wrong CCTP parameters** — Funds are burned with an incorrect destination domain, token, recipient, hook data, or destination caller. | Domain, forwarding hook data, and zero destination caller are constants; USDC, TokenMessenger, and recipient are constructor-set. Tests assert the exact parameters passed to the TokenMessenger mock. |
| **Insufficient forwarding fee** — The provided `maxFee` is too low for CCTP and forwarding execution. | The TokenMessenger reverts or forwarding falls back according to Circle's fee rules. Callers must fetch a fresh Circle fee estimate and pass a sufficient `maxFee`; the contract does not hardcode forwarding fees. |
| **CCTP forwarding delay** — Base burn succeeds but Circle forwarding takes longer than expected. | This is expected CCTP/Forwarding Service behavior. Backend operations should index Circle `DepositForBurn` / `MessageSent` data and monitor Circle transfer status rather than submit the Ethereum mint itself. |

## Audit Checklist

- [x] Verify `ethereumMintRecipient` and `mintRecipientBytes32` are immutable and cannot be changed after deployment.
- [x] Verify there is no `withdrawToken`, `withdrawETH`, `execute`, `delegatecall`, or generic call surface.
- [x] Verify `sweepUsdc()` reads `usdc.balanceOf(address(this))` and reverts when the balance is zero.
- [x] Verify `depositForBurnWithHook()` receives destination domain `0`, the immutable recipient bytes32, zero destination caller, the immutable USDC address, and the static forwarding hook data.
- [x] Verify approval to the TokenMessenger is exact and reset to zero after success.
- [x] Verify reentrant calls to `sweepUsdc()` fail.
- [x] Verify deployment rejects zero USDC, TokenMessenger, and recipient addresses.
