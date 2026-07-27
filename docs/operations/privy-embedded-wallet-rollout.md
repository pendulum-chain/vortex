# Privy Embedded Wallet Rollout

This runbook enables the optional Privy path without changing the existing external-wallet experience. Apply it
independently in local, staging, and production; use separate Privy clients or apps and secrets for each environment.

## Prerequisites

1. Create or select a Privy application.
2. In Privy, enable client-side JWT-based authentication for the Supabase project used by the environment.
3. Register the Supabase JWKS endpoint and use `sub` as the user ID claim:

   ```text
   https://<supabase-project>.supabase.co/auth/v1/.well-known/jwks.json
   ```

   Confirm the Supabase project is using an asymmetric signing key exposed by that endpoint before rollout.
4. Add exact Vortex client origins to Privy's allowed origins. Do not use broad hosting-provider wildcards for
   production previews.
5. Decide which exact third-party origins may embed the widget. Each must be present both in Privy's allowed origins
   and in `VITE_PRIVY_WIDGET_PARENT_ORIGINS`.
6. Put the Privy app secret only in the API secret manager. Never place it in either Vite environment.

## Configuration

API:

```text
PRIVY_WALLET_REGISTRATION_ENABLED=false
PRIVY_APP_ID=<environment app id>
PRIVY_APP_SECRET=<server secret>
```

Dashboard:

```text
VITE_PRIVY_ENABLED=false
VITE_PRIVY_APP_ID=<environment app id>
VITE_PRIVY_CLIENT_ID=<environment client id, if used>
VITE_PRIVY_PROVISIONING_ENABLED=false
VITE_PRIVY_ONRAMP_ENABLED=false
VITE_PRIVY_OFFRAMP_ENABLED=false
VITE_PRIVY_GAS_POLICY=user_pays
```

Widget:

```text
VITE_PRIVY_ENABLED=false
VITE_PRIVY_APP_ID=<environment app id>
VITE_PRIVY_CLIENT_ID=<environment client id, if used>
VITE_PRIVY_PROVISIONING_ENABLED=false
VITE_PRIVY_GAS_POLICY=user_pays
VITE_PRIVY_WIDGET_PARENT_ORIGINS=https://trusted-parent.example
```

The client requires `VITE_PRIVY_ENABLED=true` and a nonempty app ID before mounting Privy. Provisioning additionally
requires `VITE_PRIVY_PROVISIONING_ENABLED=true`. Existing embedded-wallet users can still restore their wallet while
new provisioning is disabled, provided the base feature remains enabled.

## Staged Enablement

1. Deploy database migrations and API code with every flag off.
2. Set API credentials, enable `PRIVY_WALLET_REGISTRATION_ENABLED`, and verify API startup.
3. Enable base Privy support for an internal staging origin, but keep provisioning off. Confirm external wallets and
   all Polkadot/AssetHub flows are unchanged.
4. Enable provisioning for internal accounts. Test create, refresh, logout/login restore, export, and switch back to
   an external wallet.
5. Enable the dashboard onramp destination flag and run supported EVM onramp scenarios.
6. Enable the dashboard offramp flag and run all EVM signing phases, including rejection, insufficient balance, and
   network switching.
7. Enable approved widget parents one at a time. Confirm an unlisted or referrer-less iframe shows the safe fallback
   and never initializes Privy.
8. Roll out to a small production cohort before general availability.
9. Keep `VITE_PRIVY_GAS_POLICY=user_pays` until a separate gas-sponsorship review is complete.

## Credentialed Smoke Test

Use a non-production test user and low-value testnet funds:

- authenticate with Vortex OTP and choose the embedded option;
- verify exactly one wallet is created and registered;
- refresh and sign out/in, then verify the same address returns;
- export the selected wallet and verify the address after importing it into an independent client;
- submit each supported EVM signing phase and compare the request/transaction shape with an external wallet;
- attempt to register a mismatched wallet ID/address and confirm it is rejected;
- start a ramp, attempt a mode change, and confirm it is rejected;
- load the widget top-level, in an allowed parent, in a disallowed parent, and in a referrer-less sandbox;
- verify no Privy UI is offered for AssetHub or other Polkadot paths;
- inspect Sentry, API logs, and analytics for wallet identifiers or sensitive signing material.

## Monitoring

Track counts and rates without addresses:

- embedded wallet registration successes and failures by error code;
- Privy authentication and provider-unavailable errors;
- mode-switch conflicts caused by active ramps;
- signing rejection and transaction-confirmation failure rates by wallet kind and chain;
- external versus embedded completion rates;
- gas sponsorship spend if sponsorship is ever enabled.

Alerts must not include wallet addresses, Privy wallet IDs, JWTs, signatures, or raw transaction bodies.

## Rollback

The switches are intentionally granular:

1. Set onramp/offramp flags to `false` to stop embedded-wallet use in new ramp flows while preserving account access
   and export.
2. Set provisioning to `false` to stop creating new wallets while allowing existing users to restore/export.
3. Remove affected widget parent origins to disable only a compromised embed.
4. Set API registration to `false` to reject new wallet bindings.
5. Set base client support to `false` only for a severe incident; tell existing embedded-wallet users how to export or
   recover before doing so when possible.

Do not delete `profile_wallets` records during rollback. They are required to restore the same user-wallet association
after re-enablement and are not signing authority.
