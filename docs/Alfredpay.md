# Alfredpay Onramp Flow — USD, MXN, COP

Alfredpay is a fiat-to-crypto (onramp) and crypto-to-fiat (offramp) payment provider integrated into Vortex. It supports three fiat currencies: **USD** (USA), **MXN** (Mexico), **COP** (Colombia). All three route through the same backend transaction phases; KYC/KYB onboarding differs per country.

---

## Supported Currencies and Countries

| FiatToken | Country | KYC Method |
|---|---|---|
| USD | US | iFrame redirect (Persona) |
| MXN | MX | API form + ID document upload |
| COP | CO | API form + ID document upload |

`isAlfredpayToken` in `packages/shared/src/services/alfredpay/types.ts` gates all three tokens into the Alfredpay path.

---

## Architecture Overview

```
Frontend KYC (XState machine)
        ↓  KYC status = Success
Quote & Transaction Building
        ↓  user confirms ramp + signs all presigned txs
processAlfredpayOnrampStart  (ramp.service.ts)
  POST /penny/onramp { depositAddress: evmEphemeralAddress, quoteId, ... }
  ← fiatPaymentInstructions (bank account / CLABE shown to user)
        ↓  user does manual bank transfer to those instructions
        ↓  Alfredpay receives fiat, mints USDC, sends on-chain to depositAddress
alfredpayOnrampMint phase (backend polls ephemeral balance)
        ↓  USDC lands on ephemeral Polygon address
fundEphemeral (gas top-up)
        ↓
squidRouterApprove + squidRouterSwap  (or direct destinationTransfer if output = Polygon USDC)
        ↓
finalSettlementSubsidy / moonbeamToPend (destination-dependent)
```

---

## Key Files

| Layer | File |
|---|---|
| Machine | `apps/frontend/src/machines/alfredpayKyc.machine.ts` |
| Machine entry | `apps/frontend/src/machines/kyc.states.ts` |
| Root screen orchestrator | `apps/frontend/src/components/Alfredpay/AlfredpayKycFlow.tsx` |
| Frontend API service | `apps/frontend/src/services/api/alfredpay.service.ts` |
| Backend routes | `apps/api/src/api/routes/v1/alfredpay.route.ts` |
| Backend controller | `apps/api/src/api/controllers/alfredpay.controller.ts` |
| Alfredpay HTTP client | `packages/shared/src/services/alfredpay/alfredpayApiService.ts` |
| Shared types | `packages/shared/src/services/alfredpay/types.ts` |
| Onramp phase handler | `apps/api/src/api/services/phases/handlers/alfredpay-onramp-mint-handler.ts` |
| Onramp tx builder | `apps/api/src/api/services/transactions/onramp/routes/alfredpay-to-evm.ts` |
| Onramp quote strategy | `apps/api/src/api/services/quote/routes/strategies/onramp-alfredpay-to-evm.strategy.ts` |
| DB model | `apps/api/src/models/alfredPayCustomer.model.ts` |

---

## Phase 0 — Frontend KYC

### Entry point

`kyc.states.ts` dispatches to `alfredpayKycMachine` when `isAlfredpayToken(fiatToken)` is true. The machine receives `{ country, userId, walletAddress }` as input.

### Machine states (all countries)

| State | Description |
|---|---|
| `CheckingStatus` | GET `/alfredpayStatus?country=XX` — routes based on existing status |
| `CustomerDefinition` | Toggle individual / business; confirm to proceed |
| `CreatingCustomer` | POST `/createIndividualCustomer` or `/createBusinessCustomer` |
| `PollingStatus` | Polls `/getKycStatus` every 5 s, 20-min timeout; `Success` → `VerificationDone` |
| `VerificationDone` | User confirms → `Done` (final) |
| `FailureKyc` | `USER_RETRY` → `Retrying`; `USER_CANCEL` → `Done` |
| `Failure` | Technical error; `RETRY_PROCESS` → `CheckingStatus` |
| `Done` | Final state — machine exits, parent transitions to `KycComplete` |

### USD iFrame flow

```
CheckingStatus → CustomerDefinition → CreatingCustomer
  → GettingKycLink  (GET /getKycRedirectLink)
  → LinkReady       (user clicks "Open KYC Link")
  → OpeningLink     (POST /kycRedirectOpened)
  → FillingKyc      (parallel: polls status; user completes iFrame)
  → FinishingFilling (POST /kycRedirectFinished)
  → PollingStatus   → VerificationDone → Done
```

### MXN / COP API form flow

```
CheckingStatus → CustomerDefinition → CreatingCustomer
  → FillingKycForm   (MxnKycFormScreen or ColKycFormScreen)
  → SubmittingKycInfo (POST /submitKycInformation)
  → UploadingDocuments (MxnDocumentUploadScreen — shared by MX and CO)
  → SubmittingFiles   (POST /submitKycFile × 2: front + back)
  → SendingSubmission (POST /sendKycSubmission)
  → PollingStatus   → VerificationDone → Done
```

