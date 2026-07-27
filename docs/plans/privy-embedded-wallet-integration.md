# Optional Privy Embedded Wallets

## Status

- Owner: Vortex
- Base branch: `staging`
- Implementation branch: `codex/privy-embedded-wallets`
- Scope: dashboard, widget, API, tests, and operational documentation
- Privy credentials: not required for local unit/integration tests; required for a live sandbox smoke test
- Implementation: phases 0–5 complete behind disabled-by-default flags
- Remaining validation: credentialed staging wallet creation, restoration, export, and live signing smoke test

## Objective

Allow a Vortex user who does not have or does not want to use a browser-extension wallet to create and use an
embedded EVM wallet supplied by Privy. This must remain optional: users who bring an existing wallet continue to
use the current Reown/Wagmi flow without being enrolled in or authenticated with Privy.

The implementation must preserve the existing Vortex identity and ramp trust boundaries:

1. Supabase email OTP remains the canonical Vortex account and API session.
2. `profiles.id` remains the Supabase user UUID.
3. Normal Vortex API requests continue to use the Supabase bearer token.
4. Privy is mounted and receives the Supabase JWT only after explicit embedded-wallet opt-in.
5. Privy wallet creation is manual (`createOnLogin: "off"`).
6. Existing-wallet users remain on Reown/Wagmi.
7. Vortex's ephemeral ramp keys remain client-side and separate from the user wallet.
8. The server continues to validate every user transaction hash, receipt, signer, destination, calldata, and value.
9. Vortex does not receive or store the embedded wallet's private key.
10. Wallet mode cannot change while a ramp is nonterminal.

## Non-goals

- Replacing Supabase authentication with Privy authentication.
- Replacing Reown for existing wallets.
- Creating a Privy wallet for every Vortex user.
- Server-controlled, delegated, or custodial user-wallet signing.
- Adding Privy support for Substrate/AssetHub transactions.
- Weakening the current one-active-ramp-per-profile invariant.
- Making arbitrary, unknown iframe parent origins trusted Privy origins.

## User experience

### Progressive wallet choice

Authentication and wallet selection remain separate:

1. The user authenticates to Vortex with the existing email OTP.
2. The user may browse, complete KYC/KYB, and use flows that do not need a wallet.
3. When a destination or signer is required, Vortex offers:
   - **Create a Vortex wallet** — explicitly opts into Privy and creates/restores an embedded EVM wallet.
   - **Connect my existing wallet** — uses the current Reown modal.
   - **Not now** — available where a wallet is not yet required.

Onramps may use the embedded wallet, a connected external wallet, or a manually entered address when the corridor
allows it. Offramps require an actual signing wallet. AssetHub routes continue to require the current Polkadot wallet
flow.

### Wallet management

The dashboard and widget show the selected wallet mode and address. Embedded-wallet users can:

- copy the address;
- display a receive QR code;
- view relevant token balances;
- export the wallet through Privy's secure export flow;
- switch to an external wallet when no ramp is active.

Switching modes never deletes a wallet or transfers funds.

## Architecture

### Canonical identity

Supabase remains the identity provider. Privy custom authentication consumes the current Supabase access token and
uses the JWT `sub` claim (the Supabase UUID) as its stable identity. Development, staging, and production each use a
separate Privy application. Within an environment, dashboard and widget share one Privy application so the same
Supabase user restores the same embedded wallet.

The Supabase project must expose an asymmetric signing key through:

```text
https://<project>.supabase.co/auth/v1/.well-known/jwks.json
```

This is an operational prerequisite and is verified during the live Phase 0 smoke test.

### Wallet modes

The frontend wallet domain has three modes:

```ts
type WalletMode = "external" | "privy_embedded" | null;
```

A wallet-neutral EVM adapter exposes the minimum operations needed by Vortex:

```ts
interface EvmWalletAdapter {
  mode: "external" | "privy_embedded";
  ready: boolean;
  address?: `0x${string}`;
  chainId?: number;
  signTypedData(input: VortexTypedData): Promise<`0x${string}`>;
  sendTransaction(input: VortexTransactionRequest): Promise<`0x${string}`>;
  waitForReceipt(hash: `0x${string}`, chainId: number): Promise<`0x${string}`>;
}
```

The external implementation wraps the current Wagmi actions. The embedded implementation uses Privy's native React
wallet hooks and always targets the selected embedded-wallet address explicitly.

Business components and ramp actors consume the adapter. They do not select a wallet by array position and do not
import the global Reown Wagmi configuration for embedded-wallet operations.

### Lazy Privy boundary

Privy's package and provider are dynamically loaded only after the profile selects `privy_embedded`. The provider:

