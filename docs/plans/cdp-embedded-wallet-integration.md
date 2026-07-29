# Optional Coinbase CDP Embedded Wallets

## Status

- Owner: Vortex
- Base branch: `staging`
- Implementation branch: `codex/privy-embedded-wallets`
- Scope: dashboard, widget, API, tests, and operational documentation
- Compatibility spike: complete for custom JWT auth, ownership lookup, EIP-712 signing, raw EIP-1559 signing,
  Base Sepolia send, BSC testnet broadcast, and secure export
- Implementation: CDP provider migration complete behind disabled-by-default flags
- Remaining work: production hardening and credentialed environment smoke tests

## Objective and Non-goals

An authenticated Vortex user may explicitly create or restore a CDP EVM EOA instead of connecting a browser wallet.
Supabase remains the Vortex identity, Reown remains the external-wallet path, and Polkadot/AssetHub behavior is
unchanged.

This iteration does not implement the controls tracked in
[`cdp-embedded-wallet-security-hardening.md`](./cdp-embedded-wallet-security-hardening.md), replace Supabase, create a
wallet on every login, introduce server signing, or add CDP support to Substrate flows.

## Implemented Architecture

- `WalletMode` is `external | cdp_embedded | null`.
- Dashboard and widget lazy-load `CDPReactProvider` only for the embedded path.
- CDP custom auth obtains a fresh Supabase access token from the existing auth service.
- EOA creation is manual. An existing CDP EOA is restored by the registered CDP user ID and address.
- `POST /v1/wallets/cdp` forwards the verified Supabase bearer token to CDP and matches the returned JWT `sub`, CDP
  user ID, and EOA address before persistence.
- `profile_wallets.provider` is `cdp`; `provider_wallet_id` stores the CDP user ID.
- Mode changes and registration retain the profile row lock and active-ramp guard.
- External and CDP wallets implement the same signing adapter.
- CDP signs EIP-712 data after the adapter adds the explicit `EIP712Domain` type required by CDP.
- CDP raw-signs EIP-1559 transactions and Vortex broadcasts them through Wagmi/viem. This preserves BSC and other
  configured Vortex networks outside CDP's convenience-send inventory.
- Server-issued gas, fee, and nonce fields are forwarded. Missing fields are estimated. A zero BSC priority fee is
  replaced with the current gas price.
- The dashboard opens CDP's secure export modal without exposing key material to Vortex.

## Configuration

```text
# API
CDP_WALLET_REGISTRATION_ENABLED=false
CDP_PROJECT_ID=

# Dashboard
VITE_CDP_ENABLED=false
VITE_CDP_PROJECT_ID=
VITE_CDP_PROVISIONING_ENABLED=false
VITE_CDP_ONRAMP_ENABLED=false
VITE_CDP_OFFRAMP_ENABLED=false

# Widget
VITE_CDP_ENABLED=false
VITE_CDP_PROJECT_ID=
VITE_CDP_PROVISIONING_ENABLED=false
VITE_CDP_WIDGET_PARENT_ORIGINS=
```

## Verification Matrix

- configuration is disabled without both an enable flag and project ID;
- wallet identity selection matches both CDP user ID and checksummed address;
- external and CDP adapters preserve the same Vortex signing contract;
- server-issued signer binding applies to transactions and typed data;
- registration is authenticated, idempotent, profile-scoped, and active-ramp safe;
- cross-profile CDP identity/address mismatches fail closed;
- top-level and allowlisted widget origins may load CDP; unknown iframe ancestry may not;
- production builds dynamically separate the CDP runtime from the external-wallet path.

Credentialed smoke testing follows
[`docs/operations/cdp-embedded-wallet-rollout.md`](../operations/cdp-embedded-wallet-rollout.md). Security follow-up
is owned by the dedicated hardening plan rather than this provider-migration iteration.