### KYB (business) flow — MXN / COP

```
CustomerDefinition (business toggle) → CreatingCustomer (POST /createBusinessCustomer)
  → FillingKybForm   (KybFormScreen)
  → SubmittingKybInfo (POST /submitKybInformation)
    └ returns { submissionId, relatedPersons: [{ id }] }
  → UploadingKybBusinessDocs (KybBusinessDocsScreen — 3 files)
  → SubmittingKybBusinessFiles (POST /submitKybFile × 3)
  → UploadingKybPersonDocs (KybPersonDocsScreen — paginates per person)
  → SubmittingKybPersonFiles (POST /submitKybRelatedPersonFile × 2 per person)
  → SendingKybSubmission (PUT /sendKybSubmission)
  → PollingStatus → VerificationDone → Done
```

### KYB (business) — USD

Same `CustomerDefinition` + `CreatingCustomer`, then routes to `GettingKycLink` (calls `getKybRedirectLink`) and follows the iFrame flow above.

---

## Phase 1 — Quote & Transaction Building

### Quote strategy: `OnrampAlfredpayToEvmStrategy`

Engines run in order:

1. **Initialize** — Calls Alfredpay `POST /penny/quotes` with `chain=MATIC`, `toCurrency=USDC`, `paymentMethodType=BANK`. Stores quote in `ctx.alfredpayMint` (amounts, fees, quoteId, expiration).
2. **Fee** — Returns Alfredpay fee in fiat currency; network fee = 0.
3. **SquidRouter** — Bridge quote: Polygon USDC → destination EVM. Skipped entirely if destination is Polygon USDC.
4. **Finalize** — Seals the quote ticket.

### Transaction building: `prepareAlfredpayToEvmOnrampTransactions`

Pre-condition: customer DB record must have `AlfredPayStatus.Success` — hard failure otherwise.

Built transactions:
- **Polygon USDC destination (direct):** single `destinationTransfer` tx only.
- **All other EVM destinations:** `squidRouterApprove` + `squidRouterSwap` + `destinationTransfer` + fallback swap.

State metadata written: `alfredpayUserId`, `evmEphemeralAddress`, `squidRouterQuoteId`, `squidRouterReceiverId`, `squidRouterReceiverHash`.

---

## Phase 1b — Onramp Order Creation (`processAlfredpayOnrampStart`)

**File:** `apps/api/src/api/services/ramp/ramp.service.ts:1116`

Triggered once all presigned transactions are signed. Runs before the first phase handler.

1. Calls `POST /penny/onramp` with `{ depositAddress: evmEphemeralAddress, quoteId, customerId: alfredpayUserId, amount, chain: MATIC, ... }`
2. Alfredpay responds with `{ transaction: { transactionId }, fiatPaymentInstructions }`
3. Both are stored in `rampState.state` (`alfredpayTransactionId` + `fiatPaymentInstructions`)
4. `fiatPaymentInstructions` (bank account number / CLABE / etc.) are surfaced to the user in the frontend
5. **User manually sends fiat** via bank transfer to those instructions — this step happens entirely outside Vortex
6. Alfredpay receives the fiat, mints USDC on Polygon, and sends it to `depositAddress` (the ephemeral address)

This is the only step that communicates the ephemeral address to Alfredpay and creates the on-chain delivery instruction.

---

## Phase 2 — `alfredpayOnrampMint` (Backend Phase Handler)

**File:** `apps/api/src/api/services/phases/handlers/alfredpay-onramp-mint-handler.ts`

- **Timeout:** 5 minutes
- **Poll interval:** 5 seconds
- Runs two concurrent promises via `Promise.race()`:
  1. `checkEvmBalancePeriodically` — polls USDC balance at ephemeral Polygon address; resolves when balance reaches expected `outputAmountRaw`.
  2. `pollAlfredpayOnrampStatus` — polls Alfredpay `GET /penny/onramp/:transactionId`; only rejects (never resolves) on `FAILED` status; records `alfredpayOnrampMintTxHash` on `ON_CHAIN_COMPLETED`.

**Ground truth is the on-chain balance, not Alfredpay's status.** This prevents race conditions where Alfredpay reports completion before the USDC is confirmably settled.

On resolve → transitions to `fundEphemeral`.  
On FAILED → transitions to `failed`.  
On timeout → throws recoverable error.

---

## Phase 3 — `fundEphemeral`

The ephemeral Polygon account is topped up with native MATIC for gas. Pendulum ephemeral funding is **skipped** for Alfredpay onramps (no Pendulum hop required).

---

## Phase 4 — Bridge / Transfer

