# Coinbase CDP Embedded Wallet Rollout

This runbook enables the optional CDP EVM-wallet path without removing the existing external-wallet experience.

## Prerequisites

1. Create a separate CDP project for each environment.
2. Configure CDP custom authentication for that environment's Supabase issuer and JWKS.
3. Confirm Supabase issues ES256 or RS256 access tokens.
4. Add the exact dashboard, widget, and approved iframe-parent origins in CDP.
5. Fund test EOAs on every network used by the smoke test.

## Configuration

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
```

Widget:

```text
VITE_CDP_ENABLED=false
VITE_CDP_PROJECT_ID=<environment project id>
VITE_CDP_PROVISIONING_ENABLED=false
VITE_CDP_WIDGET_PARENT_ORIGINS=https://trusted-parent.example
```

The client requires the base flag and a project ID before it mounts CDP. Provisioning has a separate flag. Existing
embedded-wallet users can restore their wallet while provisioning is off when base support remains enabled.

## Staged Enablement

1. Deploy migrations and code with all flags off.
2. Set the API project ID and enable registration.
3. Enable base CDP support for an internal environment while keeping provisioning off.
4. Enable provisioning for test accounts. Verify create, refresh, logout/login restore, and secure export.
5. Enable dashboard onramp and run supported EVM onramp scenarios.
6. Enable dashboard offramp. Test EIP-712 permits and every EVM transaction phase.
7. Verify Base and BSC transactions; BSC must sign and broadcast with a nonzero priority fee.
8. Enable approved widget parents one at a time and verify unlisted/referrer-less parents fail closed.
9. Roll out to a small production cohort before general availability.

## Credentialed Smoke Test

- Authenticate with Vortex OTP and choose the embedded option.
- Verify one CDP EOA is created and registered.
- Refresh and sign out/in; verify the same CDP user and EOA return.
- Export through CDP's secure modal and verify the imported key yields the registered address.
- Exercise all supported EVM signing phases and compare transaction fields with the server-issued payload.
- Attempt a mismatched CDP user ID/address registration and confirm rejection.
- Start a ramp, attempt a mode change, and confirm rejection.
- Test top-level, allowed-parent, disallowed-parent, and referrer-less widget contexts.
- Verify AssetHub and Polkadot paths never initialize CDP.
- Inspect monitoring and logs for wallet identifiers or signing material.

## Monitoring and Rollback

Track aggregate registration, provider, mode-conflict, signing, and confirmation failures without wallet identifiers.

Rollback in this order:

1. Disable dashboard onramp/offramp use.
2. Disable new provisioning while preserving restore/export.
3. Remove affected widget parent origins.
4. Disable API registration.
5. Disable base client support only for a severe incident, with a recovery notice for existing users.

Do not delete `profile_wallets` records during rollback. They are metadata needed to restore the association and are
not signing authority.
