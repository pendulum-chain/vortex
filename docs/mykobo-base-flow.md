# Mykobo + EURC-on-Base — Implementation Summary

Branch: `feat/mykobo-base-frontend`
Status: BUY (fiat → EURC → cross-chain on-ramp) and SELL (EVM → EURC on Base → fiat) end-to-end on Base / Base Sepolia, replacing Monerium for Base routing. Monerium remains live for Polygon EURe.

---

## 1. Architecture

Two parallel EUR ramps coexist, discriminated by destination/source network:

| Currency | Network | Anchor |
|---|---|---|
| EURC | Base / BaseSepolia | **Mykobo** (new) |
| EURe / EURC | Polygon | Monerium (existing) |

Routing is centralized through `isBaseEvmNetwork(network)` in `apps/api/src/api/services/mykobo/index.ts`. Every dispatcher and validator that touches EURC checks that helper before choosing the Mykobo or Monerium branch.

### BUY (Onramp)

```
User → bank SEPA → Mykobo settlement
                       ↓ mints EURC on Base into Mykobo wallet
        backend polls Base balance (mykoboOnrampDeposit)
                       ↓
        EIP-2612 permit + transferFrom → ephemeral (mykoboOnrampTransfer)
                       ↓
        Squidrouter swap → destination chain/token (squidRouterSwap)
                       ↓
        destinationTransfer → user wallet
                       ↓
        complete
```

### SELL (Offramp)

```
User (Base wallet) signs:
  - if input already EURC on Base: single ERC-20 transfer to MYKOBO_SETTLEMENT_ADDRESS
  - otherwise: Squidrouter swap (any Base ERC-20 → EURC on Base) with destination = MYKOBO_SETTLEMENT_ADDRESS
                       ↓
        Mykobo detects receipt → SEPA payout to linked bank
```

No substrate ephemeral, no Pendulum, no XCM on the Mykobo path — everything stays on Base.

---

## 2. Backend

### 2.1 Mykobo service (`apps/api/src/api/services/mykobo/index.ts`)

HTTP client + helpers. Single source of truth for network constant and KYC types.

| Export | Purpose |
|---|---|
| `MYKOBO_BASE_NETWORK: EvmNetworks` | `BaseSepolia` if `SANDBOX_ENABLED`, else `Base` |
| `isBaseEvmNetwork(n)` | Network discriminator used everywhere routing decides Mykobo vs Monerium |
| `getMykoboProfile(walletAddress)` | `GET /profiles?address=` — returns `null` on 404 |
| `createMykoboProfile(formData)` | `POST /profiles` multipart — KYC submission |
| `getMykoboDepositInstructions(walletAddress)` | Returns `{ iban, bic, receiverName, reference?, depositQrCode? }` |
| `getMykoboSettlementAddress()` | Env-configured SEPA settlement address (SELL destination) |
| `verifyMykoboWebhookSignature(payload, sig)` | HMAC-SHA256 with `timingSafeEqual` |

Types: `MykoboProfile`, `MykoboKycStatus { reviewStatus: "pending" | "approved" | "rejected" }`, `MykoboDepositInstructions`.

Base URL toggles between `https://api.sandbox.mykobo.co` and `https://api.mykobo.co` via `SANDBOX_ENABLED`.

### 2.2 Controller + routes

`apps/api/src/api/controllers/mykobo.controller.ts`:
- `getProfileController` — `GET /v1/mykobo/profiles?address=…`
- `createProfileController` — `POST /v1/mykobo/profiles` (multipart: text fields + 4 file fields: `front`, `back`, `face`, `utility_bill`)
- `kycWebhookController` — `POST /v1/mykobo/webhook`. Verifies HMAC signature, ACKs with 204. Intentional stub: frontend polls `kycStatus.reviewStatus` directly, so the webhook doesn't need to advance state yet.

`apps/api/src/api/routes/v1/mykobo.route.ts`: registers the three endpoints with multer storing files in memory (10 MB cap). Mounted at `/v1/mykobo` from `apps/api/src/api/routes/v1/index.ts:184`.

### 2.3 Quote engines

| Stage | Onramp | Offramp |
|---|---|---|
| Initialize | `onramp-mykobo.ts` → `OnRampInitializeMykoboEngine` (sets `ctx.mykoboMint`) | `offramp-mykobo.ts` → `OffRampInitializeMykoboEngine` (sets `ctx.mykoboOffRamp`) |
| Fee | `onramp-mykobo-to-evm.ts` → zero fees in all components | `offramp-evm-to-mykobo.ts` → zero fees |
| SquidRouter | `OnRampSquidRouterMykoboBaseToEvmEngine` (Base → toNetwork) | n/a (handled in offramp init when input != EURC) |
| Finalize | `OnRampFinalizeEngine` (shared) | `OffRampFinalizeEngine` + `OffRampDiscountEngine` |

