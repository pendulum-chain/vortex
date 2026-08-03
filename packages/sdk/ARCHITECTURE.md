# SDK Architecture

`@vortexfi/sdk` is a stateless integration layer over the Vortex API. It owns ephemeral
account generation, presigning of platform-owned transactions, classification of
user-wallet transactions, and typed API error handling. It does not own long-lived ramp
state or a user's wallet.

## Main components

- `VortexSdk.ts` is the public orchestrator.
- `services/ApiService.ts` owns HTTP requests and error mapping.
- `services/NetworkManager.ts` owns the RPC connections needed for ephemeral signing and
  preflight balance checks.
- `handlers/BrlHandler.ts`, `AlfredpayHandler.ts`, and `MykoboHandler.ts` adapt
  corridor-specific registration and update data to the common lifecycle.
- `eip712.ts` classifies and attaches signatures for user-owned typed-data operations.
- `storage.ts` optionally persists ephemeral recovery material for the caller.

## Lifecycle

```text
createQuote
  -> registerRamp
  -> submitUserTransactions or updateRamp (SELL flows when required)
  -> startRamp
  -> getRampStatus
```

Quotes are eligible for anonymous rate discovery. Registration requires a user-linked
secret key because provider identity is resolved server-side for that user. The SDK does
not mint keys or complete KYC/KYB.

`registerRamp` returns user-owned transactions separately from ephemeral-owned
transactions. The SDK signs only the ephemeral-owned set. For user-owned entries, the
integrator supplies wallet callbacks to `submitUserTransactions`, or handles each entry
through `getUserTransactionType`, `getTypedDataToSign`, and
`getTransactionToBroadcast`.

## State and custody

- The SDK never receives a connected wallet object or its private key.
- Ephemeral accounts are generated per registration and are required for recovery until
  the ramp's recovery window ends.
- Ramp IDs and business correlation state belong to the integrating application.
- `storeEphemeralKeys` defaults to enabled for Node-based recovery; applications with
  their own secure storage may disable it and persist the material themselves.

## Package boundary

The SDK is published as a Node.js ESM package from `dist/index.js`, with declarations in
`dist/index.d.ts`. `bun test` runs unit tests, builds the package, and smoke-loads the
output. The public API and examples belong in [`README.md`](README.md); partner-facing
integration guides belong in [`docs/api/`](../../docs/api/README.md).
