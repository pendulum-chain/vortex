# Code Review: Branch `1161-sdk-changes-for-alfredpay-currencies-support`

Review run: 2026-06-23 — 47 agents, 37 candidates verified, 21 kept, 16 refuted.

---

## Confirmed Bugs

### 1. `parseAPIError` missing "User address must be provided" mapping
**`packages/sdk/src/errors.ts:437`**

When a caller submits an Alfredpay offramp with a missing `walletAddress`, the API returns `"User address must be provided for offramping."`. `parseAPIError` only maps `"fiatAccountId is required for Alfredpay offramp"`, so the wallet-missing error falls through to a generic `VortexSdkError`. Callers checking `instanceof MissingAlfredpayOfframpParametersError` never match and cannot give a targeted error message.

**Fix:** Add a second mapping for `"User address must be provided for offramping."` in `parseAPIError`.

---

### 2. `MissingAlfredpayOfframpParametersError` constructor message mismatch
**`packages/sdk/src/errors.ts:437`**

`parseAPIError` matches on `"fiatAccountId is required for Alfredpay offramp"` but the constructor hardcodes `"Parameters fiatAccountId and walletAddress are required for Alfredpay offramp"`. Any caller logging or pattern-matching on `error.message` after catching sees the wrong text.

**Fix:** Make the constructor accept an optional message so `parseAPIError` can forward the original API message.

---

### 3. `submitUserTransactions` throws unrecoverably for unsupported tx types
**`packages/sdk/src/VortexSdk.ts:274`**

If the API returns a user transaction the SDK classifies as `"unsupported"` (e.g. a raw Substrate hex string), `submitUserTransactions` throws `"Unsupported user transaction"` and aborts the entire loop. The ramp stalls with no recovery path short of calling `submitUserSignature` / `submitUserTxHash` directly.

**Fix:** Add an optional `handleUnsupported` callback to `SubmitUserTransactionsHandlers`; call it when the type is unsupported. Throw if no handler is provided (consistent with `signTypedData`/`sendTransaction` guards).

---

### 4. `submitUserSignature` has no guard on tx type — opaque internal error
**`packages/sdk/src/VortexSdk.ts:185`**

Passing an `evm-transaction` typed tx to `submitUserSignature` instead of `submitUserTxHash` throws `'attachSignatures: phase X has no typed-data payloads to sign'` from deep inside `eip712.ts` rather than a clear API-boundary error. The ramp is left started-but-unsigned.

**Fix:** Add a type check at the top of `submitUserSignature` and throw a clear pre-condition error.

---

### 5. Rolling-deploy alert noise: `snapshotPreSettlementBalance` idempotency with old ramps
**`apps/api/src/api/services/phases/handlers/squid-router-phase-handler.ts:40`**

Ramps started under the old deployment have `preSettlementBalance` written post-swap. When the new deployment picks them up, the idempotency guard skips re-snapshotting (correct). The subsidy handler then computes `delivered ≈ 0`, the clamp fires, and a warn log is emitted. **No funds are lost** — the clamp protects correctly — but expect alert noise during a rolling deploy. No code change needed; operator awareness is sufficient.

---

## Confirmed Code-Quality Issues

### 6. `isTypedDataItem` duplicates `isSignedTypedData` from `@vortexfi/shared`
**`packages/sdk/src/eip712.ts:24`**

Character-for-character copy of `isSignedTypedData` already exported from shared. The shared import is present on line 3. Two copies means a future shape change to `SignedTypedData` must be applied in both places or the SDK filter will silently miss payloads.

**Fix:** Remove `isTypedDataItem`; inline `isSignedTypedData` with a cast at the single call site in `typedDataToSign`.

---

### 7. Copy-pasted 16-line post-register block in `AlfredpayHandler`
**`packages/sdk/src/handlers/AlfredpayHandler.ts:62`**

`registerAlfredpayOnramp` and `registerAlfredpayOfframp` share an identical `storeEphemerals → signTransactions → build updateRequest → updateRamp` block. The same pattern exists in `BrlHandler`. A change to that block (error handling, new field) must be applied to all copies or behaviour diverges.

**Status:** Noted; not fixed in this pass to keep changes surgical.

---

### 8. `updateAlfredpayOfframp` body is identical to `BrlHandler.updateBrlOfframp`
**`packages/sdk/src/handlers/AlfredpayHandler.ts:128`**

Both check `currentPhase === 'initial'`, build `UpdateRampRequest` with the same three hash fields, and call `updateRamp`. The phase-guard wording already diverges slightly. A new hash field added to `OfframpUpdateAdditionalData` must be reflected in both methods.

**Status:** Noted; not fixed in this pass to keep changes surgical.

---

## Plausible (not confirmed)

### 9. `startRamp` always delegates to `brlHandler.startBrlRamp` for all ramp types
**`packages/sdk/src/VortexSdk.ts:176`**

Works today (same API endpoint), but if `BrlHandler.startBrlRamp` ever gains BRL-specific pre-flight logic, Alfredpay ramps will incorrectly execute it.

### 10. `AlfredpayHandler` duplicates `BrlHandler`'s constructor and private fields verbatim
**`packages/sdk/src/handlers/AlfredpayHandler.ts:21`**

Four private field declarations + constructor body copied exactly. Adding a new dependency means updating both constructors and both wiring sites in `VortexSdk.ts`.
