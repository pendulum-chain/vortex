# Transaction Validation — Presigned Transaction Verification

## What This Does

Before a ramp begins execution, the client signs a set of transactions that the server will later submit on behalf of the user. This presigned transaction model is the core trust boundary of the ramp engine: the server MUST verify that every presigned transaction matches the expected parameters (recipient, amount, asset, chain, signer) before accepting and executing it. Without content-level validation, a malicious API client could submit transactions that redirect user funds, authorize unlimited token approvals, or target attacker-controlled addresses — all of which the server would faithfully execute.

Validation occurs at two points:
1. **`updateRamp`** — When the client submits signed transactions, `validatePresignedTxs(..., { requireComplete: false })` validates every submitted non-skipped transaction against the server-generated unsigned transaction set before the signed subset is merged into ramp state.
2. **`startRamp`** — Before execution begins, `validatePresignedTxs()` runs again with complete-set validation enabled, plus `validateAllPresignedTransactionsSigned()` confirms all expected transactions are signed.

The validation logic lives in `apps/api/src/api/services/transactions/validation.ts` and is chain-specific: separate paths for EVM (Ethereum-compatible), Substrate (Polkadot-compatible), and Stellar transactions. Additional quote-level and integration-level validation lives in `transactions/onramp/common/validation.ts` and `transactions/offramp/common/validation.ts`.

### Presigned-Tx Partitioning, Filtering, and Deposit-QR Gating

Two mechanisms control what the client sees and when:

1. **Partitioning + filtering**: `ramp.service.ts` calls `partitionUnsignedTxs(rampState)` to split presigned txs into ephemeral-signed (server-cosigned) and user-signed buckets. `filterUnsignedTxsForResponse(rampState, ephemeralPresignChecksPass)` then strips ephemeral txs from the SDK response until the server has validated all ephemeral presigned signatures. This prevents the SDK / client from seeing or acting on transactions whose presign checks have not yet passed.
2. **Deposit-QR gating**: For BRL on-ramp, `state.depositQrCode` is only released to the client after `ephemeralPresignChecksPass === true`. This guarantees the user cannot make a PIX payment before the server has confirmed the ephemeral signature chain is valid (i.e., before all presigned txs needed to settle the deposit have been verified).

### User-Submitted Transaction Phases

Several phases are broadcast from the user's wallet, not from an ephemeral key, so the client never produces a presigned transaction for them. The server only sees the on-chain tx hash via `UpdateRampRequest.additionalData` and verifies the receipt + calldata against the server-issued unsigned payload at runtime.

User-wallet phases:

- `moneriumOnrampMint` — (Deprecated; Monerium is removed — see `05-integrations/monerium.md`. Validation logic retained for any in-flight legacy ramps.) User wallet authorizes Monerium mint.
- `squidRouterApprove` / `squidRouterSwap` — SELL direction only (BUY direction is ephemeral-signed).
- `squidRouterNoPermitTransfer` — Direct ERC-20 transfer from user wallet (when source ERC-20 lacks EIP-2612 permit and direction is direct-transfer).
- `squidRouterNoPermitApprove` — User wallet approves Squid spender.
- `squidRouterNoPermitSwap` — User wallet calls Squid swap.

**Layer 1 — `validatePresignedTxs` REJECTS presigned txs for these phases.** Any submitted presigned tx whose phase is in the user-wallet set throws `APIError(BAD_REQUEST, "Phase <phase> is broadcast by the user wallet; do not submit a presigned transaction for it. Submit only the on-chain tx hash via additionalData.")`. The previous behavior silently `continue`d past these phases, which allowed a malicious client to attach an unrelated presigned tx that would never be validated. The reject closes that surface.

**Layer 2 — Phase handlers verify the user-reported tx hash by reading the on-chain receipt and transaction**, then comparing against the server-issued unsigned payload (`txData.to`, `txData.data`, `txData.value`, and `signer`) plus receipt status. The shared helper is `verifyUserSubmittedTxByHash` in `apps/api/src/api/services/phases/helpers/user-tx-verifier.ts`. It is invoked from:

