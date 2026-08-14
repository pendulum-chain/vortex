# Fiat Corridors

This page collects what each fiat corridor requires before a ramp can be registered: the payment rail, the identity and KYC prerequisites, and the payout details. For the quote request shape see [Quotes And Pricing](https://api-docs.vortexfinance.co/quotes-and-pricing); for runnable examples see [Quick Start With The SDK](https://api-docs.vortexfinance.co/quick-start-with-the-sdk).

## BRL (PIX)

BRL routes settle over PIX and require user onboarding with Vortex's local payment partner before ramping. The user's Brazilian tax ID — CPF for individuals, CNPJ for businesses — is the identity under which KYC is completed, but it is not how the ramp identifies the user: registration must authenticate as that user through a user-scoped key, a partner key delegated to the user, or a Supabase Bearer session. The tax ID is derived from that account. A `taxId` field may still be provided for backwards compatibility, but only as a cross-check — it must match the account's tax ID, and it cannot select a different user or claim an unlinked tax ID.

Level 1 onboarding collects basic identity information and enables lower-limit BRL flows. Level 2 adds document and liveness verification and may be required for higher limits or stricter compliance rules. The user must have completed KYC on the same account whose key registers the ramp; otherwise the ramp may fail or require additional account-management steps.

A normal partner key cannot select an arbitrary user. An enabled managed-profile manager may use a secret `sk_*` key or Supabase session with `X-Managed-Profile-Id` to drive supported BRLA KYC operations for its directly managed child when the manager has the `BR` corridor and the child's immutable type is allowed by both current manager policy and Vortex's BR capability matrix. A null manager customer-type policy adds no further restriction. A public `pk_*` key is insufficient. When possible, use the Vortex application or hosted widget to complete onboarding before ramp execution. Business users can be sent straight into verification with the [KYB Deep Link](https://api-docs.vortexfinance.co/kyb-deep-link).

### Individual KYC By Sumsub Share Token

An API-only alternative can import a caller-supplied Sumsub share token into an existing individual Avenia account. The path is enabled under approved Vortex policy even though final legal/consent wording, Avenia environment enablement, recipient IDs, and provider retry confirmations remain unresolved. This documentation does not claim that a live sandbox import has been verified.

The direct profile or controlling manager first provisions exactly one active Brazilian individual Avenia customer through the normal account flow. Import the token before reading KYC or aggregate onboarding status: a status read permanently selects a still-null method as `standard`, after which token import returns `409`. Then call:

```http
POST /v1/brla/kyc/import-token
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
Idempotency-Key: kyc-import-018f...
Content-Type: application/json

{
  "importToken": "<opaque-sumsub-share-token>",
  "consentAttested": true
}
```

Use either a profile-bound secret key or a Supabase Bearer session. Omit `X-Managed-Profile-Id` for a direct non-managed profile. For a managed child, only its controlling manager may import with the selector; direct managed-child credentials are rejected. Authentication and authorization happen before strict body validation, and Vortex transactionally rechecks the manager's active status, exact active relationship, current BR and individual permissions, and the child's active entity before preparing or submitting the import. Revocation before submission prevents the Avenia import call. The body allows exactly the two fields shown, `importToken` must contain 1 to 1024 UTF-8 bytes, and `consentAttested` must be literal `true`. Do not send CPF, tax ID, `subAccountId`, Sumsub applicant ID, profile/entity IDs, provider-customer IDs, or any other identity selector.

Vortex records every token-claim attestation in the case's submission JSON as an append-only actor, subject, timestamp, and provisional consent-policy entry. A provider-`401` retry under a new key appends rather than replacing the earlier evidence. These attestations are not a substitute for the caller's legal basis, applicant disclosures, biometric or special-category consent, or cross-organization transfer obligations.

A token-import claim returns `202 Accepted`:

```json
{
  "attemptId": "<exact-avenia-attempt-id>",
  "status": "pending"
}
```

`pending` means only that Avenia accepted the import. After `202`, clients poll the authenticated aggregate onboarding-status endpoint or `GET /v1/brla/getKycStatus?taxId=<owned-tax-id>`; `attemptId` is correlation data from the accepted response, not public status-poll input. Vortex polls that exact attempt internally rather than the latest account attempt. `PENDING` remains pending, `PROCESSING` is in review, and `COMPLETED + REJECTED` is rejected. `EXPIRED` remains non-approved and locally pending for reconciliation while Vortex retains the external `EXPIRED` status. Only Avenia `COMPLETED + APPROVED` completes KYC. Sumsub status, token possession, the `202` response, client assertions, and the Avenia webhook cannot approve onboarding; the webhook is notification-only.

#### Method Lock And Safe Retries

The first normal document/liveness artifact or normal submission permanently selects the `standard` method. A token-import claim permanently selects `sumsub_share_token` and blocks every normal KYC mutation. Vortex serializes this immutable choice on the canonical KYC case. Pre-provider failures mark the submission failed but do not unlock or change the selected method. Standard submission also uses durable `prepared`, `submitted`, `confirmed`, and `ambiguous` state so retries reconcile an existing provider attempt instead of blindly creating another. Its identity payload and echoed provider errors are omitted from logs and public errors.

- Repeating a confirmed request with the same idempotency key and token returns the stored attempt and does not call Avenia again.
- Reusing a key with another token returns `409 The idempotency key was used with a different token`.
- A prior failed request returns `409 A failed token import requires a new idempotency key`. This includes a failed pre-provider attempt-baseline read even though Vortex did not send the token, and the provider-`401` case described below.
- Repeating the same key and token for a submitted or ambiguous claim may safely reconcile the durable claim through Avenia status/history reads and return the exact attempt; this never repeats the provider token-import POST or sends the token again.
- Concurrent claims and outcomes that cannot be uniquely reconciled return a stable `409` or `502` reconciliation error. Do not switch keys or replay the token.
- Avenia provider `401` returns `412 Avenia token import is not enabled`. This is the sole post-send outcome classified as failed/retriable, and retry requires a new idempotency key.
- Every other initial post-send provider error, timeout, transport failure, malformed success, provider 5xx, or local confirmation failure returns `502 The Avenia token import outcome requires reconciliation`. Never retry the token automatically or under a new key; only a same-key/same-token reconciliation request is safe.

Other prerequisite and immutable-method conflicts return `409` with a stable, non-secret `error` string. Invalid strict input returns `400`. Authentication and selector failures retain the structured authentication errors documented in [Authentication And API Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys).

Treat the share token as a secret. Keep it only long enough to make this request. Never place it in a URL, database, file, browser storage, analytics, traces, metrics labels, logs, screenshots, support tickets, or error reports. Vortex keeps it only in request memory for the provider exchange and stores a SHA-256 digest for idempotent input comparison.

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

Each corridor requires the user to complete KYC for the corridor's country before a ramp can be registered. Onboard the user through the Vortex app or hosted Widget; the identity documents collected differ per country (for example INE, resident card, or passport in Mexico; cédula in Colombia; DNI in Argentina). Business users can be sent straight into verification with the [KYB Deep Link](https://api-docs.vortexfinance.co/kyb-deep-link).

Ramp registration resolves KYC and payment identity from the effective profile, not from payment or identity fields in the request. Authenticate as the user through a user-scoped key or Supabase Bearer session. Alternatively, an enabled managed-profile manager may use its secret key or session with `X-Managed-Profile-Id`; Vortex verifies the direct child relationship, corridor, immutable customer type, optional manager narrowing, and canonical corridor/type support before resolving the child's KYC/provider records. See [Authentication And API Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys). Quotes remain available anonymously for rate discovery; eligibility is enforced at registration time, not quote time.

### Fiat Accounts

Sells pay out to a saved bank account referenced by `fiatAccountId` in the register call. It is required for sells and optional for buys. The account is created during onboarding in the Vortex app or Widget; the ID is opaque to the SDK and the API client.

### Payment Instructions On Buys

After `POST /v1/ramp/start`, the response's `achPaymentData` contains the bank transfer instructions the user must pay (beneficiary, account, and reference details for the corridor's rail). Display them to the user verbatim; the ramp continues automatically once the fiat deposit is confirmed.

### Limits

Per-currency minimum and maximum amounts are enforced at quote time and refreshed periodically from the payment partner. A quote outside the limits fails with a descriptive error; prompt the user to adjust the amount.

Authenticated clients can request account limits with `POST /v1/limits`, passing a list of corridor country codes. The response contains separate onramp and offramp maximums, consumed amounts, units, and calendar-month boundaries. Avenia usage and period values come from the provider. Alfredpay usage is calculated from completed Vortex ramps and cached for 60 seconds; its calendar-month reset is a Vortex assumption because Alfredpay's public API does not publish quota-period semantics.

## EUR (SEPA)

EUR routes settle over SEPA using the `"sepa"` rail identifier and support both buys and sells. EUR onramps deliver to EVM networks; AssetHub is not available as a destination.

On a buy, register the ramp with `destinationAddress`, `email`, and `ipAddress`. The SEPA transfer instructions are returned in the ramp's `ibanPaymentData` — IBAN, receiver name, and payment reference. Display them to the user, and start the ramp once the user has completed the SEPA transfer. No user-signed on-chain transactions are required for buys.

EUR onboarding is individual KYC only and requires a connected wallet, so it is completed through the Vortex application or hosted widget; there is no quote-less KYB deep link for Europe.

---
