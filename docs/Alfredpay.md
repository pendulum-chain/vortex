# Alfredpay Onramp Flow — USD, MXN, COP, ARS

Alfredpay is a fiat-to-crypto (onramp) and crypto-to-fiat (offramp) payment provider integrated into Vortex. It supports **USD** (USA), **MXN** (Mexico), **COP** (Colombia), and **ARS** (Argentina). These currencies route through the same backend transaction phases; KYC/KYB onboarding differs per country.

---

## Supported Currencies and Countries

| FiatToken | Country | KYC Method |
|---|---|---|
| USD | US | iFrame redirect (Persona) |
| MXN | MX | API form + ID document upload |
| COP | CO | API form + ID document upload |
| ARS | AR | API form + ID document upload |

`isAlfredpayToken` in `packages/shared/src/services/alfredpay/types.ts` gates these fiat tokens into the Alfredpay path.

---

## Architecture Overview

```
Frontend KYC (XState machine)
        ↓  KYC status = Success
Block flow simulation & transaction preparation
        ↓  user confirms ramp + signs all presigned txs
AlfredpayMint.start  (phases/blocks/phases/alfredpay-mint/lifecycle.ts)
  POST /penny/onramp { depositAddress: evmEphemeralAddress, quoteId, ... }
  ← fiatPaymentInstructions (bank account / CLABE shown to user)
        ↓  user does manual bank transfer to those instructions
        ↓  Alfredpay receives fiat, mints USDT, sends on-chain to depositAddress
alfredpayOnrampMint phase (backend polls ephemeral balance)
        ↓  USDT lands on ephemeral Polygon address
fundEphemeral (gas top-up)
        ↓
squidRouterSwap  (or explicit passthrough if output = Polygon USDT)
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
| Onramp block flow | `apps/api/src/api/services/phases/blocks/flows/alfredpay-onramp-direct.ts`, `alfredpay-onramp-cross-chain.ts` |
| Onramp provider phase | `apps/api/src/api/services/phases/blocks/phases/alfredpay-mint/` |
| Routing phase | `apps/api/src/api/services/phases/blocks/phases/squid-router-swap/` |
| Flow catalog | `apps/api/src/api/services/phases/blocks/flows/catalog.ts` |
| DB model | `apps/api/src/models/providerCustomer.model.ts` |

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

## Phase 1 — Flow Simulation & Transaction Preparation

### Catalog flows

`flows/catalog.ts` selects `AlfredpayOnrampDirect` for Polygon destinations and
`AlfredpayOnrampCrossChain` for other supported EVM destinations. The composed
phases run in order:

1. **AlfredpayMint** — Calls Alfredpay `POST /penny/quotes` with `chain=MATIC`, the configured Alfredpay on-chain token, and `paymentMethodType=BANK`; stores quote facts under `metadata.blocks.alfredpayMint`.
2. **FundEphemeral** — Models Polygon gas funding.
3. **AlfredpaySubsidizePre** — Computes the bounded pre-route subsidy.
4. **SquidRouterPassthrough / SameChainSquidRouterSwap / SquidRouterSwap** — Selected statically from the destination token and network.
5. **FinalSettlementSubsidy + DestinationTransfer** — Ensures and delivers the quoted destination amount.

### Transaction preparation

`Flow.register` requires a KYC-approved Alfredpay customer. Each phase's
`prepareTxs` hook emits its own nonce-free transaction intents, and
`Flow.prepareTxs` allocates Polygon/destination nonce lanes.

Built transactions:
- **Polygon USDT destination (passthrough):** `destinationTransfer` plus cleanup/fallback intents owned by their phases.
- **Other Polygon tokens:** same-chain Squid swap followed by `destinationTransfer`.
- **Other EVM destinations:** Squid approve/swap, destination backup, and `destinationTransfer` intents.

State metadata written: `alfredpayUserId`, `evmEphemeralAddress`, `squidRouterQuoteId`, `squidRouterReceiverId`, `squidRouterReceiverHash`.

---

## Phase 1b — Onramp Order Creation (`AlfredpayMint.start`)

**File:** `apps/api/src/api/services/phases/blocks/phases/alfredpay-mint/lifecycle.ts`

Triggered once all presigned transactions are signed. Runs before the first phase handler.

1. Calls `POST /penny/onramp` with `{ depositAddress: evmEphemeralAddress, quoteId, customerId: alfredpayUserId, amount, chain: MATIC, ... }`
2. Alfredpay responds with `{ transaction: { transactionId }, fiatPaymentInstructions }`
3. Both are stored in `rampState.state` (`alfredpayTransactionId` + `fiatPaymentInstructions`)
4. `fiatPaymentInstructions` (bank account number / CLABE / etc.) are surfaced to the user in the frontend
5. **User manually sends fiat** via bank transfer to those instructions — this step happens entirely outside Vortex
6. Alfredpay receives the fiat, mints USDC on Polygon, and sends it to `depositAddress` (the ephemeral address)

This is the only step that communicates the ephemeral address to Alfredpay and creates the on-chain delivery instruction.

---

## Phase 2 — `alfredpayOnrampMint` (Block Executor)

**File:** `apps/api/src/api/services/phases/blocks/phases/alfredpay-mint/execution.ts`

- **Timeout:** 5 minutes
- **Poll interval:** 5 seconds
- Runs two concurrent promises via `Promise.race()`:
  1. `checkEvmBalancePeriodically` — polls the configured Alfredpay token balance at the ephemeral Polygon address; resolves when balance reaches expected `outputAmountRaw`.
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
| Polygon USDT | `squidRouterSwap` passthrough → `finalSettlementSubsidy` → `destinationTransfer` |
| Other Polygon token | same-chain `squidRouterSwap` → `finalSettlementSubsidy` → `destinationTransfer` |
| Other supported EVM chain | `squidRouterSwap` → `squidRouterPay` → `finalSettlementSubsidy` → `destinationTransfer` |

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
| POST | `/submitKybInformation` | Business info form (updates a `PENDING`/`CREATED` submission in place via Alfredpay's `PUT …/customers/kyb` instead of POSTing a new one) |
| POST | `/submitKybFile` | Business document upload |
| POST | `/submitKybRelatedPersonFile` | Related-person ID upload |
| PUT | `/sendKybSubmission` | Finalize KYB (PUT, not POST) |
| POST | `/fiatAccounts` | Register bank account |
| GET | `/fiatAccounts` | List registered bank accounts |
| DELETE | `/fiatAccounts/:fiatAccountId` | Remove bank account |

---

## Database: `provider_customers`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `customer_entity_id` | FK → customer_entities | Canonical owner |
| `provider` | string | `alfredpay` |
| `provider_customer_id` | string | Alfredpay's durable customer ID |
| `country` | string | US / MX / CO / AR |
| `status` | shared verification enum | Canonical KYC/KYB status |
| `type` | string | individual / business |
| `status_external` | string | Normalized provider status |

Customer must have canonical approved status before ramp registration succeeds.

---

## Known Gotchas

1. **`sendKybSubmission` uses PUT, not POST.** All other file/form submissions use POST. This matches Alfredpay's API design for finalizing KYB.

2. **KYB retry on Alfredpay is a no-op.** `retryKybSubmission` returns `{ message: "ok" }` — Alfredpay has no dedicated KYB retry endpoint. The controller handles retry by fetching a new verification URL.

2a. **A `PENDING` submission blocks fresh POSTs.** Alfredpay reports a created-but-never-finalized (or invalid-data) submission as `PENDING` — a status outside the CREATED/IN_REVIEW/COMPLETED/FAILED/UPDATE_REQUIRED set the decisive mappers handle. A fresh POST meanwhile fails with `400 {"errorCode":111405,"errorMessage":"Customer KYB already exists"}`. `PENDING` maps to our canonical `pending` (resumable, not rejected), and `submitKybInformation` detects it (or recovers from the 111405 POST error) and calls Alfredpay's `PUT /api/v1/third-party-service/penny/customers/kyb` (`updateKybInformation`) to update the submission in place, returning the existing `submissionId`. Resolution of that id tries `GET …/customers/kyb/{customerId}` first and falls back to `GET …/kyb/details` (the last-submission response can omit `submissionId` in sandbox). The latest submission id is persisted on the account's `kyc_cases.providerCaseId`. Status strings from Alfredpay arrive in inconsistent casing (sandbox KYB reports lowercase `pending`) — all comparisons and `status_external` writes go through `normalizeAlfredpayProviderStatus` (uppercase).

3. **KYB actors default country to `"MX"`.** If `context.country` is unset inside a KYB actor, it falls back to MX — a silent bug for Colombia KYB if machine context is ever missing.

4. **Balance check is ground truth, not Alfredpay status.** `pollAlfredpayOnrampStatus` never resolves (only rejects on FAILED). `checkEvmBalancePeriodically` resolves the race. This prevents acting on an Alfredpay status that arrives before the block is finalized.

5. **All Alfredpay minting happens on Polygon.** `chain=MATIC` is hardcoded in the quote. The SquidRouter bridge to other EVM chains is always a second step.
