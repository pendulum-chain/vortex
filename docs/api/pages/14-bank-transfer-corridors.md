# Bank Transfer Corridors (USD, MXN, COP, ARS)

USD, MXN, COP, and ARS ramps settle through Vortex's local payment partners over domestic banking rails: ACH for USD and COP, SPEI for MXN, and CBU for ARS. All four corridors support buys and sells on EVM networks; AssetHub is not available for these corridors.

In quote requests, the rail identifier (`"ach"`, `"spei"`, `"cbu"`) takes the place of a network in `from` (buy) or `to` (sell). See [Quotes And Pricing](https://api-docs.vortexfinance.co/quotes-and-pricing) for the request shape and [Quick Start With The SDK](https://api-docs.vortexfinance.co/quick-start-with-the-sdk) for runnable examples.

## Onboarding And KYC

Each corridor requires the user to complete KYC for the corridor's country before a ramp can be registered. Onboard the user through the Vortex app or hosted Widget; the identity documents collected differ per country (for example INE, resident card, or passport in Mexico; cédula in Colombia; DNI in Argentina). Business users can be sent straight into verification with the [KYB Deep Link](https://api-docs.vortexfinance.co/kyb-deep-link).

Ramp registration must be authenticated with the user's own user-linked `sk_*` key, which your integration can mint programmatically after an email OTP sign-in — see [User API Keys](https://api-docs.vortexfinance.co/user-api-keys). Partner-scoped keys cannot register ramps in these corridors and cannot drive KYC on a user's behalf. Quotes remain available anonymously for rate discovery; eligibility is enforced at registration time, not quote time.

## Fiat Accounts

Sells pay out to a saved bank account referenced by `fiatAccountId` in the register call. It is required for sells and optional for buys. The account is created during onboarding in the Vortex app or Widget; the ID is opaque to the SDK and the API client.

## Payment Instructions On Buys

After `POST /v1/ramp/start`, the response's `achPaymentData` contains the bank transfer instructions the user must pay (beneficiary, account, and reference details for the corridor's rail). Display them to the user verbatim; the ramp continues automatically once the fiat deposit is confirmed.

## Limits

Per-currency minimum and maximum amounts are enforced at quote time and refreshed periodically from the payment partner. A quote outside the limits fails with a descriptive error; prompt the user to adjust the amount.

---