- uses `VITE_PRIVY_APP_ID` and `VITE_PRIVY_CLIENT_ID`;
- receives the latest Supabase access token through custom authentication;
- sets `embeddedWallets.ethereum.createOnLogin` to `"off"`;
- creates a wallet only in response to the explicit user action;
- selects a wallet with `walletClientType === "privy"` and the registered address;
- tears down when the Vortex session ends or wallet mode changes.

Neither a missing Privy configuration nor a Privy outage may break the external-wallet path.

### API persistence

`profiles.wallet_mode` records the cross-application preference:

- `NULL`: ask when needed;
- `external`: prefer Reown;
- `privy_embedded`: restore the Privy boundary.

`profile_wallets` records verified embedded-wallet metadata:

| Column | Purpose |
| --- | --- |
| `id` | UUID primary key |
| `profile_id` | Owning Supabase/Vortex profile |
| `provider` | `privy` in v1 |
| `provider_wallet_id` | Privy's wallet identifier |
| `address` | Checksummed or normalized EVM address |
| `chain_type` | `ethereum` in v1 |
| `status` | `active` or `archived` |
| timestamps | Creation, update, and last-used audit fields |

The API surface is:

- `GET /v1/wallets`
- `POST /v1/wallets/privy`
- `PATCH /v1/wallets/mode`

All routes require the existing Supabase bearer authentication. Privy metadata registration is verified server-side;
an address supplied by the browser is never trusted on its own. The Privy app secret is server-only and is not used
to sign user transactions.

The wallet registry is UX metadata, not authorization to move money. Existing signatures and transaction receipt
validation remain authoritative.

## Implementation phases

### Phase 0 — configuration and compatibility

- Add typed, disabled-by-default Privy configuration to dashboard, widget, and API.
- Add feature flags for provisioning, dashboard onramp, dashboard offramp, widget, and gas sponsorship.
- Add environment examples without credentials.
- Add an observable Supabase session bridge so token refresh and logout reach the optional Privy boundary.
- Add a no-credentials fake embedded-wallet adapter for local tests.
- Document the live smoke-test matrix:
  - Supabase JWKS/custom-auth;
  - dashboard/widget wallet continuity;
  - known and unknown iframe parents;
  - all EVM user-signing transaction shapes;
  - gas policy behavior.

### Phase 1 — wallet domain and persistence

- Add the framework-neutral wallet types.
- Add dashboard and widget wallet providers.
- Preserve the current Reown adapter.
- Add the lazy Privy embedded adapter.
- Add the profile wallet-mode migration, wallet metadata migration, model, service, controller, and routes.
- Prevent mode changes while a ramp is nonterminal.
- Verify Privy wallet ownership before persistence when server credentials are configured.
- Fail closed for live registration if ownership cannot be verified.

### Phase 2 — dashboard embedded onramp

- Replace the header's connect-only button with a mode-aware wallet control.
- Add the explicit wallet chooser.
- Add embedded-wallet provisioning and recovery states.
- Offer embedded, external, and manual onramp destinations.
- Add wallet settings, copy/receive UI, and export action.
- Keep all current external-wallet behavior unchanged.

### Phase 3 — dashboard embedded offramp

- Refactor signing services to accept an injected EVM adapter.
- Refactor the app-lifetime dashboard transfer actor to inject wallet dependencies without persisting functions.
- Bind the selected address to the server-issued signer before every signature or broadcast.
- Implement Privy typed-data signing and EVM transaction sending.
- Add an explicit gas policy (`user_pays` or `sponsored`) behind a kill switch.
- Preserve receipt/hash submission and the current API validation.

### Phase 4 — widget integration

- Extend the ramp machine with a wallet-requirement decision before registration/signing.
- Do not gate authentication, invitations, or KYC on wallet creation.
- Use the wallet-neutral EVM adapter in `useVortexAccount` and user signing.
- Keep Polkadot/AssetHub paths on the existing wallet provider.
- Enable Privy only for top-level or explicitly allowlisted parent origins.
- Fail safely with a first-party handoff requirement for unsupported iframe parents.

### Phase 5 — hardening and rollout

- Add narrow CSP/origin documentation.
- Add feature-flagged rollout and kill switches.
- Add privacy-safe telemetry for mode choice, provisioning, signing, and gas failures.
- Add wallet export/recovery language.
- Update architecture and security specifications.
- Add internal, staging, partner, and gradual production rollout checklists.

## Gas and signing policy

Onramps do not require the destination wallet to sign. They ship before embedded-wallet offramps.

For offramps, the embedded adapter signs the same server-issued EIP-712 and raw EVM transaction shapes as an external
wallet. The implementation must cover:

- EIP-712 permit signatures;
- `squidRouterApprove`;
- `squidRouterSwap`;
- `squidRouterNoPermitTransfer`;
- `squidRouterNoPermitApprove`;
- `squidRouterNoPermitSwap`.