| Output destination | Phases |
|---|---|
| Polygon USDC | `destinationTransfer` only |
| Other EVM chain | `squidRouterApprove` → `squidRouterSwap` → `destinationTransfer` |
| AssetHub (Polkadot) | `squidRouterApprove` → `squidRouterSwap` → `moonbeamToPend` |

---

## Colombia-Specific Details

### Frontend: `ColKycFormScreen.tsx`

Colombia-specific fields vs. Mexico:

| Field | Colombia | Mexico |
|---|---|---|
| Document type | `typeDocumentCol` (`CC` or `CE`) | `typeDocument` (`INE`, etc.) |
| DNI format | CC: 10 digits; CE: 6–11 digits | varies |
| Phone number | required | not collected |

The submit callback type reuses `MxnKycFormData` (`Omit<SubmitKycInformationRequest, "country">`). This works at runtime because `typeDocumentCol` and `phoneNumber` both exist on `SubmitKycInformationRequest`.

### Machine: country gate

```typescript
// alfredpayKyc.machine.ts ~L316
guard: ({ context }) => context.country === "MX" || context.country === "CO"
target: "FillingKycForm"
```

Both countries use the API form path. `AlfredpayKycFlow.tsx` distinguishes them for rendering:
```typescript
if (stateValue === "FillingKycForm" && isCo) {
  return <ColKycFormScreen onSubmit={submitForm} />;
}
```

### Backend: selective field stripping

`alfredpayApiService.ts` deletes null fields before POST so each country sends only its own fields:
```typescript
if (!data.typeDocument) delete kycSubmission.typeDocument;
if (!data.typeDocumentCol) delete kycSubmission.typeDocumentCol;
if (!data.phoneNumber) delete kycSubmission.phoneNumber;
```

### Bank network

`AlfredpayFiatAccountType.COELSA` — Colombia's interbank transfer network.

---

## Backend API Endpoints

All routes mounted under `/alfredpay/`, protected by `requireAuth` + `validateResultCountry`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/alfredpayStatus` | Internal + live KYC status |
| POST | `/createIndividualCustomer` | Create individual customer |
| POST | `/createBusinessCustomer` | Create business customer |
| GET | `/getKycRedirectLink` | iFrame URL (USD individual) |
| GET | `/getKybRedirectLink` | iFrame URL (USD business) |
| POST | `/kycRedirectOpened` | Set status → `LINK_OPENED` |
| POST | `/kycRedirectFinished` | Set status → `USER_COMPLETED` |
| GET | `/getKycStatus` | Poll + sync status from Alfredpay |
| POST | `/retryKyc` | Reset failed KYC (form reset for MX/CO; new link for USD/KYB) |
| POST | `/submitKycInformation` | MX/CO individual form data |
| POST | `/submitKycFile` | ID front/back upload (multer, 5 MB limit) |
| POST | `/sendKycSubmission` | Finalize MX/CO KYC |
| POST | `/submitKybInformation` | Business info form |
| POST | `/submitKybFile` | Business document upload |
| POST | `/submitKybRelatedPersonFile` | Related-person ID upload |
| PUT | `/sendKybSubmission` | Finalize KYB (PUT, not POST) |
| POST | `/fiatAccounts` | Register bank account |
| GET | `/fiatAccounts` | List registered bank accounts |
| DELETE | `/fiatAccounts/:fiatAccountId` | Remove bank account |

---

## Database: `alfredpay_customers`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | FK → profiles | |
| `alfred_pay_id` | UUID unique | Alfredpay's own customer ID |
| `country` | ENUM | US / MX / CO |
| `status` | ENUM | CONSULTED / LINK_OPENED / USER_COMPLETED / VERIFYING / FAILED / SUCCESS / UPDATE_REQUIRED |
| `type` | ENUM | INDIVIDUAL / BUSINESS |
| `last_failure_reasons` | string[] | |
| `status_external` | string | Raw status string from Alfredpay |

Customer must have `status = SUCCESS` before any transaction can be prepared.

---

## Known Gotchas

1. **`sendKybSubmission` uses PUT, not POST.** All other file/form submissions use POST. This matches Alfredpay's API design for finalizing KYB.

2. **KYB retry on Alfredpay is a no-op.** `retryKybSubmission` returns `{ message: "ok" }` — Alfredpay has no dedicated KYB retry endpoint. The controller handles retry by fetching a new verification URL.

3. **KYB actors default country to `"MX"`.** If `context.country` is unset inside a KYB actor, it falls back to MX — a silent bug for Colombia KYB if machine context is ever missing.

4. **Balance check is ground truth, not Alfredpay status.** `pollAlfredpayOnrampStatus` never resolves (only rejects on FAILED). `checkEvmBalancePeriodically` resolves the race. This prevents acting on an Alfredpay status that arrives before the block is finalized.

5. **All Alfredpay minting happens on Polygon.** `chain=MATIC` is hardcoded in the quote. The SquidRouter bridge to other EVM chains is always a second step.
