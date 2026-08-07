# Coinbase CDP embedded wallet rollout

This is the maintained deployment runbook for the optional Coinbase Developer Platform
(CDP) EVM wallet in the dashboard and widget. The external-wallet experience remains the
fallback, and AssetHub/other Substrate paths do not use CDP.

The source can be deployed with every CDP flag disabled. Production provisioning, signing,
and export remain blocked by
[`RISK-018`](security-spec/RISK-REGISTER.md#current-risks) until every production gate below
is evidenced or an explicit, time-bounded exception is approved in the risk register.

## Current boundary

- The implementation has been exercised only with test-environment CDP access and test networks.
- Vortex does not yet have the production CDP access needed to verify project, custom-auth,
  policy, MFA, origin, audit-log, or incident-control configuration.
- Source-level ownership, profile binding, signing-adapter, feature-flag, and mocked browser
  tests do not prove that the production CDP control plane is configured safely.
- Test-environment users and wallets must be treated as disposable until Coinbase confirms the
  project lifecycle and any supported migration path.

## Assumptions awaiting Coinbase or production-access confirmation

These assumptions are deliberately conservative. Update this table and the owning security
spec when production access or a written Coinbase answer resolves one.

| ID | Working assumption | Consequence until confirmed | Required evidence |
|---|---|---|---|
| CDP-A1 | Production uses a project distinct from the current test project. | Never place the test project ID or its origins/policies in production configuration. | Production project ID and administrator screenshot/export showing environment ownership. |
| CDP-A2 | CDP end users, device credentials, and EOA discovery are project-scoped, and there is no transparent test-to-production migration. | Do not copy `profile_wallets` rows between projects or promise preservation of a test EOA. Provision a new production identity/EOA unless Coinbase supplies and Vortex validates a supported migration. | Written Coinbase confirmation of project scoping, project promotion, and migration behavior; if migration exists, a rehearsed test with address equality and rollback. |
| CDP-A3 | Production custom auth can validate Vortex's Supabase issuer/JWKS, accepted audience, asymmetric algorithm, expiry, and stable `sub` mapping without a compatibility exception. | Keep registration and client CDP flags off if any claim or algorithm differs. | Recorded production custom-auth configuration plus positive and negative JWT tests. |
| CDP-A4 | CDP policies can fail closed over every Vortex operation: EIP-1559 transaction signing, EIP-712 permits, and the narrowly scoped SIWE message used by the widget. | Do not enable signing if unsupported methods fall through, policy changes are not atomic/auditable, or broad message/hash signing must be allowed. | Policy export and tests for allowed fixtures plus wrong signer, chain, contract, method, spender, amount, deadline, destination, value, and raw-hash/message denials. |
| CDP-A5 | Delegated signing can remain disabled and protected operations can enforce suitable MFA/device enrollment controls. | No backend CDP Wallet Secret may receive end-user signing authority. Production remains blocked if MFA or delegation state cannot be verified and monitored. | Production delegation/MFA configuration, least-privilege administrator list, and change-audit evidence. |
| CDP-A6 | CDP's supported export UI keeps raw key material outside Vortex JavaScript and supports the required recovery browsers. | Use only the isolated `ExportWalletModal`; do not import a programmatic raw-key export API. | Coinbase confirmation, browser test evidence, and an imported-key address match for a dedicated low-value test wallet. |
| CDP-A7 | Browser-native confirmation is available in every approved top-level and iframe deployment (including the iframe sandbox policy) and is an acceptable exact-payload review for the initial staff cohort. | Signing and export fail closed when `window.confirm` is unavailable. Do not broaden rollout until security and product review the confirmation on the supported browser/iframe matrix; replace it with a dedicated reviewed UI if clarity or iframe support is insufficient. | Credentialed browser evidence for transaction, EIP-712, SIWE, rejection, export, and sandboxed-iframe cases, plus security/product sign-off. |

If CDP-A2 is disproved because the current project can be promoted in place, preserve the same
project and prove that existing test users resolve to the same addresses before changing any
Vortex wallet metadata. If it is confirmed, production starts with clean CDP identities; test
wallet metadata is not migrated.

## Configuration

All values ship disabled. A CDP project ID is public configuration, not signing authority.

API:

```text
CDP_WALLET_REGISTRATION_ENABLED=false
CDP_PROJECT_ID=<environment project id>
```

Dashboard:

```text
VITE_CDP_ENABLED=false
VITE_CDP_PROJECT_ID=<environment project id>
VITE_CDP_PROVISIONING_ENABLED=false
VITE_CDP_ONRAMP_ENABLED=false
VITE_CDP_OFFRAMP_ENABLED=false
VITE_CDP_SIGNING_ENABLED=false
VITE_CDP_EXPORT_ENABLED=false
```

Widget:

```text
VITE_CDP_ENABLED=false
VITE_CDP_PROJECT_ID=<environment project id>
VITE_CDP_PROVISIONING_ENABLED=false
VITE_CDP_SIGNING_ENABLED=false
VITE_CDP_EXPORT_ENABLED=false
VITE_CDP_WIDGET_PARENT_ORIGINS=https://trusted-parent.example
```

The client requires both the base flag and a project ID before mounting CDP. Provisioning,
signing, and export are independent, fail-closed capabilities. This allows restore and onramp
destination use to remain available while stopping new wallets, signatures, or key disclosure.
Dashboard offramp signing requires both `VITE_CDP_OFFRAMP_ENABLED` and
`VITE_CDP_SIGNING_ENABLED`.

## Production gates

### Source and release gates

- [ ] The branch is reconciled with the release base, migrations have unique production-safe
  numbers, and the lockfile is regenerated.
- [ ] Unit, integration, typecheck, build, and E2E suites pass on the reconciled release commit.
- [ ] Tests cover ownership mismatch, duplicate binding, active-ramp mode changes, provider
  timeout/failure, payload mutation, replay, wrong signer/chain/contract, excessive approval,
  typed-data spender substitution, and the BSC fee fallback.
- [ ] A security reviewer verifies that the selected wallet signs only the server-issued payload
  and that wallet metadata never authorizes money movement by itself.
- [ ] The wallet-capable pages enforce a reviewed CSP, load no unnecessary third-party scripts,
  render a human-readable signing confirmation, and expose only the isolated export UI.
- [ ] Aggregate monitoring and kill switches cover authentication, registration, provisioning,
  signing, policy denial, export, and provider failure without recording wallet identifiers,
  tokens, signatures, keys, or raw payloads.

### CDP control-plane gates

- [ ] A dedicated production project exists; test/development origins and identities are absent.
- [ ] Coinbase/credentialed production testing has resolved CDP-A1 through CDP-A7 above,
  including the project migration and browser-confirmation questions.
- [ ] Custom auth verifies the exact production Supabase issuer, JWKS, audience, asymmetric
  algorithm, expiry, and `sub`; invalid issuer/audience/algorithm/subject tests fail closed.
- [ ] Only exact production HTTPS dashboard, widget, and approved parent origins are allowlisted.
- [ ] Delegated signing is disabled and no browser bundle contains a CDP API key or Wallet Secret.
- [ ] Fail-closed policies restrict networks, contracts, values, methods, primitive arguments,
  typed-data domains/fields, and the required SIWE message flow; raw hash and unrelated message
  signing are denied.
- [ ] MFA/device enrollment, secure export, administrator access, immutable audit evidence, and
  emergency deny-all controls are enabled and tested.

### Credentialed external smoke gates

- [ ] A new user can opt in, create exactly one EOA, register it, refresh, sign out/in, and restore
  the same CDP user and address.
- [ ] A separate user, mismatched CDP user ID, mismatched address, and wallet already bound to
  another profile are rejected.
- [ ] External EVM wallets still complete the same onramp/offramp flows, and AssetHub/Polkadot
  flows never initialize CDP.
- [ ] Base and BSC low-value transactions preserve signer, chain ID, nonce, gas, fee fields,
  destination, value, and calldata; BSC broadcasts with a nonzero priority fee.
- [ ] Every supported offramp signs and validates its exact transaction and EIP-712 permit set;
  the widget's SIWE authentication signs only the expected challenge.
- [ ] The exact-payload review is legible and cannot be suppressed in every supported top-level
  and approved iframe configuration; rejecting or losing the confirmation blocks the CDP call.
- [ ] Onramps use the embedded address as the requested destination and never request a user-owned
  on-chain transaction or permit signature; any SIWE authentication remains separately scoped.
- [ ] Top-level, approved-parent, unapproved-parent, and referrer-less iframe cases behave as
  specified; unknown ancestry fails closed.
- [ ] Export/recovery succeeds on the supported browser matrix, and importing the disclosed key
  derives the registered address without Vortex observing the key.
- [ ] Logs, Sentry, analytics, and support tooling contain no address, CDP user ID, bearer token,
  TWS identifier, signature, key, or raw signing payload.
- [ ] Rollback and deny-all drills complete before any non-staff cohort receives funds.

## Staged enablement

1. Deploy migrations and source with all flags off.
2. Complete the production gates and attach evidence to the release review.
3. Configure the production project and enable API registration for staff only.
4. Enable base CDP support with provisioning, signing, and export off; verify restore for any
   pre-provisioned staff wallet.
5. Enable provisioning for a small staff cohort and run creation/restoration/recovery tests.
6. Enable onramp use and complete supported EVM destination tests.
7. Enable signing for staff only after CDP policy tests pass; complete every signing fixture and
   low-value transaction test before enabling dashboard offramp use.
8. Enable export for a dedicated low-value recovery wallet and complete the recovery matrix.
9. Add approved widget parent origins one at a time.
10. Expand by explicit cohorts while monitoring denials, failures, exports, and signing volume.

## Rollback and incident response

Rollback in this order unless an active compromise requires the CDP deny-all control first:

1. Disable embedded-wallet signing and export.
2. Disable dashboard onramp and offramp use.
3. Disable new provisioning while preserving read-only restore.
4. Remove affected widget parent origins.
5. Disable API registration.
6. Apply or verify deny-all policies, revoke affected Supabase sessions, and disable any
   delegation if wallet authority may be compromised.
7. Disable base client support only for a severe incident and publish recovery guidance for
   existing users.

Do not delete `profile_wallets` records during rollback. They are recovery metadata, not signing
authority. If a production gate is waived, record the owner, exact cohort/value/network scope,
expiry, monitoring, and rollback condition in `RISK-018` before enablement.
