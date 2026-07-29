# Mykobo EUR Offramp Integration

**Status**: Implemented in the block flow catalog
**Stellar EUR offramp**: removed

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
| USDC → EURC swap venue | Nabla EURC pool on Base (`NABLA_ROUTER_BASE_EURC` / `NABLA_QUOTER_BASE_EURC`, selected via `getNablaBasePool()`) | Dedicated EURC<>USDC pool, separate from the BRLA<>USDC pool used by BRL flows |
| `wallet_address` on Mykobo intent | Ephemeral 0x | Mykobo auto-binds email→ephemeral; identity is email-based |
| When to create intent | At ramp **registration** (`MykoboOfframpPayout.register`) | Lets the phase prepare the final EURC transfer to Mykobo's receivables address |
| Email source | Frontend reads the Supabase-authenticated user's email and passes it as the `email` query param to `GET /v1/mykobo/profiles`; backend cross-checks the param against `req.userEmail` and queries Mykobo by email via `MykoboApiService.getProfileByEmail` | Aligns with Supabase-auth profile model; avoids leaking wallet→profile linkage |
| Identity persistence | JSONB only on `RampState.state` (no new `MykoboCustomer` table yet) | "No over-engineering" rule; KYC session can normalize later |
| Mykobo client style | Singleton class mirroring `BrlaApiService` | Repo convention; easy mocking |
| Token strategy | Single shared bearer with all 3 scopes, lazy init, 401→refresh→re-acquire | Simplest robust model; matches docs |
| Fee currency | Returned as EURC directly from Mykobo (no conversion) | Confirmed by user with live API output |
| Fee lookup | Live Mykobo `/fees` through `phases/blocks/core/mykobo-fee.ts` | Keeps provider pricing phase-owned |
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

## Block Flow

`apps/api/src/api/services/phases/blocks/flows/eur-offramp-base.ts` composes the
EUR offramp. `flows/catalog.ts` selects it for supported EVM sources:

```
EvmOfframpSource          source transfer/Squid plan → Base USDC
DistributeFees            deduct USDC fees
SubsidizePre              top up before Nabla
NablaSwap                 USDC → EURC on Base
MykoboOfframpFee          GET /v1/fees and payout amount
SubsidizePost             bounded final top-up
MykoboOfframpPayout       registration, payout tx, execution, and polling
```

---

## File Inventory

### Provider and block implementation

1. `packages/shared/src/services/mykobo/types.ts` — request/response types
2. `packages/shared/src/services/mykobo/mykoboApiService.ts` — singleton HTTP client
3. `packages/shared/src/services/mykobo/index.ts` — re-exports
4. `apps/api/src/api/services/phases/blocks/flows/eur-offramp-base.ts` — typed corridor composition
5. `apps/api/src/api/services/phases/blocks/phases/evm-offramp-source/` — source simulation, registration, and user transaction plan
6. `apps/api/src/api/services/phases/blocks/phases/mykobo-offramp-fee/` — Mykobo fee simulation
7. `apps/api/src/api/services/phases/blocks/phases/mykobo-offramp-payout/` — intent registration, payout transaction, executor, and polling

### Other integration points

1. `packages/shared/src/tokens/types/evm.ts` — add `EURC = "EURC"` to `EvmToken`
2. `packages/shared/src/tokens/evm/config.ts` — EURC entry for `Networks.Base` (`0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42`, 6 decimals); optionally `BaseSepolia`
3. `packages/shared/src/constants/constants.ts` or `apps/api/src/constants/vars.ts` — add `MYKOBO_BASE_URL`, `MYKOBO_ACCESS_KEY`, `MYKOBO_SECRET_KEY`, `MYKOBO_CLIENT_DOMAIN` env vars
4. `apps/api/src/api/services/phases/meta-state-types.ts` — add `mykoboEmail`, `mykoboTransactionId`, `mykoboReceivablesAddress`, `mykoboPayoutTxHash`, `mykoboTransactionReference`
5. `apps/api/src/api/controllers/ramp.controller.ts` + `apps/api/src/api/services/ramp/ramp.service.ts` — accept Mykobo registration input and invoke the persisted flow
6. `apps/api/src/api/services/phases/blocks/flows/catalog.ts` — select `EurOfframpBase`
7. `apps/api/src/api/services/phases/blocks/core/flow.ts` — run phase-owned registration and preparation hooks
8. `apps/api/src/api/services/phases/blocks/phases/fund-ephemeral/` — Base funding and source-hash verification
9. `apps/api/src/api/services/phases/blocks/register-handlers.ts` — register catalog-derived executors
10. `apps/api/src/database/seeders/phase-metadata.seeder.ts` (or equivalent) — register `mykoboPayoutOnBase` and `baseCleanupEurc` phases + valid transitions
11. `apps/api/src/api/services/phases/blocks/phases/mykobo-offramp-fee/simulation.ts` — resolve the live Mykobo withdrawal fee
13. `apps/api/src/api/services/phases/post-process/base-chain-post-process-handler.ts` — add `baseCleanupEurc` to cleanup sweep

There is no route resolver, quote-engine pipeline, or corridor transaction
dispatcher. The catalog rejects unsupported/non-EVM EUR offramp sources.

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
- ✅ `NABLA_ROUTER_BASE_EURC` + `NABLA_QUOTER_BASE_EURC` constants (EURC pool) and `getNablaBasePool()` selector
- ✅ `calculateNablaSwapOutputEvm()` quote-time helper
- `phases/blocks/phases/nabla-swap/` owns Nabla simulation, transactions, and executors
- ✅ `getEvmFundingAccount(Networks.Base)` for ephemeral derivation
- `phases/blocks/phases/fund-ephemeral/` owns Base ephemeral funding
- ✅ `BaseChainPostProcessHandler` cleanup sweep
- `phases/blocks/phases/evm-offramp-source/` owns source transfers and Squid transaction plans
- `phases/blocks/phases/mykobo-offramp-payout/` owns payout and cleanup intents
- `phases/blocks/phases/distribute-fees/` owns protocol fee transactions

---

## Out of scope for this session

- KYC / profile creation (`POST /v1/profiles`) — separate session
- Frontend changes
- SDK changes
- Non-EVM EUR offramp sources

---

## Verification at end of session

1. `bun build:shared`
2. `bun typecheck` clean
3. `bun lint:fix` clean
4. Manual: can a quote request with `from=Base, inputCurrency=USDC, to=sepa, outputCurrency=EUR` resolve `EurOfframpBase`?
5. Manual: does `POST /v1/ramp/register` accept `email` and call Mykobo intent API?
6. Integration test with Mykobo dev credentials (deferred to a follow-up — needs credential setup).
