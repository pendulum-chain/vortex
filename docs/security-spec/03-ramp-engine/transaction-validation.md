# Transaction Validation — Presigned Transaction Verification

## What This Does

Before a ramp begins execution, the client signs a set of transactions that the server will later submit on behalf of the user. This presigned transaction model is the core trust boundary of the ramp engine: the server MUST verify that every presigned transaction matches the expected parameters (recipient, amount, asset, chain, signer) before accepting and executing it. Without content-level validation, a malicious API client could submit transactions that redirect user funds, authorize unlimited token approvals, or target attacker-controlled addresses — all of which the server would faithfully execute.

Validation occurs at two points:
1. **`updateRamp`** — When the client submits signed transactions, `validatePresignedTxs()` and `areAllTxsIncluded()` are called.
2. **`startRamp`** — Before execution begins, `validatePresignedTxs()` runs again, plus `validateAllPresignedTransactionsSigned()` confirms all expected transactions are signed.

The validation logic lives in `apps/api/src/api/services/transactions/validation.ts` and is chain-specific: separate paths for EVM (Ethereum-compatible), Substrate (Polkadot-compatible), and Stellar transactions. Additional quote-level and integration-level validation lives in `transactions/onramp/common/validation.ts` and `transactions/offramp/common/validation.ts`.

## Security Invariants

1. **Every presigned transaction MUST have its content validated against server-generated expected values** — Phase, network, signer, AND transaction payload (amounts, destinations, assets, method calls) must all match. Metadata-only matching (phase+network+nonce+signer) is insufficient.
2. **EVM typed data (EIP-712) MUST be validated with the same rigor as raw transactions** — Permit signatures, SquidRouter executions, and any other EIP-712 signed data must have their structured fields (spender, value, deadline, target contract) verified against expected values.
3. **Stellar payment transactions MUST validate amount, destination, and asset** — A payment operation that passes the "is a payment" type check but sends to an attacker address or sends the wrong amount is equally dangerous.
4. **Stellar account setup transactions MUST validate startingBalance, cosigner in SetOptions, and ChangeTrust asset** — Each operation in the multi-operation setup XDR has security-critical parameters beyond just "correct operation type."
5. **Substrate extrinsic content MUST be decoded and validated** — Signer-only validation is insufficient. The extrinsic method, call parameters, amounts, and destination addresses must match expected values.
6. **SELL-direction SquidRouter transactions MUST NOT bypass validation** — Off-ramp swap/approve phases must be validated with the same rigor as BUY-direction phases.
7. **`areAllTxsIncluded` MUST match on transaction content, not only metadata** — Matching on phase+network+nonce+signer allows a client to substitute completely different transaction data while preserving the metadata envelope.
8. **No chain type or transaction format may be silently skipped during validation** — If a new chain or transaction format is added, the validator must either handle it or reject it. Silent pass-through (`return` without validation) is forbidden.
9. **Validation MUST occur before any presigned transaction is persisted or executed** — The `updateRamp` and `startRamp` flows must reject invalid transactions before merging them into ramp state.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Fund redirection via Stellar payment** | Client signs a Stellar payment to an attacker address instead of the expected anchor deposit address. Server accepts it because only operation type and source are checked. | **OPEN (F-039)**: Validate payment destination, amount, and asset against the quote and expected anchor address. |
| **EIP-712 permit exploitation** | Client submits an EIP-712 permit that authorizes an attacker's spender address for unlimited token allowance. Server skips all EVM validation for typed data. | **OPEN (F-038)**: Decode and validate EIP-712 typed data fields — especially `spender`, `value`, and `deadline` — against expected SquidRouter/relayer contract addresses and amounts. |
| **Stellar account setup manipulation** | Client omits the server cosigner in SetOptions, or sets a tiny startingBalance, or adds trust for a worthless token. Server only checks operation types. | **OPEN (F-040)**: Validate startingBalance against minimum required, verify SetOptions includes the server cosigner public key, and verify ChangeTrust asset matches the expected ramp asset. |
| **Substrate extrinsic substitution** | Client submits a completely different Substrate extrinsic (e.g., `balances.transferAll` to an attacker) instead of the expected swap or XCM call. Server only checks signer. | **OPEN (F-042)**: Decode the extrinsic and validate method name, call parameters, amounts, and destination addresses. |
| **Off-ramp SquidRouter bypass** | SELL-direction ramps skip SquidRouter swap/approve validation entirely. Client could submit a swap routing funds to an attacker's EVM address. | **OPEN (F-041)**: Remove the SELL-direction skip and validate SquidRouter transactions for all directions. |
| **Transaction data substitution via metadata matching** | Client submits transactions with correct phase/network/nonce/signer metadata but different txData content. `areAllTxsIncluded` passes because it only checks metadata. | **OPEN (F-043)**: Include txData hash or content comparison in the inclusion check. |
| **New chain/format added without validation** | A developer adds a new chain type and the validator silently returns without checking it, because the chain type falls through all existing if-branches. | Add a default rejection: if a transaction's chain/format is not explicitly handled, throw an unrecoverable error. |

## Audit Checklist

- [EXISTING FINDING] **F-038**: EVM typed data (`SignedTypedData` / `SignedTypedDataArray`) bypasses ALL validation — `validatePresignedTxs` returns early without checking any fields.
- [EXISTING FINDING] **F-039**: Stellar payment validation checks operation type and source but NOT amount, destination, or asset.
- [EXISTING FINDING] **F-040**: Stellar `createAccount` validation checks operation types but NOT startingBalance, SetOptions cosigner, or ChangeTrust asset.
- [EXISTING FINDING] **F-041**: SELL-direction ramps skip `squidRouterSwap` and `squidRouterApprove` validation entirely via an explicit `continue` statement.
- [EXISTING FINDING] **F-042**: Substrate transaction validation only checks signer — extrinsic method, parameters, amounts, and destinations are not validated.
- [EXISTING FINDING] **F-043**: `areAllTxsIncluded` matches on phase+network+nonce+signer metadata only, not on txData content.
- [EXISTING FINDING] **F-047**: `getTransactionTypeForPhase` default case silently maps unknown phases to EVM instead of throwing — ~15 RampPhase values not in switch.
- [EXISTING FINDING] **F-048**: Stellar payment validation does not check operation count — client can inject extra operations (e.g., additional payments, account merge).
- [EXISTING FINDING] **F-049**: `stellarCleanup` phase falls through both if-blocks in `validateStellarTransaction` — only signer and XDR parse, no content validation.
- [EXISTING FINDING] **F-050**: EVM `validateEvmTransaction` checks `from` and `chainId` but NOT the `to` address (contract target) — transactions could target any arbitrary contract.
- [x] `validatePresignedTxs` is called in both `updateRamp` and `startRamp` — dual validation confirmed
- [x] `validateAllPresignedTransactionsSigned` checks every expected transaction has a corresponding signed entry
- [x] EVM raw transaction validation (`validateEvmTransaction`) checks `from`, `chainId`, and `nonce` against expected signer and chain
- [x] Onramp-specific validation (`validateAveniaOnramp`, `validateMoneriumOnramp`) checks quote amounts and integration-specific fields
- [x] Offramp-specific validation (`validateOfframpQuote`, `validateBRLOfframp`, `validateStellarOfframp`) checks quote consistency
- [x] `RAMP_START_EXPIRATION_TIME_SECONDS` enforces a time window between registration and start — prevents stale presigned transactions from being executed
- [ ] No default rejection for unrecognized chain types — `getTransactionTypeForPhase` default returns EVM (see F-047)
