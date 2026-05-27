# Mykobo EUR Offramp Integration Plan

**Status**: In progress — backend ramping flow
**Owner**: this session
**Stellar EUR offramp**: untouched for now; removed in a later session after Mykobo is verified

---

## Goal

Replace the EUR offramp leg that currently runs through Stellar anchors (Spacewalk redeem → Stellar payment) with a new EVM-only flow that:

1. Starts on any `supportsRamp: true` EVM chain (Polygon, Ethereum, BSC, Arbitrum, Base, Avalanche — **not** AssetHub, Hydration, or any substrate chain)
2. Uses Squidrouter (permit-based, AlfredPay-style) to deliver Circle USDC onto a Base EVM ephemeral account
3. Swaps USDC → EURC on Base Nabla DEX
4. Forwards EURC to Mykobo's receivables wallet (returned by their intent API)
5. Mykobo pays the user in EUR via SEPA

KYC / profile creation is a **separate session**. This session focuses on ramping flow + quote engine only.

---

## Mykobo API (https://api-dev.mykobo.app/docs/)

### Base URLs
- Prod: `https://api.mykobo.app/v1`
- Dev:  `https://api-dev.mykobo.app/v1`

### Auth
Bearer token. Acquire via `POST /v1/auth/token` with `{access_key, secret_key}` → `{subject_id, token, refresh_token}`. Refresh via `POST /v1/auth/refresh`. Token TTL is unspecified in docs → lazy refresh on 401.