Strategies:
- `onramp-mykobo-to-evm.strategy.ts` → stages `[Initialize, Fee, SquidRouter, Finalize]`
- `offramp-evm-to-mykobo.strategy.ts` → stages `[Initialize, Fee, Discount, Finalize]`

Route resolver (`apps/api/src/api/services/quote/routes/route-resolver.ts`) selects the strategy:
- BUY + EURC + `isBaseEvmNetwork(quote.to)` → Mykobo strategy
- SELL + EURC + `isBaseEvmNetwork(quote.from)` → Mykobo strategy
- Otherwise → Monerium

Quote context (`apps/api/src/api/services/quote/core/types.ts`) gained two optional fields:
```ts
mykoboMint?:    { currency; fee: Big; inputAmountDecimal; inputAmountRaw; outputAmountDecimal; outputAmountRaw }
mykoboOffRamp?: { currency; fee: Big; inputAmountDecimal; inputAmountRaw; outputAmountDecimal; outputAmountRaw }
```

### 2.4 Phase handlers

Two new handlers registered in `apps/api/src/api/services/phases/register-handlers.ts`:

**`mykobo-onramp-deposit-handler.ts`** — phase `"mykoboOnrampDeposit"`
- Polls EURC balance on Base for `mykoboWalletAddress` via `checkEvmBalancePeriodically` (1 s tick, 5 min check window, 30 min overall payment timeout).
- On balance arrival: 30 s settle delay (avoids reading pre-finality state), transition to `mykoboOnrampTransfer`.
- On total payment timeout: transition to `failed`.
- On check timeout (still within payment window): throws recoverable error → retry.

**`mykobo-onramp-transfer-handler.ts`** — phase `"mykoboOnrampTransfer"`
- Recovery shortcut: if EURC already on ephemeral, skip and advance to `squidRouterSwap`.
- `submitPermitIfNeeded`: sends EIP-2612 `permit(owner, spender, value, deadline, v, r, s)` on `ERC20_EURC_BASE` from `MOONBEAM_EXECUTOR_PRIVATE_KEY`. Stores `mykoboPermitTxHash` in state so reruns skip.
- `submitPresignedTransferFrom`: broadcasts the user-presigned `transferFrom` tagged `mykoboOnrampTransfer` from `state.unsignedTxs`.
- 30 s settle delay → transition to `squidRouterSwap`.
- Errors → `createRecoverableError` so the orchestrator retries.

Both handlers use `MYKOBO_BASE_NETWORK` (auto-switches per `SANDBOX_ENABLED`).

### 2.5 Transaction preparation

**Onramp** — `apps/api/src/api/services/transactions/onramp/routes/mykobo-to-evm.ts`:

`prepareMykoboToEvmOnrampTransactions(params: MykoboOnrampTransactionParams)` builds, in order, on the Base ephemeral:

1. `mykoboOnrampTransfer` — `createMykoboPullToEphemeralOnBase` (presigned `transferFrom` Mykobo wallet → ephemeral)
2. `squidRouterApprove` — EURC → squidrouter allowance
3. `squidRouterSwap` — Base EURC → destination token on `toNetwork`
4. `destinationTransfer` — final transfer from ephemeral to user
5. **Backup route** (via `appendBackupRouteTransactions`): if the cross-chain swap lands bridged USDC/AXLUSDC instead of the user's chosen output, the funding account can finish the swap on the destination chain.
   - `backupSquidRouterApprove`, `backupSquidRouterSwap`: same-chain swap from bridged token to output token
   - `backupApprove`: max-uint256 approval of the bridged token to `MOONBEAM_FUNDING_PRIVATE_KEY`'s account

Per-network nonce allocator via `Map<Networks, number>`; same-chain destinations (Base → Base) collapse to one counter automatically. `pushTx` helper encapsulates the nonce/append pattern.

`stateMeta` returned: `{ destinationAddress, evmEphemeralAddress, mykoboWalletAddress, squidRouterQuoteId, squidRouterReceiverId, squidRouterReceiverHash, walletAddress }`.