- `squidrouter-permit-execution-handler.ts` → `waitForUserHash` — covers `squidRouterNoPermit{Approve,Swap,Transfer}` during the permit-execution phase.
- `fund-ephemeral-handler.ts` → `verifyUserSubmittedSquidHashes` — covers SELL standard EVM `squidRouterApprove` + `squidRouterSwap` at the top of `executePhase`, gated on `SELL && from!==AssetHub && !isAlfredpayToken(outputCurrency) && isNetworkEVM(from)`. This closes the historical F-041 gap (SELL squid runtime validation).

The two layers together guarantee that the client cannot (a) sneak a malicious presigned tx through validation by labeling it with a user-wallet phase, nor (b) point the backend at an arbitrary on-chain tx hash that does not match the server-issued payload.

## Security Invariants

1. **Every server-submitted presigned transaction MUST have its content validated against server-generated expected values** — Phase, network, signer, AND transaction payload (amounts, destinations, assets, method calls) must all match. Metadata-only matching (phase+network+nonce+signer) is insufficient for transactions the server may later broadcast.
2. **EVM typed data (EIP-712) MUST be validated with the same rigor as raw transactions** — Permit signatures, SquidRouter executions, and any other EIP-712 signed data must have their structured fields (spender, value, deadline, target contract) verified against expected values.
3. **Stellar payment transactions MUST validate amount, destination, and asset** — A payment operation that passes the "is a payment" type check but sends to an attacker address or sends the wrong amount is equally dangerous.
4. **Stellar account setup transactions MUST validate startingBalance, cosigner in SetOptions, and ChangeTrust asset** — Each operation in the multi-operation setup XDR has security-critical parameters beyond just "correct operation type."
5. **Substrate extrinsic content MUST be decoded and validated** — Signer-only validation is insufficient. The extrinsic method, call parameters, amounts, and destination addresses must match expected values.
6. **Skipped user-wallet phases MUST have equivalent post-submission binding** — If `validatePresignedTxs` skips a phase because the transaction is submitted by the user's wallet, the phase handler must bind the reported transaction hash back to the server-issued expected payload before advancing.
7. **`areAllTxsIncluded` is only an inclusion guard** — It may remain metadata-only (`phase + network + nonce + signer`) if each submitted non-skipped transaction is content-bound in `validatePresignedTxs` against the unsigned transaction selected with the same identity keys.
8. **No chain type or transaction format may be silently skipped during validation** — If a new chain or transaction format is added, the validator must either handle it or reject it. Silent pass-through (`return` without validation) is forbidden.
9. **Validation MUST occur before any presigned transaction is persisted or executed** — The `updateRamp` and `startRamp` flows must reject invalid transactions before merging them into ramp state.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Fund redirection via Stellar payment** | Client signs a Stellar payment to an attacker address instead of the expected anchor deposit address. Current validation enforces shape, source, destination presence, positive amount, asset presence, and a single operation, but does not bind destination/amount/asset to the quote. | **OPEN (F-039)**: Validate payment destination, amount, and asset against the quote and expected anchor address. |
| **EIP-712 permit exploitation** | Client submits an EIP-712 permit that authorizes an attacker's spender address for unlimited token allowance. | **MITIGATED (F-038)**: Signed typed data is deep-compared against the server-issued unsigned typed data (`domain`, `primaryType`, `types`, `message`) before signature recovery, so spender/token/value/deadline/verifyingContract substitutions are rejected. |
| **Stellar account setup manipulation** | Client omits the server cosigner in SetOptions, or sets a tiny startingBalance, or adds trust for a worthless token. Current validation enforces operation count/order and required fields but does not bind the exact cosigner, startingBalance threshold, or ChangeTrust asset to expected quote/server values. | **OPEN (F-040)**: Validate startingBalance against minimum required, verify SetOptions includes the server cosigner public key, and verify ChangeTrust asset matches the expected ramp asset. |
| **Substrate extrinsic substitution** | Client submits a different Substrate extrinsic (e.g., `balances.transferAll` to an attacker) instead of the expected swap or XCM call. Current validation checks signer and method decodability, but not expected section/method/arguments. | **OPEN (F-042)**: Decode the extrinsic and validate method name, call parameters, amounts, and destination addresses. |
| **Off-ramp SquidRouter bypass** | SELL-direction ramps previously skipped SquidRouter swap/approve validation entirely. Client could submit a swap routing funds to an attacker's EVM address. | **MITIGATED (F-041)**: SELL-direction `squidRouterApprove`/`squidRouterSwap` are now (a) rejected by `validatePresignedTxs` if a presigned tx is submitted for them, and (b) verified by-hash at the top of `FundEphemeralPhaseHandler.executePhase` via `verifyUserSubmittedSquidHashes` against the server-issued `to`/`data`/`value`/`signer`. |
| **User-wallet phase presigned-tx smuggling** | Client submits an unrelated EVM/Substrate/Stellar presigned tx labeled with a user-wallet phase name (`moneriumOnrampMint`, `squidRouterApprove`/`Swap` for SELL, `squidRouterNoPermit*`). Previously `validatePresignedTxs` `continue`d on these phases, letting the tx through without content validation. | **MITIGATED**: `validatePresignedTxs` now throws `APIError(BAD_REQUEST)` for any presigned tx whose phase is in the user-wallet set. User-wallet phases are verified by on-chain hash + receipt + calldata only. |
| **Transaction data substitution via metadata matching** | Client submits transactions with correct phase/network/nonce/signer metadata but different txData content. | **MITIGATED (F-043)**: `validatePresignedTxs` resolves the matching unsigned transaction by the same identity keys and performs content validation before `areAllTxsIncluded` is used as the final inclusion guard. |
| **EVM contract target or execution-parameter substitution** | Client signs a raw EVM transaction to an attacker-controlled contract, or signs the expected transaction with gas/fee parameters too low to execute reliably. | **MITIGATED (F-050)**: Raw signed EVM transactions are recovered and compared to the server-issued unsigned `to`, `data`, `value`, and `nonce`; gas limit and fee caps must be at least the server-issued values, and contract-creation transactions are rejected. |
| **New phase/format added without validation** | A developer adds a new phase and the validator silently treats it as EVM because the phase type falls through to a default. | **MITIGATED (F-047)**: `getTransactionTypeForPhase` now throws for unknown phases instead of defaulting to EVM. |

