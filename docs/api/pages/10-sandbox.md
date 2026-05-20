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

## Mock Accounts for Testing

To simplify testing, we have pre-configured accounts that are already whitelisted with the necessary KYC in the sandbox environment.

### BRL Onramps/Offramps
- **Identification Method**: Brazilian users are identified by their tax ID (CPF/CNPJ).
- **Test Tax ID**: `157.492.981-08`
- **Note**: This tax ID skips the KYC process.

### Euro Onramps
- **Login Method**: Sign in using an EVM wallet.
- **Test Wallet**:
    - Public Address: `0x6f64A6a3eBB0Fa2F265bB173407cb2A90AE0D32f`
    - Recovery Phrase: `sword joke bomb old couch junior dumb need story grace spirit casual`
- **Note**: This wallet is pre-loaded with testnet funds.

### Euro Offramps
- **Login Method**: Use an email address.
- **Test Email**: `tester@vortexfinance.co`
- **Note**: This email is already whitelisted.


---

## Mocking the KYC Process

In the sandbox environment, the KYC process will always succeed, regardless of the validity of the personal information or uploaded documents. This allows you to test identification flows and enable new testing accounts easily.

### Special Note for Brazilian Flows
- You can use a random tax ID generator, such as [this](https://www.freetool.dev/cpf-generator/) one, to create test tax IDs.
- **Liveness Verification**: The liveness verification step must be completed in the sandbox as well. The collected data is discarded at the end of the process.

---

## Ramp Behavior

- **Completion Time**: Once started, ramps will complete automatically after 10 seconds.
- **Transaction Signing**: Some flows require the user to sign 1-2 transactions before the ramp begins.
    - **Networks**: Mock transactions are signed on Polygon's testnet (Amoy) or Assethub's testnet (Paseo).
    - **Faucets**: Ensure you have testnet funds before testing. Use the following faucets:
        - [Polygon Faucet](https://faucet.polygon.technology/)
        - [Polkadot Faucet](https://faucet.polkadot.io/)

---

This sandbox environment is designed to provide a realistic user experience while allowing you to test and iterate quickly. Happy testing!
