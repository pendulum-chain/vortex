# Sandbox

Use the sandbox environment to test onboarding, quote creation, ramp registration, signing, updates, webhook handling, and status tracking without touching production funds.

| Purpose | URL |
|---|---|
| Dashboard (sign-up, API keys, KYC/KYB) | <https://dashboard-sandbox.vortexfinance.co> |
| Vortex app and Widget | <https://sandbox.vortexfinance.co> |
| SDK/API base URL | `https://api-sandbox.vortexfinance.co` |

Sandbox and production are separate: profiles, onboarding, and API keys do not carry over between them. Use test keys (`pk_test_*`, `sk_test_*`) in sandbox. Do not use production API keys, production wallets, production private keys, or production user data.

---

## Get Started

The sandbox is self-service. You do not need credentials from Vortex to start.

1. Sign up at <https://dashboard-sandbox.vortexfinance.co> with your email and the 6-digit code Vortex sends you. The first sign-in creates your profile.
2. Open **API keys** and click **Create credential**. Copy both values; the secret key is shown once. See [Authentication And API Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys).
3. Complete KYC (individual) or KYB (company) for each corridor you want to test, in the dashboard or through the API. See [Fiat Corridors](https://api-docs.vortexfinance.co/fiat-corridors) for each corridor's requirements.

Contact <support@vortexfinance.co> for the parts that Vortex enables:

- **Browser origins.** Server-to-server calls work immediately. Browser calls are refused by CORS until your exact origins are approved for sandbox. See [Browser Origin Approval](https://api-docs.vortexfinance.co/authentication-and-partner-keys).
- **Partner features.** Acting for managed customer profiles and business EUR onramp accounts are set up by Vortex. See [Managed Profiles](https://api-docs.vortexfinance.co/managed-profiles).

---

## KYC And KYB

In sandbox, verifications are approved regardless of the validity of the personal or company information and uploaded documents. Every step still has to be completed, including provider-hosted steps and liveness verification; the collected data is discarded afterwards. Track the result with `GET /v1/onboarding/status`.

There are no shared test accounts. Create your own test identities:

- **Brazilian tax IDs (CPF/CNPJ)** must have valid check digits. Use a generator, such as [this CPF generator](https://www.freetool.dev/cpf-generator/), to create them.
- A tax ID belongs to the first profile that registers it. Registering it from another profile returns `409 A subaccount already exists for this taxId`, so use a fresh tax ID for each test profile.

---

## Ramp Behavior

- **Completion time**: once started, a ramp completes automatically after about 10 seconds. No real PIX payment or bank transfer is needed.
- **Transaction hashes**: completed sandbox ramps report a synthetic transaction hash and a placeholder explorer link. Do not resolve them on a block explorer.
- **Transaction signing**: some flows require the user to sign one or two transactions before the ramp begins.
    - **Networks**: these transactions are signed on Polygon's testnet (Amoy) or AssetHub's testnet (Paseo).
    - **Faucets**: fund your test wallet before testing:
        - [Polygon Faucet](https://faucet.polygon.technology/)
        - [Polkadot Faucet](https://faucet.polkadot.io/)
- **Wallets**: use your own test wallet. Do not publish shared recovery phrases or reuse them in partner applications, CI logs, screenshots, or documentation.
- **EUR**: EUR (SEPA) buys are available in sandbox; EUR sells are unavailable. See [Fiat Corridors](https://api-docs.vortexfinance.co/fiat-corridors) for the EUR onboarding and wallet-linking steps.

Sandbox flows complete faster than production flows and mock parts of payment and KYC behavior. Production integrations should still handle asynchronous confirmations, delayed status changes, recoverable failures, webhook retries, and user support workflows. Before going live, work through the [Production Checklist](https://api-docs.vortexfinance.co/production-checklist).