## Audit Checklist

- [x] **F-038**: EVM typed data (`SignedTypedData` / `SignedTypedDataArray`) is bound to the server-issued unsigned typed data and the recovered signer.
- [EXISTING FINDING] **F-039**: Stellar payment validation checks shape, source, destination presence, positive amount, asset presence, and operation count, but NOT quote-bound amount, destination, or asset identity.
- [EXISTING FINDING] **F-040**: Stellar `createAccount` validation checks operation count/order and required fields, but NOT exact startingBalance threshold, expected SetOptions cosigner, or expected ChangeTrust asset.
- [x] **F-041**: SELL-direction `squidRouterApprove`/`squidRouterSwap` are rejected at `validatePresignedTxs` and verified by on-chain hash + receipt + calldata via `verifyUserSubmittedSquidHashes` at the top of `FundEphemeralPhaseHandler.executePhase`.
- [EXISTING FINDING] **F-042**: Substrate transaction validation checks signer and decodable method, but NOT expected method, parameters, amounts, or destinations.
- [x] **F-043**: `areAllTxsIncluded` remains metadata-only, but content substitution is blocked earlier by identity-keyed unsigned transaction lookup plus per-format content validation.
- [x] **F-047**: `getTransactionTypeForPhase` throws on unknown phases instead of defaulting to EVM.
- [x] **F-048**: Stellar payment validation requires exactly one operation.
- [x] **F-049**: `stellarCleanup` no longer falls through with only parse/signature checks; it validates transaction source and an expected cleanup operation count range.
- [x] **F-050**: EVM validation checks raw transaction `to`, `data`, `value`, `nonce`, signer, chain ID, gas limit, and fee caps against the server-issued unsigned transaction; contract creation is rejected.
- [x] `validatePresignedTxs` is called in both `updateRamp` and `startRamp` — dual validation confirmed
- [x] `validateAllPresignedTransactionsSigned` checks every expected transaction has a corresponding signed entry
- [x] EVM raw transaction validation (`validateEvmTransaction`) checks `from`, `chainId`, `nonce`, `to`, `data`, `value`, gas limit, and fee caps against expected signer, chain, and server-issued unsigned payload
- [x] Onramp-specific validation (`validateAveniaOnramp`, `validateMoneriumOnramp`) checks quote amounts and integration-specific fields
- [x] Offramp-specific validation (`validateOfframpQuote`, `validateBRLOfframp`, `validateStellarOfframp`) checks quote consistency
- [x] `RAMP_START_EXPIRATION_TIME_SECONDS` enforces a time window between registration and start — prevents stale presigned transactions from being executed
- [x] Default rejection for unrecognized phases — `getTransactionTypeForPhase` throws instead of defaulting to EVM (see F-047)
- [EXISTING FINDING] **F-055**: Backup presigned transactions (`backupApprove`) use unlimited `maxUint256` ERC-20 approval amount — excessive blast radius if funding key is compromised.
- [EXISTING FINDING] **F-056**: `sandboxEnabled` bypasses chainId validation in `validateEvmTransaction` and skips entire ramp flow in `initial-phase-handler` — no production guard prevents accidental activation.
- [x] **F-057**: `destinationTransfer` decodes native transfers and ERC-20 `transfer` calldata and verifies the recipient matches `state.destinationAddress` before broadcasting.
- [EXISTING FINDING] **F-058**: No per-presigned-transaction TTL after ramp starts — `getPresignedTransaction` performs no age check, presigned txs remain valid indefinitely through recovery retries.
- [x] Presigned-tx partitioning via `partitionUnsignedTxs` + `filterUnsignedTxsForResponse`. **PASS** — ephemeral txs hidden from SDK response until `ephemeralPresignChecksPass` flips true.
- [x] Deposit QR code (BRL onramp) gated on `ephemeralPresignChecksPass`. **PASS** — verified in `meta-state-types.ts`.
- [x] Signed presigned transaction matching accepts normal signed payload mutations while still binding EVM raw transactions to the unsigned server-built `to`/`data`/`value`/`nonce` and minimum gas/fee parameters, and typed-data payloads to the unsigned typed-data content with signatures stripped for comparison.
- [x] **No-permit fallback receipt validation hardened**: `waitForUserHash` verifies receipt `from`, receipt `to`, and transaction `input` against the expected user address and presigned EVM transaction payload before advancing.
- [x] User-submitted phase types (`moneriumOnrampMint`, SELL `squidRouterApprove`/`squidRouterSwap`, `squidRouterNoPermit*`) are **rejected** by `validatePresignedTxs` if presigned and **verified by on-chain hash + receipt + calldata** at runtime via `verifyUserSubmittedTxByHash` in `apps/api/src/api/services/phases/helpers/user-tx-verifier.ts`.
- [x] **Typed-data full-field binding (F-038 hardening)**: `validateSignedTypedData` deep-compares the signed typed data against the server-issued unsigned typed data (`domain`, `primaryType`, `types`, `message`) before recovering the signature, so the user cannot substitute spender/token/value/deadline/nonce/verifyingContract while still producing a valid signature over a tampered struct.
- [x] **Unsigned-tx lookup is identity-keyed (F-043 hardening)**: per-tx content validation now resolves the matching unsigned slot on `phase + network + nonce + signer` (same keys `areAllTxsIncluded` uses), so a presigned tx whose phase/network collide with a different unsigned slot is rejected rather than validated against the wrong reference.
- [x] **Chainless EVM tx rejection**: `verifySignedEvmTransaction` rejects raw txs whose decoded `chainId` is `undefined` (pre-EIP-155 legacy txs), closing a cross-chain replay bypass that existed even when `sandboxEnabled` was false.
- [x] **Backup re-verification**: `meta.additionalTxs` must contain exactly the expected backup set, and every backup is re-run through the primary's validator (EVM signer + nonce + content; Substrate signer + call-equality via `method.toHex()`; Stellar signer + per-phase shape), so a malicious client cannot register ignored extras or backups that encode a different call or signer than the primary tx.
- [x] **`updateRamp` subset submissions**: `validatePresignedTxs` accepts `{ requireComplete: false }` for partial submissions but still rejects extra/unknown txs and still applies full per-tx content validation; `requireComplete` defaults to `true` for `startRamp`.
