# Sandbox

Use the sandbox environment to test quote creation, ramp registration, signing, updates, webhook handling, and status tracking without touching production funds.

Vortex UI:

```text
https://sandbox.vortexfinance.co
```

SDK/API base URL:

```text
https://api-sandbox.vortexfinance.co
```

Use test keys (`pk_test_*`, `sk_test_*`) in sandbox. Do not use production API keys, production wallets, production private keys, or production user data.

For EVM-based test flows, use your own test wallet and fund it from public testnet faucets. Do not publish shared recovery phrases or reuse them in partner applications, CI logs, screenshots, or documentation.

Sandbox flows may complete faster than production flows and may mock parts of payment or KYC behavior. Production integrations should still handle asynchronous confirmations, delayed status changes, recoverable failures, webhook retries, and user support workflows.

---