Validation flows through `validateMykoboOnramp` in `apps/api/src/api/services/transactions/onramp/common/validation.ts` — returns narrowed types `{ toNetwork: EvmNetworks, outputTokenDetails, evmEphemeralEntry, inputCurrency: FiatToken.EURC }`, throws if input ≠ EURC or destination isn't EVM.

**Offramp** — `apps/api/src/api/services/transactions/offramp/routes/evm-to-mykobo-evm.ts`:

`prepareEvmToMykoboOfframpTransactions({ quote, userAddress })`:
- Requires `fromNetwork === MYKOBO_BASE_NETWORK`.
- If input is already EURC on Base (`addressesEqual(inputToken.erc20AddressSourceChain, ERC20_EURC_BASE)`): single ERC-20 `transfer` tx tagged `destinationTransfer`, target = `MYKOBO_SETTLEMENT_ADDRESS`.
- Otherwise: Squidrouter `approve` + `swap` with `destinationAddress = MYKOBO_SETTLEMENT_ADDRESS`, `toNetwork = MYKOBO_BASE_NETWORK`, `toToken = ERC20_EURC_BASE`.

### 2.6 RampService dispatch

`apps/api/src/api/services/ramp/ramp.service.ts`:

- `prepareMykoboOnrampTransactions(quote, accounts, additionalData)` — requires `walletAddress` + `destinationAddress`. Calls `getMykoboDepositInstructions(walletAddress)` and forwards to `prepareMykoboToEvmOnrampTransactions`. Returns `{ unsignedTxs, stateMeta, depositQrCode, ibanPaymentData }`.
- `prepareMykoboOfframpTransactions(quote, accounts, additionalData)` — requires `walletAddress`, forwards to `prepareEvmToMykoboOfframpTransactions`.
- `dispatchRampTransactions` discriminates by network:
  - BUY: `inputCurrency === EURC && isBaseEvmNetwork(quote.to)` → Mykobo, else → Monerium
  - SELL: `outputCurrency === EURC && isBaseEvmNetwork(quote.from)` → Mykobo, else → Monerium (which still requires `moneriumAuthToken`)
- `validateRampStateData` BUY branch checks the right permit field per route:
  ```ts
  const isMykoboBuy = isBaseEvmNetwork(rampState.to);
  const permitName = isMykoboBuy ? "mykoboOnrampPermit" : "moneriumOnrampPermit";
  const permit = isMykoboBuy ? rampState.state.mykoboOnrampPermit : rampState.state.moneriumOnrampPermit;
  if (!permit) throw new APIError({ message: `Missing ${permitName} in state. Cannot proceed.`, status: BAD_REQUEST });
  ```
- Mykobo SELL also has its own `squidRouterSwapHash` / `destinationTransferTxHash` validation branch.

### 2.7 State metadata extensions

`apps/api/src/api/services/phases/meta-state-types.ts`:
- `mykoboWalletAddress: string | undefined`
- `mykoboOnrampPermit?: PermitSignature`
- `mykoboPermitTxHash?: string`

### 2.8 Constants

`apps/api/src/constants/constants.ts`:
- `MYKOBO_API_KEY`
- `MYKOBO_SETTLEMENT_ADDRESS`
- `MYKOBO_WEBHOOK_SECRET`

### 2.9 Phase registry

`apps/api/src/api/services/phases/register-handlers.ts` registers both `mykoboOnrampDepositPhaseHandler` and `mykoboOnrampTransferPhaseHandler`. Phase metadata for the two new phases is seeded alongside Monerium's entries.

---

## 3. Shared package (`@vortexfi/shared`)

`packages/shared/src/endpoints/ramp.endpoints.ts`:
- `RampPhase` union gained `"mykoboOnrampDeposit"` and `"mykoboOnrampTransfer"`.
- `UpdateRampRequest.additionalData.mykoboOnrampPermit?: PermitSignature`.
- `IbanPaymentData` already supports an optional `reference?: string` (used for Mykobo SCOR; Monerium ignores it).

`packages/shared/src/tokens/base/eurcMykoboTokenConfig.ts`:
- `eurcMykoboTokenConfig: Partial<Record<FiatToken, FiatCurrencyDetails>>` with `assetSymbol: "EURC"`, `decimals: 6`, EUR fiat metadata, and min/max raw amounts (`minBuy 1000`, `minSell 25000`, `maxBuy/Sell 10_000_000_000`).

Constants exported from shared: `ERC20_EURC_BASE` (Base EURC address `0x60a3…b42`), `ERC20_EURC_BASE_DECIMALS = 6`.

After any change here: `bun build:shared`.

---

## 4. Frontend

