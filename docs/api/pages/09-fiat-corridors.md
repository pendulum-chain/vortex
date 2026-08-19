# Fiat Corridors

This page collects what each fiat corridor requires before a ramp can be registered: the payment rail, the identity and KYC prerequisites, and the payout details. For the quote request shape see [Quotes And Pricing](https://api-docs.vortexfinance.co/quotes-and-pricing); for runnable examples see [Quick Start With The SDK](https://api-docs.vortexfinance.co/quick-start-with-the-sdk). Where a corridor supports onboarding through the API instead of the Vortex app or Widget, the machine-readable flow is published by requirements discovery (next section) and the behavioral rules live in this page's corridor sections.

## Discovering Onboarding Requirements

```http
GET /v1/onboarding/requirements?country=BR&customerType=business
```

This public, unauthenticated endpoint returns the static onboarding flow for a country (ISO 3166-1 alpha-2) and customer type (`individual` or `business`). Both query values are case-insensitive. An incomplete or invalid query returns `400` (`INVALID_ONBOARDING_REQUIREMENTS_QUERY`); a combination Vortex does not support returns `404` (`ONBOARDING_REQUIREMENTS_NOT_FOUND`). The response contains no profile state and no PII — it is a workflow index, not a status API.

The response identifies the `flow`, `provider`, and `mode` (`api`, `hosted`, or `hybrid`), the `documents` to collect (with accepted media types or collection method), and ordered `steps`. Each `api` step names the OpenAPI `operationId`, `method`, `path`, and a `requestSchema` pointer to resolve against the response's `openapiUrl`; steps may also carry `fixedBody`/`fixedQuery` values to send verbatim, `derivedValues` mappings that connect a field to an earlier step's response, a `condition` for conditional steps, and `repeatFor` when the step runs once per document or person. `direct-upload` steps are plain HTTP `PUT`s of file bytes to presigned URLs returned by the preceding API step; `hosted` steps open a provider-controlled URL.

Two rules keep the contract unambiguous:

- **OpenAPI is authoritative for shapes.** Discovery never duplicates request fields or schemas; resolve every `requestSchema` pointer and construct requests from your collected data plus the step's fixed and derived values. Do not invent fields.
- **`GET` operations are intentionally omitted.** Readiness checks and status polling are documented in this page's corridor sections, not in discovery. After completing a flow's steps, track outcomes through `GET /v1/onboarding/status` (the authenticated aggregate onboarding view) or the corridor's specific status operation described below.

Pin the `requirementsVersion` you integrated against and re-check discovery when it changes. Currently supported combinations:

| Country | Individual | Business |
|---|---|---|
| `BR` | `hybrid` (API + hosted liveness) | `api` (KYB Level 1) |
| `AR` | `api` | not supported |
| `CO` | `api` | `api` |
| `MX` | `api` | `api` |
| `US` | `hosted` | `hosted` |

EUR onboarding is not part of discovery; it is completed through the Vortex application or hosted widget (see the EUR section below). Provider state is always authoritative: no discovery step, client notification, or completion event can mark a verification approved.

## BRL (PIX)

BRL routes settle over PIX and require user onboarding with Vortex's local payment partner before ramping. The user's Brazilian tax ID — CPF for individuals, CNPJ for businesses — is the identity under which KYC is completed, but it is not how the ramp identifies the user: registration must authenticate as that user through a user-scoped key, a partner key delegated to the user, or a Supabase Bearer session. The tax ID is derived from that account. A `taxId` field may still be provided for backwards compatibility, but only as a cross-check — it must match the account's tax ID, and it cannot select a different user or claim an unlinked tax ID.

Use `/v1/brl/*` for BRL account and verification operations. The previous `/v1/brla/*` prefix remains supported as an equivalent migration alias.

Level 1 onboarding collects basic identity information and enables lower-limit BRL flows. Level 2 adds document and liveness verification and may be required for higher limits or stricter compliance rules. The user must have completed KYC on the same account whose key registers the ramp; otherwise the ramp may fail or require additional account-management steps.

A normal partner key cannot select an arbitrary user. An enabled managed-profile manager may use a secret `sk_*` key or Supabase session with `X-Managed-Profile-Id` to drive supported BR KYC operations for its directly managed child when the manager has the `BR` corridor and the child's immutable type is allowed by both current manager policy and Vortex's BR capability matrix. A null manager customer-type policy adds no further restriction. A public `pk_*` key is insufficient. When possible, use the Vortex application or hosted widget to complete onboarding before ramp execution. Business users can be sent straight into verification with the [KYB Deep Link](https://api-docs.vortexfinance.co/kyb-deep-link).

### Individual KYC By API

The standard Brazilian individual flow (mode `hybrid` in discovery) can be driven through the API; only the selfie liveness step opens a provider-hosted URL. The sequence published by discovery is:

1. `POST /v1/brl/createSubaccount` — create the individual provider subaccount (skip when one already exists).
2. `POST /v1/brl/getUploadUrls` — create the identity-document and selfie upload targets. Only `ID` and `DRIVERS-LICENSE` are accepted for the identity document. The response's `idUpload.id` and `selfieUpload.id` are the document references the final submission needs.
3. `PUT` the identity-document bytes to the returned presigned upload URL.
4. Open the returned liveness URL and let the user complete the provider-hosted selfie capture.
5. `POST /v1/brl/newKyc` — submit the Level 1 payload referencing `subAccountId`, `uploadedDocumentId`, and `uploadedSelfieId`. The endpoint waits a built-in 5 seconds for upstream document propagation before submitting, so expect the request to take at least that long.

Track the outcome through `GET /v1/brl/getKycStatus?taxId=<owned-tax-id>` or `GET /v1/onboarding/status`. Only a provider `COMPLETED + APPROVED` result completes KYC; the status mapping and the method-lock rules are shared with the token import documented below — in particular, the first standard document, liveness artifact, submission, or status read permanently selects the `standard` method, after which a Sumsub token import returns `409`.

### Individual KYC By Sumsub Share Token

An API-only alternative can import a caller-supplied Sumsub share token into an existing individual provider account. The path is enabled under approved Vortex policy even though final legal/consent wording, provider environment enablement, recipient IDs, and provider retry confirmations remain unresolved. This documentation does not claim that a live sandbox import has been verified.

The direct profile or controlling manager first provisions exactly one active Brazilian individual provider customer through the normal account flow. Import the token before reading KYC or aggregate onboarding status: a status read permanently selects a still-null method as `standard`, after which token import returns `409`. Then call:

```http
POST /v1/brl/kyc/import-token
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
Idempotency-Key: kyc-import-018f...
Content-Type: application/json

{
  "importToken": "<opaque-sumsub-share-token>",
  "consentAttested": true
}
```

Use either a profile-bound secret key or a Supabase Bearer session. Omit `X-Managed-Profile-Id` for a direct non-managed profile. For a managed child, only its controlling manager may import with the selector; direct managed-child credentials are rejected. Authentication and authorization happen before strict body validation, and Vortex transactionally rechecks the manager's active status, exact active relationship, current BR and individual permissions, and the child's active entity before preparing or submitting the import. Revocation before submission prevents the provider import call. The body allows exactly the two fields shown, `importToken` must contain 1 to 1024 UTF-8 bytes, and `consentAttested` must be literal `true`. Do not send CPF, tax ID, `subAccountId`, Sumsub applicant ID, profile/entity IDs, provider-customer IDs, or any other identity selector.

Vortex records every token-claim attestation in the case's submission JSON as an append-only actor, subject, timestamp, and provisional consent-policy entry. A provider-`401` retry under a new key appends rather than replacing the earlier evidence. These attestations are not a substitute for the caller's legal basis, applicant disclosures, biometric or special-category consent, or cross-organization transfer obligations.

A token-import claim returns `202 Accepted`:

```json
{
  "attemptId": "<exact-provider-attempt-id>",
  "status": "pending"
}
```

`pending` means only that the provider accepted the import. After `202`, clients poll `GET /v1/onboarding/status` (the authenticated aggregate onboarding view) or `GET /v1/brl/getKycStatus?taxId=<owned-tax-id>`; `attemptId` is correlation data from the accepted response, not public status-poll input. Vortex polls that exact attempt internally rather than the latest account attempt. `PENDING` remains pending, `PROCESSING` is in review, and `COMPLETED + REJECTED` is rejected. `EXPIRED` remains non-approved and locally pending for reconciliation while Vortex retains the external `EXPIRED` status. Only a provider `COMPLETED + APPROVED` result completes KYC. Sumsub status, token possession, the `202` response, client assertions, and the provider webhook cannot approve onboarding; the webhook is notification-only.

#### Method Lock And Safe Retries

The first normal document/liveness artifact or normal submission permanently selects the `standard` method. A token-import claim permanently selects `sumsub_share_token` and blocks every normal KYC mutation. Vortex serializes this immutable choice on the canonical KYC case. Pre-provider failures mark the submission failed but do not unlock or change the selected method. Standard submission also uses durable `prepared`, `submitted`, `confirmed`, and `ambiguous` state so retries reconcile an existing provider attempt instead of blindly creating another. Its identity payload and echoed provider errors are omitted from logs and public errors.

- Repeating a confirmed request with the same idempotency key and token returns the stored attempt and does not repeat the provider call.
- Reusing a key with another token returns `409 The idempotency key was used with a different token`.
- A prior failed request returns `409 A failed token import requires a new idempotency key`. This includes a failed pre-provider attempt-baseline read even though Vortex did not send the token, and the provider-`401` case described below.
- Repeating the same key and token for a submitted or ambiguous claim may safely reconcile the durable claim through provider status/history reads and return the exact attempt; this never repeats the provider token-import POST or sends the token again.
- Concurrent claims and outcomes that cannot be uniquely reconciled return a stable `409` or `502` reconciliation error. Do not switch keys or replay the token.
- A provider `401` returns `412` with a stable token-import-not-enabled error. This is the sole post-send outcome classified as failed/retriable, and retry requires a new idempotency key.
- Every other initial post-send provider error, timeout, transport failure, malformed success, provider 5xx, or local confirmation failure returns `502` with a stable reconciliation-required error. Never retry the token automatically or under a new key; only a same-key/same-token reconciliation request is safe.

Other prerequisite and immutable-method conflicts return `409` with a stable, non-secret `error` string. Invalid strict input returns `400`. Authentication and selector failures retain the structured authentication errors documented in [Authentication And API Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys).

Treat the share token as a secret. Keep it only long enough to make this request. Never place it in a URL, database, file, browser storage, analytics, traces, metrics labels, logs, screenshots, support tickets, or error reports. Vortex keeps it only in request memory for the provider exchange and stores a SHA-256 digest for idempotent input comparison.

### Business KYB Level 1 By API

Brazilian business verification (mode `api` in discovery) runs entirely through the API. Authentication is the same as the rest of the family: a profile-bound secret key or Supabase Bearer session, or a controlling manager using `X-Managed-Profile-Id` for a directly managed business child with the `BR` corridor. The subaccount must be a company (CNPJ) account; KYB operations on an individual account return `400`.

The sequence, including the readiness reads that discovery intentionally omits:

1. `POST /v1/brl/createSubaccount` — create the company provider subaccount from the company name and CNPJ (skip when one already exists). The response's `subAccountId` is a query parameter on every following step.
2. `POST /v1/brl/kyb/documents?subAccountId=...` — create one upload target per document: `CERTIFICATE-OF-INCORPORATION` and `COMPANY-TAX-IDENTIFICATION-DOCUMENT` for the company, one identity document (`ID`, `DRIVERS-LICENSE`, `PASSPORT`, or `RESIDENCE-PERMIT`) per UBO, and optionally `SELFIE-FROM-LIVENESS` per UBO. The `201` response carries the document `id` plus presigned `uploadURLFront` (and `uploadURLBack` when `isDoubleSided`), or a `livenessUrl` for the liveness type.
3. `PUT` the raw file bytes to each presigned URL (one request per side). Liveness documents are completed by opening the `livenessUrl` instead of uploading.
4. `GET /v1/brl/kyb/documents/{documentId}` — poll until `ready` is `true` before referencing a document anywhere. `uploadStatusFront`/`uploadStatusBack` and `uploadErrorFront`/`uploadErrorBack` explain a stuck upload; referencing an unready document later returns `409 Document is not ready`.
5. `POST /v1/brl/kyb/ubos?subAccountId=...` — register each UBO, referencing its ready identity document (`uploadedIdentificationId`) and optional liveness document (`uploadedSelfieId`). The `201` response's `id` goes into the final submission's `uboIds`.
6. `POST /v1/brl/kyb/new-level-1/api?subAccountId=...` — submit the attempt, referencing both ready company documents and the registered `uboIds`. The `200` response's `id` is the attempt ID for status polling.
7. `GET /v1/brl/kyb/attempt-status?attemptId=...` — poll until a terminal outcome.

#### UBO Registration And Safe Retries

UBO registration is idempotent per person: Vortex keys each submission by the subaccount plus the UBO's tax country and tax ID, and durably records its outcome before and after the provider call.

- Repeating a successfully registered UBO with identical details returns the stored `id` and does not call the provider again.
- Repeating the same person with different details returns `409 This UBO already exists with different details`.
- A deterministic provider rejection (invalid data) is recorded as failed; fix the payload and resubmit safely.
- A timeout, transport failure, provider `5xx`, `408`, `409`, or `429`, or a crash mid-request leaves the outcome unconfirmed and every later attempt for that person returns `409 The previous UBO submission outcome requires reconciliation`. **Do not retry, and do not vary the payload to get past it** — the provider may already hold the UBO, and a blind resubmission could duplicate it irrecoverably. Contact support to reconcile the outcome.
- `409 Multiple KYB cases require reconciliation` likewise requires support; do not retry.

#### Submission And Status

- Submitting while the company is already approved returns `409 This company is already approved`.
- Submitting while an attempt is already pending or in review — including when the provider reports a conflict — returns `200` with the existing attempt's `id` rather than opening a duplicate. Treat the submit as resumable.
- After a rejected or expired outcome, submitting again opens a fresh attempt (subject to the provider's `retryable` verdict on the previous one).
- `409 Multiple active KYB attempts found` requires support.

`GET /v1/brl/kyb/attempt-status?attemptId=...` returns `status` (`PENDING`, `PROCESSING`, `COMPLETED`, or `EXPIRED`), `result` (`APPROVED` or `REJECTED`, present once decided), `retryable`, and a normalized `failureReason` on rejection. `COMPLETED + APPROVED` is the only approval; `COMPLETED + REJECTED` and `EXPIRED` are non-approved outcomes. **Stop polling on the first terminal response.** Re-polling an attempt after its terminal outcome was recorded, or polling an attempt that a newer submission has superseded, returns `409 This KYB attempt is no longer current` — recover by reading `GET /v1/onboarding/status` or submitting again. `404` means the attempt ID is unknown or not owned by the effective profile. An already-approved company always answers `COMPLETED + APPROVED`.

The provider-hosted alternative remains available: `POST /v1/brl/kyb/new-level-1/web-sdk` starts or resumes the hosted flow, and the quote-less [KYB Deep Link](https://api-docs.vortexfinance.co/kyb-deep-link) wraps it in the widget.

## USD, MXN, COP, ARS (Bank Transfers)

These corridors settle through Vortex's local payment partners over domestic banking rails. In quote requests, the rail identifier takes the place of a network in `from` (buy) or `to` (sell):

| Fiat currency | Rail identifier | Payment rail |
|---|---|---|
| `USD` | `"ach"` | ACH bank transfer |
| `MXN` | `"spei"` | SPEI transfer |
| `COP` | `"ach"` | Colombian bank transfer |
| `ARS` | `"cbu"` | CBU bank transfer |

All four corridors support buys and sells on EVM networks; AssetHub is not available for these corridors.

### Onboarding And KYC

Each corridor requires the user to complete KYC for the corridor's country before a ramp can be registered. The identity documents collected differ per country (for example INE, resident card, or passport in Mexico; cédula in Colombia; DNI in Argentina); requirements discovery (see Discovering Onboarding Requirements above) publishes the exact document list and accepted media types per country and customer type.

Onboarding can be completed three ways:

- **Vortex app or hosted Widget** — always available. Business users can be sent straight into verification with the [KYB Deep Link](https://api-docs.vortexfinance.co/kyb-deep-link).
- **API-driven** (`mode: "api"` in discovery) — Argentina individuals, and Colombia and Mexico individuals and businesses. The discovered steps create the provider customer, create the KYC/KYB submission, upload each required document (businesses also upload identity documents for each related person), and finalize the submission. The `/v1/ar`, `/v1/co`, and `/v1/mx` prefixes may be used in place of the discovered legacy provider prefix; the country prefix determines the country and overrides any country supplied in the query or body. Request shapes come from the referenced OpenAPI schemas, and `derivedValues` carry the `submissionId` from the create-submission response into the upload and finalize calls. The discovered legacy prefix remains supported and uses each step's `fixedBody` country discriminator.
- **Provider-hosted** (`mode: "hosted"` in discovery) — United States, both customer types. After creating the provider customer, open the provider-hosted verification URL, then report `kycRedirectOpened` and, when the user says they finished, `kycRedirectFinished`. Both notifications are bookkeeping only — they never approve a verification; the provider's decision is authoritative.

Argentina business onboarding is not supported. After finalizing any flow, track the outcome through `GET /v1/onboarding/status`; provider review is asynchronous and there is no synchronous approval response.

Ramp registration resolves KYC and payment identity from the effective profile, not from payment or identity fields in the request. Authenticate as the user through a user-scoped key or Supabase Bearer session. Alternatively, an enabled managed-profile manager may use its secret key or session with `X-Managed-Profile-Id`; Vortex verifies the direct child relationship, corridor, immutable customer type, optional manager narrowing, and canonical corridor/type support before resolving the child's KYC/provider records. See [Authentication And API Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys). Quotes remain available anonymously for rate discovery; eligibility is enforced at registration time, not quote time.

### Fiat Accounts

Sells pay out to a saved bank account referenced by `fiatAccountId` in the register call. It is required for sells and optional for buys. The account is created during onboarding in the Vortex app or Widget; the ID is opaque to the SDK and the API client.

### Payment Instructions On Buys

After `POST /v1/ramp/start`, the response's `achPaymentData` contains the bank transfer instructions the user must pay (beneficiary, account, and reference details for the corridor's rail). Display them to the user verbatim; the ramp continues automatically once the fiat deposit is confirmed.

### Limits

Per-currency minimum and maximum amounts are enforced at quote time and refreshed periodically from the payment partner. A quote outside the limits fails with a descriptive error; prompt the user to adjust the amount.

Authenticated clients can request account limits with `POST /v1/limits`, passing a list of corridor country codes. The response contains separate onramp and offramp maximums, consumed amounts, units, and calendar-month boundaries. BR usage and period values come from the payment partner. Bank-transfer-corridor usage is calculated from completed Vortex ramps and cached for 60 seconds; its calendar-month reset is a Vortex assumption because the partner's public API does not publish quota-period semantics.

## EUR (SEPA)

EUR routes settle over SEPA using the `"sepa"` rail identifier and support both buys and sells. EUR onramps deliver to EVM networks; AssetHub is not available as a destination.

On a buy, register the ramp with `destinationAddress`, `email`, and `ipAddress`. The SEPA transfer instructions are returned in the ramp's `ibanPaymentData` — IBAN, receiver name, and payment reference. Display them to the user, and start the ramp once the user has completed the SEPA transfer. No user-signed on-chain transactions are required for buys.

EUR onboarding is individual KYC only and requires a connected wallet, so it is completed through the Vortex application or hosted widget; there is no quote-less KYB deep link for Europe.

---
