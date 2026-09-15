# ADR 0006: Run the Monerium OAuth and White-Label Apps in Parallel

**Status:** Accepted (decided 2026-09-14, implemented 2026-09-14/15 on top of the Monerium
reintegration, PR #1359). How the system works lives in
[`operations-monerium-interface.md`](operations-monerium-interface.md) and
[`product-dashboard.md`](product-dashboard.md); invariants and the threat model in
[`security-spec/05-integrations/monerium.md`](security-spec/05-integrations/monerium.md);
accepted risk in [`security-spec/RISK-REGISTER.md`](security-spec/RISK-REGISTER.md)
(RISK-025). The B2B onramp ([`adr-0005-monerium-b2b-onramp.md`](adr-0005-monerium-b2b-onramp.md))
is unaffected.

## Context

The Monerium reintegration rebuilt the EUR onramp on the white-label application: mint EURe to
the wallet linked to the user's Monerium profile, take that wallet's ERC-2612 permit, swap on
Polygon, settle through Squid. It assumed users are provisioned into the white-label app. That
onboarding is blocked until KYC sharing exists, so the only way to offer the EUR rail again is
the Monerium OAuth application, where users complete KYC/KYB in Monerium's hosted flow.

Sandbox probes on 2026-09-14 settled the facts the design depends on:

- The white-label application cannot see profiles that only authorized the OAuth application
  (`403` on profile, address, and IBAN reads; absent from its profile list). The only
  cross-app read is `GET /addresses/{address}`, which reveals the owning profile ID but nothing
  about it.
- With the user's OAuth token, `POST /addresses` links a wallet (`201`) and `POST /ibans`
  requests an IBAN (`202`); a profile holds one IBAN, and a second chain or address requires
  moving it (`PATCH /ibans/{iban}`).
- Monerium ignores the legacy link-at-login authorize parameters.
- The active onramp is pinned to Polygon mainnet while Monerium's sandbox mints on testnets, so
  the pay-in itself can only be verified end to end in production.

## Decision

1. **Both apps stay in service; only the credential differs.** At EUR ramp registration the
   backend resolves the user's `monerium`/`eur` binding through the white-label app first and,
   when that app answers `403` or `404`, through the user's backend-held OAuth token. Any other
   white-label failure does not switch apps. The on-chain flow is identical for both paths.
2. **No stored source.** Which app served a profile is decided per call and logged, never
   persisted: after registration the ramp facts make the source irrelevant.
3. **OAuth tokens stay in backend memory only**, as before. A missing or rejected session fails
   closed with `MONERIUM_REAUTHENTICATION_REQUIRED`; a missing binding with
   `MONERIUM_ONBOARDING_REQUIRED`. Clients prompt a reconnect.
4. **Vortex provisions the wallet and IBAN for OAuth users.** The client collects the EOA's
   signature over Monerium's fixed ownership message; the backend verifies it and the EOA
   requirement, links through the app that can read the profile, and requests the profile's
   single IBAN when none exists. An IBAN that sits elsewhere is moved only on an explicit owner
   request, because a move redirects future SEPA deposits. Status reads never mutate provider
   state. Wallet-address discovery of unbound users is not offered.
5. **Callback allowlist.** The OAuth callback is chosen by a `client` selector from the
   configured dashboard and widget URIs and bound into the transaction; a mismatch renders
   Monerium's authorization page empty, never a caller-supplied redirect.
6. **All first-party clients.** The dashboard and the widget run the OAuth onboarding, the
   wallet-link step, and the permit signing; the SDK returns the permit as a user-owned
   transaction. The Mykobo onboarding paths stay only for persisted legacy flows.

## Consequences

- OAuth-onboarded users depend on a backend-memory token for readiness and registration; a
  backend restart forces a reconnect before their next EUR ramp (RISK-025). An encrypted
  refresh-token store is the alternative if reconnect prompts prove too frequent.
- OAuth-to-white-label migration, profile creation through the white-label API, and external
  profile import remain undefined and are still refused.
- EUR SELL remains unavailable for new quotes.
- Sandbox verification stops at onboarding, wallet linking, and IBAN provisioning; the Polygon
  pay-in is verified in production only until the flow gains a testnet variant.