### 4.1 KYC machine — `apps/frontend/src/machines/mykoboKyc.machine.ts`

XState v5 (`setup({}).createMachine`). States:
```
CheckingProfile
  → approved   → Done
  → pending    → Verifying
  → not found  → FormFilling

FormFilling
  → SubmitKycForm → Submitting
  → CANCEL        → Failure (UserRejected)

Submitting → Verifying

Verifying  (polls /profiles every 5 s, 20 min cap)
  → approved → Done
  → rejected → Rejected
  → error    → Failure

Done | Rejected | Failure  (final)
```

Polling uses an `AbortSignal`-aware sleep so cancellation propagates immediately. 4xx errors (other than 404) fail fast; other transient errors are logged and retried. Final output: `{ profileApproved?, error? }`.

Error type `MykoboKycMachineError` with discriminants `UserRejected`, `KycRejected`, `UnknownError`.

### 4.2 KYC flow component — `apps/frontend/src/components/Mykobo/MykoboKycFlow.tsx`

Renders one of: `LoadingPanel` (`CheckingProfile`, `Submitting`, `Verifying`), `MykoboKycForm` (`FormFilling`), success copy (`Done`), `ErrorPanel` (`Rejected`, `Failure`). Wired through `useMykoboKycActor` / `useMykoboKycSelector`.

`MykoboKycForm` collects text profile fields + 4 files (`front`, `back`, `face`, `utility_bill`) and POSTs via `MykoboService.createProfile` (multipart through `apps/frontend/src/services/api/mykobo.service.ts`).

### 4.3 KYC routing — `apps/frontend/src/machines/kyc.states.ts`

```ts
[FiatToken.EURC]: { actorId: "mykoboKyc", target: "Mykobo" }
```

`Mykobo` state in the parent `kyc` machine invokes `mykoboKyc`, then routes on output: approved → next phase; `UserRejected` → user-cancel state; otherwise → init-failed with the machine's error message.

`ramp.machine.ts` registers `mykoboKyc: mykoboKycMachine` as a child actor.

### 4.4 Deposit instructions UI

The existing `EUROnrampDetails` component renders on `rampState.ramp.ibanPaymentData` (no longer gated on `depositQrCode`). When Mykobo returns a `reference` it's displayed with a copy-button; when no QR is returned the hint text switches to `hintNoQr`. `TransactionTokensDisplay` wires it in for `RampDirection.BUY && fiatToken === EURC`. The submit-button gate (`RampSubmitButton`) treats `ibanPaymentData` as a valid ready signal in addition to `depositQrCode` / `achPaymentData`.

---

## 5. Configuration

Required env vars:
- `MYKOBO_API_KEY` — bearer token for `api.mykobo.co` / sandbox
- `MYKOBO_SETTLEMENT_ADDRESS` — Mykobo's EVM address that receives EURC on Base for SELL payouts
- `MYKOBO_WEBHOOK_SECRET` — HMAC-SHA256 secret for `/v1/mykobo/webhook`
- `SANDBOX_ENABLED` — toggles both API base URL and `MYKOBO_BASE_NETWORK` (`Base` ↔ `BaseSepolia`)

---

## 6. End-to-end flows

### BUY
1. Widget: EUR → on-chain token (e.g. USDC) → Base.
2. `MykoboKycFlow` collects profile + docs, polls until `approved`.
3. `RegisterRamp` POSTs `/v1/ramp/register` with `{ inputCurrency: EURC, to: base, additionalData: { walletAddress, destinationAddress } }`.
4. Dispatcher → `prepareMykoboOnrampTransactions`. Response contains `ibanPaymentData` (+ optional `depositQrCode`, `reference`).
5. `EUROnrampDetails` shows bank details. User pays and clicks "I have made the payment" → `PAYMENT_CONFIRMED`.
6. Backend phases: `mykoboOnrampDeposit` (polls Base balance) → `mykoboOnrampTransfer` (permit + transferFrom) → `squidRouterSwap` → `destinationTransfer` → `complete`.

### SELL
1. Widget: USDC (or EURC) on Base → EUR.
2. Connect Base wallet, submit. Dispatcher → `prepareMykoboOfframpTransactions` (no `moneriumAuthToken` needed because of network discrimination).
3. Unsigned txs: either a direct EURC `transfer` to `MYKOBO_SETTLEMENT_ADDRESS`, or Squidrouter (`approve` + `swap`) landing EURC on Base at the settlement address.
4. User signs. Mykobo detects receipt and pays out EUR to the linked bank.

---