The implementation initially defaults gas sponsorship off. Enabling user-pays or sponsored gas requires the live
Privy smoke test to confirm:

- the transaction receipt `from` remains the Vortex-issued signer;
- EIP-712 signatures pass Vortex recovery and full-field validation;
- EIP-7702/ERC-1271 behavior is compatible with the selected token/permit route;
- chain and token are supported;
- rate limits, spend limits, and a global kill switch are active.

## Iframe policy

Privy requires the widget origin and every iframe parent origin to be allowlisted. V1 enables the embedded path only
when the widget is:

- top-level on a configured Vortex origin; or
- framed by an explicitly configured allowed parent origin.

Unknown parents see the external/manual options and a message explaining that the embedded wallet must be opened on
a Vortex-owned page. A scalable first-party popup/handoff may be added without sending wallet keys or auth tokens
through `postMessage`; messages must be origin-checked and nonce-bound.

## Tests

### Unit tests

- wallet-mode parsing and guards;
- Privy configuration defaults;
- no Privy initialization for `none` or `external`;
- manual/idempotent provisioning;
- deterministic embedded-wallet selection;
- signer mismatch rejection;
- typed-data signature formatting;
- transaction adapter routing;
- iframe parent-origin policy;
- auth token refresh propagation;
- logout teardown;
- dashboard and widget state-machine wallet branches.

### API integration tests

- wallet routes require Supabase authentication;
- a profile can read only its wallets;
- invalid modes are rejected;
- mode switching is rejected during a nonterminal ramp;
- duplicate wallet registration is idempotent;
- a wallet owned by another profile is rejected;
- live-mode registration fails closed without ownership verification;
- wallet metadata never grants ramp ownership.

### Contract/scenario tests

- embedded and external adapters submit identical ramp request shapes;
- each EVM user-wallet phase produces the expected hashes/signatures;
- server-issued signer/address binding remains enforced;
- existing onramp/offramp corridor scenarios continue to pass;
- the one-active-ramp invariant remains unchanged.

### Playwright tests

- existing-wallet dashboard flow is unchanged;
- no-wallet user chooses and provisions an embedded wallet;
- embedded address is selected as an onramp destination;
- embedded offramp handles signing success, rejection, and insufficient balance;
- logout/login restores the wallet;
- wallet switching is blocked during an active ramp;
- widget defers wallet choice until needed;
- AssetHub does not offer Privy;
- allowed iframe parent succeeds;
- unsupported iframe parent fails safely.

Provider ownership calls are mocked in deterministic API tests, and both wallet kinds use fake adapters in signing
contract tests. Playwright has default-disabled and Privy-enabled choice configurations. End-to-end Privy SDK wallet
creation and live signing remain an opt-in staging smoke test and never use production credentials.

## Operational configuration

Public client configuration:

```text
VITE_PRIVY_ENABLED=false
VITE_PRIVY_APP_ID=
VITE_PRIVY_CLIENT_ID=
VITE_PRIVY_PROVISIONING_ENABLED=false
VITE_PRIVY_ONRAMP_ENABLED=false
VITE_PRIVY_OFFRAMP_ENABLED=false
VITE_PRIVY_GAS_POLICY=user_pays
VITE_PRIVY_WIDGET_PARENT_ORIGINS=
```

Server-only configuration:

```text
PRIVY_APP_ID=
PRIVY_APP_SECRET=
PRIVY_WALLET_REGISTRATION_ENABLED=false
```

Production startup must reject an enabled server-side registration configuration with missing credentials. Client
applications degrade to the existing wallet flow if public Privy configuration is incomplete.

## Acceptance criteria

- A user can retain the current Reown wallet flow without a Privy identity or wallet.
- A user can authenticate through Vortex OTP and explicitly create an embedded EVM wallet.
- The same Supabase user restores the same wallet in dashboard and widget.
- An embedded wallet can receive an onramp without an extension.
- An embedded wallet can sign all supported EVM offramp transaction shapes.
- Users can export their client-created embedded wallet.
- Privy is hidden on Substrate/AssetHub routes.
- Unknown iframe parents do not initialize Privy.
- Supabase remains the only Vortex API principal.
- All existing ramp ownership, ephemeral-key, presign, receipt, and one-active-ramp invariants continue to pass.

## Credentialed smoke-test checklist

The following steps remain pending until non-production Privy credentials and dashboard access are available:

- configure Supabase JWKS custom authentication;
- configure development/staging allowed origins and app client;
- verify lazy custom-auth enrollment and Privy MAU behavior;
- verify dashboard/widget wallet continuity;
- exercise wallet export;
- exercise each EVM signature/transaction path in the Vortex sandbox;
- validate the selected gas mode;
- validate one known iframe parent and one rejected parent.
