# Entry Point Map

> Vortex TokenRelayer | 4 entry points | 1 permissionless | 0 role-gated | 2 admin-only

---

## Protocol Flow Paths

### Setup (Owner)

`constructor(_destinationContract)` → contract deployed with immutable destination and owner = deployer

### User Flow

`[constructor above]` → User signs permit + payload off-chain → RelayerBot calls `execute(params)`
                                                                    ├─→ tokens transferred from User → Relayer → Destination
                                                                    └─→ arbitrary call forwarded to Destination

### Recovery (Owner)

`[any time]` → `withdrawToken(token, amount)` ← owner recovers stuck ERC-20
`[any time]` → `withdrawETH(amount)` ← owner recovers stuck ETH

---

## Permissionless

### `TokenRelayer.execute()`

| Aspect | Detail |
|--------|--------|
| Visibility | external payable, nonReentrant |
| Caller | Relayer Bot (anyone can call, but must provide valid user signatures) |
| Parameters | `params.token` (user-signed), `params.owner` (user-signed), `params.value` (user-signed), `params.deadline` (user-signed), `params.permitV/R/S` (user-signed), `params.payloadData` (user-signed), `params.payloadValue` (user-signed), `params.payloadNonce` (user-signed), `params.payloadDeadline` (user-signed), `params.payloadV/R/S` (user-signed) |
| Call chain | `→ ECDSA.recover()` → `_executePermitAndTransfer()` → `IERC20Permit.permit()` → `IERC20.safeTransferFrom(owner → relayer)` → `IERC20.forceApprove(destination, value)` → `_forwardCall()` → `destinationContract.call{value}(data)` → `IERC20.forceApprove(destination, 0)` |
| State modified | `usedPayloadNonces[owner][nonce]` set to `true` |
| Value flow | in (ERC-20 tokens from user to relayer), out (tokens approved to destination + ETH forwarded via call) |
| Reentrancy guard | yes (`nonReentrant`) |

### `TokenRelayer.receive()`

| Aspect | Detail |
|--------|--------|
| Visibility | external payable |
| Caller | Anyone (destination contract refunds, direct ETH sends) |
| Parameters | none |
| Call chain | (no-op — simply accepts ETH) |
| State modified | none (only ETH balance changes) |
| Value flow | in (ETH received) |
| Reentrancy guard | no |

---

## Admin-Only

| Contract | Function | Parameters | State Modified |
|----------|----------|------------|----------------|
| TokenRelayer | `withdrawToken(token, amount)` | `token` (owner-provided), `amount` (owner-provided) | none (token balance decreases) |
| TokenRelayer | `withdrawETH(amount)` | `amount` (owner-provided) | none (ETH balance decreases) |
