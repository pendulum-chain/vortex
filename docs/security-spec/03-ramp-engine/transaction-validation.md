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

Three phases use user-wallet-submitted transactions instead of ephemeral presigned txs:

- `squidRouterNoPermitTransfer` — Direct ERC-20 transfer from user wallet (when source ERC-20 lacks EIP-2612 permit and direction is direct-transfer).
- `squidRouterNoPermitApprove` — User wallet approves Squid spender.
- `squidRouterNoPermitSwap` — User wallet calls Squid swap.

These phases are **explicitly skipped** in `validatePresignedTxs` (the function `continue`s on these phase names). The user reports the resulting tx hashes back via `UpdateRampRequest.additionalData`; the backend verifies the receipts and transaction calldata against the server-issued payload via `waitForUserHash` in the squid permit-execution handler (see `05-integrations/squid-router.md`).

This is consistent with the existing skip for `moneriumOnrampMint` and SELL-direction `squidRouterSwap`/`squidRouterApprove` (which are also user-wallet-submitted). The no-permit fallback has explicit receipt/content binding; the SELL-direction `squidRouterSwap`/`squidRouterApprove` skip remains tracked separately as F-041 unless or until equivalent binding is implemented or documented for that path.

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
| **Off-ramp SquidRouter bypass** | SELL-direction ramps skip SquidRouter swap/approve validation entirely. Client could submit a swap routing funds to an attacker's EVM address. | **OPEN (F-041)**: Remove the SELL-direction skip and validate SquidRouter transactions for all directions. |
| **Transaction data substitution via metadata matching** | Client submits transactions with correct phase/network/nonce/signer metadata but different txData content. | **MITIGATED (F-043)**: `validatePresignedTxs` resolves the matching unsigned transaction by the same identity keys and performs content validation before `areAllTxsIncluded` is used as the final inclusion guard. |
| **EVM contract target or execution-parameter substitution** | Client signs a raw EVM transaction to an attacker-controlled contract, or signs the expected transaction with gas/fee parameters too low to execute reliably. | **MITIGATED (F-050)**: Raw signed EVM transactions are recovered and compared to the server-issued unsigned `to`, `data`, `value`, and `nonce`; gas limit and fee caps must be at least the server-issued values, and contract-creation transactions are rejected. |
| **New phase/format added without validation** | A developer adds a new phase and the validator silently treats it as EVM because the phase type falls through to a default. | **MITIGATED (F-047)**: `getTransactionTypeForPhase` now throws for unknown phases instead of defaulting to EVM. |

## Audit Checklist

- [x] **F-038**: EVM typed data (`SignedTypedData` / `SignedTypedDataArray`) is bound to the server-issued unsigned typed data and the recovered signer.
- [EXISTING FINDING] **F-039**: Stellar payment validation checks shape, source, destination presence, positive amount, asset presence, and operation count, but NOT quote-bound amount, destination, or asset identity.
- [EXISTING FINDING] **F-040**: Stellar `createAccount` validation checks operation count/order and required fields, but NOT exact startingBalance threshold, expected SetOptions cosigner, or expected ChangeTrust asset.
- [EXISTING FINDING] **F-041**: SELL-direction ramps skip `squidRouterSwap` and `squidRouterApprove` validation entirely via an explicit `continue` statement.
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
- [x] User-submitted phase types (`squidRouterNoPermit*`) explicitly skipped in `validatePresignedTxs`. **PASS** — intentional; backend trust shifted to hardened receipt verification.
- [x] **Typed-data full-field binding (F-038 hardening)**: `validateSignedTypedData` deep-compares the signed typed data against the server-issued unsigned typed data (`domain`, `primaryType`, `types`, `message`) before recovering the signature, so the user cannot substitute spender/token/value/deadline/nonce/verifyingContract while still producing a valid signature over a tampered struct.
- [x] **Unsigned-tx lookup is identity-keyed (F-043 hardening)**: per-tx content validation now resolves the matching unsigned slot on `phase + network + nonce + signer` (same keys `areAllTxsIncluded` uses), so a presigned tx whose phase/network collide with a different unsigned slot is rejected rather than validated against the wrong reference.
- [x] **Chainless EVM tx rejection**: `verifySignedEvmTransaction` rejects raw txs whose decoded `chainId` is `undefined` (pre-EIP-155 legacy txs), closing a cross-chain replay bypass that existed even when `sandboxEnabled` was false.
- [x] **Backup re-verification**: `meta.additionalTxs` must contain exactly the expected backup set, and every backup is re-run through the primary's validator (EVM signer + nonce + content; Substrate signer + call-equality via `method.toHex()`; Stellar signer + per-phase shape), so a malicious client cannot register ignored extras or backups that encode a different call or signer than the primary tx.
- [x] **`updateRamp` subset submissions**: `validatePresignedTxs` accepts `{ requireComplete: false }` for partial submissions but still rejects extra/unknown txs and still applies full per-tx content validation; `requireComplete` defaults to `true` for `startRamp`.
