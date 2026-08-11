# Fiat Corridors

This page collects what each fiat corridor requires before a ramp can be registered: the payment rail, the identity and KYC prerequisites, and the payout details. For the quote request shape see [Quotes And Pricing](https://api-docs.vortexfinance.co/quotes-and-pricing); for runnable examples see [Quick Start With The SDK](https://api-docs.vortexfinance.co/quick-start-with-the-sdk).

## BRL (PIX)

BRL routes settle over PIX and require user onboarding with Vortex's local payment partner before ramping. The user's Brazilian tax ID — CPF for individuals, CNPJ for businesses — is the identity under which KYC is completed, but it is not how the ramp identifies the user: registration must authenticate as that user through a user-scoped key, a partner key delegated to the user, or a Supabase Bearer session. The tax ID is derived from that account. A `taxId` field may still be provided for backwards compatibility, but only as a cross-check — it must match the account's tax ID, and it cannot select a different user or claim an unlinked tax ID.

Level 1 onboarding collects basic identity information and enables lower-limit BRL flows. Level 2 adds document and liveness verification and may be required for higher limits or stricter compliance rules. The user must have completed KYC on the same account whose key registers the ramp; otherwise the ramp may fail or require additional account-management steps.

A normal partner key cannot select an arbitrary user. An enabled managed-profile manager may use a secret `sk_*` key or Supabase session with `X-Managed-Profile-Id` to drive supported BRLA KYC operations for its directly managed child when the manager has the `BR` corridor and the child's immutable type is allowed by both current manager policy and Vortex's BR capability matrix. A null manager customer-type policy adds no further restriction. A public `pk_*` key is insufficient. When possible, use the Vortex application or hosted widget to complete onboarding before ramp execution. Business users can be sent straight into verification with the [KYB Deep Link](https://api-docs.vortexfinance.co/kyb-deep-link).

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
