# Fiat Corridors

This page collects what each fiat corridor requires before a ramp can be registered: the payment rail, the identity and KYC prerequisites, and the payout details. For the quote request shape see [Quotes And Pricing](https://api-docs.vortexfinance.co/quotes-and-pricing); for runnable examples see [Quick Start With The SDK](https://api-docs.vortexfinance.co/quick-start-with-the-sdk).

## BRL (PIX)

BRL routes settle over PIX and require user onboarding with Vortex's local payment partner before ramping. The user's Brazilian tax ID — CPF for individuals, CNPJ for businesses — is the primary identifier, so ramp registration may be authenticated with a partner-scoped `sk_*` key: the `taxId` in the request identifies the user.

Level 1 onboarding collects basic identity information and enables lower-limit BRL flows. Level 2 adds document and liveness verification and may be required for higher limits or stricter compliance rules. The user must have completed KYC under the same `taxId` used in the ramp; otherwise the ramp may fail or require additional account-management steps.

Partner integrations cannot drive BRL KYC with only `sk_*` or `pk_*` keys. The BRLA endpoints are first-party, user-oriented flows that rely on a Vortex-authenticated user context. When possible, use the Vortex application or hosted widget to complete onboarding before ramp execution. Business users can be sent straight into verification with the [KYB Deep Link](https://api-docs.vortexfinance.co/kyb-deep-link).

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

Unlike BRL, ramp registration must be authenticated with the user's own **user-linked** `sk_*` key — the ramp resolves the user's KYC and payment profile from the authenticated account, not from request fields. Your integration can mint that key programmatically after an email OTP sign-in; see [Authentication And API Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys). Partner-scoped keys cannot register ramps in these corridors and cannot drive KYC on a user's behalf. Quotes remain available anonymously for rate discovery; eligibility is enforced at registration time, not quote time.

### Fiat Accounts

Sells pay out to a saved bank account referenced by `fiatAccountId` in the register call. It is required for sells and optional for buys. The account is created during onboarding in the Vortex app or Widget; the ID is opaque to the SDK and the API client.

### Payment Instructions On Buys

After `POST /v1/ramp/start`, the response's `achPaymentData` contains the bank transfer instructions the user must pay (beneficiary, account, and reference details for the corridor's rail). Display them to the user verbatim; the ramp continues automatically once the fiat deposit is confirmed.

### Limits

Per-currency minimum and maximum amounts are enforced at quote time and refreshed periodically from the payment partner. A quote outside the limits fails with a descriptive error; prompt the user to adjust the amount.

## EUR (SEPA)

EUR routes settle over SEPA using the `"sepa"` rail identifier and support both buys and sells. EUR onramps deliver to EVM networks; AssetHub is not available as a destination.

On a buy, register the ramp with `destinationAddress`, `email`, and `ipAddress`. The SEPA transfer instructions are returned in the ramp's `ibanPaymentData` — IBAN, receiver name, and payment reference. Display them to the user, and start the ramp once the user has completed the SEPA transfer. No user-signed on-chain transactions are required for buys.

EUR onboarding is individual KYC only and requires a connected wallet, so it is completed through the Vortex application or hosted widget; there is no quote-less KYB deep link for Europe.

---