### Required scopes (all on one token)
- `transaction:read` — list/get transactions, fees
- `transaction:write` — create intents
- `user:write` — create/get profiles (later session, but we'll request the scope now)

### Endpoints we use in this session

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/auth/token` | POST | Acquire bearer + refresh |
| `/v1/auth/refresh` | POST | Refresh bearer |
| `/v1/transactions/intent` | POST | Create `WITHDRAW` intent → returns `instructions.address` (Mykobo's receivables wallet) and `transaction.id` |
| `/v1/transactions/{id}` | GET | Poll status until `COMPLETED` (or fail states) |
| `/v1/fees` | GET `?value=X&kind=withdraw&client_domain=Y` | Returns fee in EURC (already correct currency) |

### Endpoints used in later session (KYC)
- `POST /v1/profiles` (multipart, KYC docs)
- `GET /v1/profiles?email=` (lookup profile by email)

### Critical Mykobo semantics

- **Intent body fields**: `transaction_type="WITHDRAW"`, `wallet_address` (ephemeral 0x), `email_address` (persistent identity — auto-binds new ephemeral on each ramp), `value`, `currency="EURC"`, `ip_address`, optional `client_domain`.
- **WITHDRAW response** contains `instructions.address` = the **destination address we must send EURC to** (Mykobo's receivables wallet). It is **not** the user's IBAN. The user's IBAN is on their KYC'd profile; Mykobo pays out from their side.
- **Profile resolution errors**:
  - `404 profile_not_found` — surface as registration error
  - `403 kyc_required` — surface with `kyc_status` field to route to KYC flow
  - `409 wallet_email_mismatch` — should not happen in our flow because Mykobo auto-binds on first use; if it does, surface
- **Fees**: returns `{total, asset: "EURC", details: [...]}`. When `client_domain` is set, fees come back in EURC for both deposit and withdraw kinds.

---

## Locked Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Source chains | All EVM chains with `supportsRamp: true` | Matches AlfredPay model |
| USDC → EURC swap venue | Nabla on Base (`NABLA_ROUTER_BASE`) | Pool exists (user confirmed); reuses existing Nabla EVM infra |
| `wallet_address` on Mykobo intent | Ephemeral 0x | Mykobo auto-binds email→ephemeral; identity is email-based |
| When to create intent | At ramp **registration** (`prepareEvmToMykoboOfframpTransactions`) | Lets us presign the final EURC transfer to Mykobo's receivables address (BRL-EVM style) |
| Email source | Frontend reads the Supabase-authenticated user's email and passes it as the `email` query param to `GET /v1/mykobo/profiles`; backend cross-checks the param against `req.userEmail` and queries Mykobo by email via `MykoboApiService.getProfileByEmail` | Aligns with Supabase-auth profile model; avoids leaking wallet→profile linkage |
| Identity persistence | JSONB only on `RampState.state` (no new `MykoboCustomer` table yet) | "No over-engineering" rule; KYC session can normalize later |
| Mykobo client style | Singleton class mirroring `BrlaApiService` | Repo convention; easy mocking |
| Token strategy | Single shared bearer with all 3 scopes, lazy init, 401→refresh→re-acquire | Simplest robust model; matches docs |
| Fee currency | Returned as EURC directly from Mykobo (no conversion) | Confirmed by user with live API output |
| Anchor record | New migration file `0XX-mykobo-anchor.ts` inserting `mykobo_eurc` | Migrations are append-only |
| Permit pattern (cross-chain) | Reuse AlfredPay's `squidRouterPermitExecute` phase + `TokenRelayer.execute()` | TokenRelayer at `0xC9ECD03c89349B3EAe4613c7091c6c3029413785` (Polygon); for EUR offramp, Squidrouter brings funds onto **Base** ephemeral. If source chain doesn't support permit, fall back to `squidRouterApprove + squidRouterSwap` (same as AlfredPay no-permit fallback) |
| Stellar code | **Do not touch** in this session | Remove after Mykobo flow verified end-to-end |

---

## Phase Sequence (EUR-EVM Offramp via Mykobo on Base)

Mirror of BRL-EVM (`evm-to-brl-base.ts`) with USDC→EURC and Mykobo payout.

```
[User wallet, source EVM chain]
  squidRouterApprove  (nonce 0, source chain)   — user approves squid router for input token
  squidRouterSwap     (nonce 1, source chain)   — user swaps via squid → USDC lands on Base ephemeral
  ─ OR (when permit supported) ─
  squidRouterPermitExecute                       — executor calls TokenRelayer.execute(permit + payload)
  ─ OR (when permit NOT supported AND same chain) ─
  squidRouterNoPermitTransfer                    — direct transfer to ephemeral (Base only)

[Backend executor / Base ephemeral]
  fundEphemeral                                  — backend sends ETH for gas
  distributeFees      (nonce 0, Base)            — USDC fee slice to fee wallet
  nablaApprove        (nonce 1, Base)            — approve Nabla router for USDC
  nablaSwap           (nonce 2, Base)            — USDC → EURC on Base Nabla
  mykoboPayoutOnBase  (nonce 3, Base)            — EURC transfer to Mykobo receivables address
                                                   → backend polls GET /v1/transactions/{id} until COMPLETED
  complete

[Cleanup — post-process worker]
  baseCleanupUsdc     (nonce 4, Base)            — approve funding account to sweep residual USDC
  baseCleanupEurc     (nonce 5, Base) [NEW]      — approve funding account to sweep residual EURC
  baseCleanupAxlUsdc  (nonce 6, Base)            — approve funding account to sweep axlUSDC slippage
```

**Special case**: if user is already on Base with USDC, skip the squidrouter leg entirely (same shortcut as BRL-EVM line 73).

---

## Quote Engine Pipeline

New strategy `offrampToSepaEvmStrategy`, mirrors `offrampToPixEvmStrategy`:

```
[StageKey.Initialize]    OffRampFromEvmInitializeEngine(Networks.Base)    [squid quote → Base USDC]
[StageKey.NablaSwap]     OffRampSwapEngineEvm(EvmToken.EURC)              [USDC → EURC on Base Nabla]
[StageKey.Fee]           OffRampFeeMykoboEngine [NEW]                     [GET /v1/fees → EURC fee]
[StageKey.Discount]      OffRampDiscountEngine
[StageKey.MergeSubsidy]  OffRampMergeSubsidyEvmEngine
[StageKey.Finalize]      OffRampFinalizeEngine
```

Route resolver dispatch (in `route-resolver.ts`):

```ts
case "sepa":
  return ctx.from !== Networks.AssetHub
    ? offrampToSepaEvmStrategy   // EVM source → Mykobo
    : offrampToStellarStrategy;  // substrate source → Stellar (unchanged)
```

This preserves the Stellar EUR path for AssetHub sources (we'll remove it in a later session).

---

## File Inventory

### New files (8)

1. `packages/shared/src/services/mykobo/types.ts` — request/response types
2. `packages/shared/src/services/mykobo/mykoboApiService.ts` — singleton HTTP client
3. `packages/shared/src/services/mykobo/index.ts` — re-exports
4. `apps/api/src/api/services/transactions/offramp/routes/evm-to-mykobo.ts` — presigned tx builder
5. `apps/api/src/api/services/phases/handlers/mykobo-payout-handler.ts` — payout handler
6. `apps/api/src/api/services/quote/engines/fee/offramp-mykobo.ts` — fee engine
7. `apps/api/src/api/services/quote/routes/strategies/offramp-to-sepa-evm.strategy.ts` — strategy
8. `apps/api/src/database/migrations/0XX-mykobo-anchor.ts` — anchor seed migration

### Modified files (~12)

1. `packages/shared/src/tokens/types/evm.ts` — add `EURC = "EURC"` to `EvmToken`
2. `packages/shared/src/tokens/evm/config.ts` — EURC entry for `Networks.Base` (`0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42`, 6 decimals); optionally `BaseSepolia`
3. `packages/shared/src/constants/constants.ts` or `apps/api/src/constants/vars.ts` — add `MYKOBO_BASE_URL`, `MYKOBO_ACCESS_KEY`, `MYKOBO_SECRET_KEY`, `MYKOBO_CLIENT_DOMAIN` env vars
4. `apps/api/src/api/services/phases/meta-state-types.ts` — add `mykoboEmail`, `mykoboTransactionId`, `mykoboReceivablesAddress`, `mykoboPayoutTxHash`, `mykoboTransactionReference`
5. `apps/api/src/api/controllers/ramp.controller.ts` + `apps/api/src/api/services/ramp/ramp.service.ts` — accept optional `email` on `POST /v1/ramp/register`; thread to `prepareOfframpTransactions`
6. `apps/api/src/api/services/transactions/offramp/index.ts` — add dispatch branch for EUR EVM
7. `apps/api/src/api/services/ramp/ramp-transaction-preparation.ts` — add `OfframpMykobo` discriminator (next to `OfframpBrl`)
8. `apps/api/src/api/services/phases/handlers/fund-ephemeral-handler.ts` — extend `getRequiresBaseEphemeralAddress()` for EUR offramp
9. `apps/api/src/api/services/phases/register-handlers.ts` — register `MykoboPayoutOnBasePhaseHandler`
10. `apps/api/src/database/seeders/phase-metadata.seeder.ts` (or equivalent) — register `mykoboPayoutOnBase` and `baseCleanupEurc` phases + valid transitions
11. `apps/api/src/api/services/quote/routes/route-resolver.ts` — add EVM-source branch for `sepa` case
12. `apps/api/src/api/services/quote/core/quote-fees.ts` — use `mykobo_eurc` anchor identifier when `to=sepa` and source is EVM
13. `apps/api/src/api/services/phases/post-process/base-chain-post-process-handler.ts` — add `baseCleanupEurc` to cleanup sweep

### Touch validation
- `apps/api/src/api/services/transactions/onramp/common/validation.ts:122` — currently enforces `inputCurrency === FiatToken.EURC` for onramp. **Onramp path is unaffected**; we're only adding offramp. Do not touch.
- `apps/api/src/api/services/transactions/offramp/index.ts:33` — currently `outputCurrency === FiatToken.EURC && moneriumAuthToken` routes to Monerium. Our new branch is `outputCurrency === FiatToken.EURC && isEvmSource && !moneriumAuthToken → Mykobo`. Monerium path stays as fallback for clients that still pass `moneriumAuthToken`.

---

## State Metadata Fields (new on `StateMetadata`)

```ts
mykoboEmail?: string;                  // persistent identity passed by frontend
mykoboTransactionId?: string;          // UUID returned by POST /v1/transactions/intent (for polling)
mykoboTransactionReference?: string;   // human reference from intent response
mykoboReceivablesAddress?: `0x${string}`; // instructions.address from intent (the destination of mykoboPayoutOnBase)
mykoboPayoutTxHash?: `0x${string}`;    // on-chain hash of the EURC transfer (recovery support)
```

---

## Anchor record

Insert into `Anchor` table:

```ts
{
  identifier: "mykobo_eurc",
  name: "Mykobo (EUR via Base)",
  // ... whatever other fields the model requires (TBD by reading model)
}
```

`OffRampFeeMykoboEngine` will look it up via the same path as `offramp-avenia` does for `avenia` anchor.

---

## Env Vars (new)

| Var | Required | Default | Purpose |
|---|---|---|---|
| `MYKOBO_BASE_URL` | yes | — | `https://api-dev.mykobo.app/v1` (dev) or `https://api.mykobo.app/v1` (prod) |
| `MYKOBO_ACCESS_KEY` | yes | — | from Mykobo dashboard |
| `MYKOBO_SECRET_KEY` | yes | — | from Mykobo dashboard |
| `MYKOBO_CLIENT_DOMAIN` | no | (Mykobo defaults to `<network>.mykobo.app`) | client domain for fee scope (e.g. `satoshipay.io`) |

---

## Existing infrastructure reused (no changes needed)

- ✅ `Networks.Base` configured with `supportsRamp: true`
- ✅ `NABLA_ROUTER_BASE` + `NABLA_QUOTER_BASE` constants
- ✅ `calculateNablaSwapOutputEvm()` quote-time helper
- ✅ `addNablaSwapTransactionsOnBase()` tx builder
- ✅ `getEvmFundingAccount(Networks.Base)` for ephemeral derivation
- ✅ `FundEphemeralPhaseHandler.fundEvmEphemeralAccount(state, Networks.Base)` (needs `getRequiresBaseEphemeralAddress` extension)
- ✅ `BaseChainPostProcessHandler` cleanup sweep
- ✅ `createOfframpSquidrouterTransactionsToEvm()` for cross-chain bridge
- ✅ `SquidrouterPermitExecuteHandler` for permit + TokenRelayer
- ✅ `prepareBaseCleanupApproval()` for cleanup approvals
- ✅ `addEvmFeeDistributionTransaction()` for distributing protocol fees

---

## Out of scope for this session

- KYC / profile creation (`POST /v1/profiles`) — separate session
- Frontend changes
- SDK changes
- Removing Stellar EUR code — explicitly deferred to avoid merge conflicts during build-out
- ARS offramp (still goes through Stellar; Mykobo doesn't replace it)

---

## Verification at end of session

1. `bun build:shared`
2. `bun typecheck` clean
3. `bun lint:fix` clean
4. Manual: can a quote request with `from=Base, inputCurrency=USDC, to=sepa, outputCurrency=EUR` produce a quote routed through `offrampToSepaEvmStrategy`?
5. Manual: does `POST /v1/ramp/register` accept `email` and call Mykobo intent API?
6. Integration test with Mykobo dev credentials (deferred to a follow-up — needs credential setup).
