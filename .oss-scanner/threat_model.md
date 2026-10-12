# Vortex threat model

Read by Anthropic's OSS Scanner before it audits this repository. The normative security
expectations live in [`docs/security-spec/`](../docs/security-spec/README.md): start with
`00-system-overview/architecture.md`, then the module spec for the code you are reading. Code
that contradicts an invariant there is a finding.

## What Vortex does and where untrusted input enters

Vortex is a cross-border payment gateway. It converts fiat (BRL, EUR, USD, MXN, COP, ARS) to
stablecoins and back across EVM chains, Pendulum and AssetHub. The API orchestrates each
conversion ("ramp") as a sequence of phases. It holds operator keys that fund per-ramp
ephemeral accounts, subsidize shortfalls and distribute fees. Users and partners sign their own
transactions client-side and submit them presigned.

Treat all of the following as attacker-controlled:

- Every HTTP request to `apps/api`: anonymous quote requests, user sessions (Supabase email
  OTP), partner API keys (`pk_`/`sk_`), and the admin token's routes.
- Presigned transactions and addresses submitted during ramp registration and update.
- Inbound webhooks from fiat payment providers.
- Responses from fiat providers, price feeds and chain RPCs. The code must validate them
  rather than trust them.
- URL and embed parameters of the widget (`apps/frontend`), which partners embed in their
  own sites.

## Components that matter most / least

Most important, roughly in order:

1. The ramp engine in `apps/api/src/api/services/phases/` and the quote, fee, discount and
   subsidy logic in `apps/api/src/api/services/quote/` and `ramp/`: anything that moves funds
   or decides how much moves.
2. Authentication and authorization: `apps/api/src/api/middlewares/`, API credentials,
   admin routes and admin impersonation. Ownership must be checked after a resource is loaded.
3. Validation of presigned transactions and of inbound webhooks.
4. `contracts/monerium-forwarder` (forwarder clones, factory and subsidy vault) and
   `contracts/relayer` (TokenRelayer).
5. `apps/rebalancer`, which moves platform liquidity between chains.
6. `packages/shared` (signing helpers, wire types) and `packages/sdk` (ephemeral key handling
   for partner integrations).

Lower priority but in scope: `apps/frontend`, `apps/dashboard` and `apps/gold` (client-side
key storage and XSS matter there). Out of scope: `apps/demo` (an example), `scripts/`,
`supabase/` snippets, `docs/`, and test helpers.

## How to exercise it

The image has every dependency installed, `@vortexfi/shared` and `@vortexfi/sdk` built, and
both contract projects compiled. Start PostgreSQL before the API suite:

```bash
service postgresql start
cd /src/apps/api && bun test --timeout 15000
cd /src/packages/shared && bun test
cd /src/packages/sdk && bun test
cd /src/packages/kyc && bun test
cd /src/apps/rebalancer && bun test
cd /src/contracts/monerium-forwarder && forge test
cd /src/contracts/relayer && bunx hardhat test
```

Suites that call real providers or chains skip themselves offline (they need
`RUN_LIVE_TESTS` or `ETH_RPC_URL`). `apps/api/src/test-utils/` holds the factories and fakes
for API tests; write a proof of concept as a `*.test.ts` next to the affected code (or a
Foundry test for the forwarder contracts) so it runs offline in this image.

## How we rate severity

- **Critical**: an unauthenticated or ordinary user/partner can steal, redirect or
  permanently lock user or platform funds; get a payout without paying; obtain server-held
  keys or secrets; bypass admin authentication; or execute code on the API server.
- **High**: an attacker reads or acts on another account's quotes, ramps, recipients,
  webhooks, API keys or KYC data; moves quote, fee or subsidy amounts outside the bounds the
  spec allows; forges a provider webhook; or strands funds so that an operator must recover
  them by hand.
- **Medium**: one client can stall ramp processing or the API; errors leak internal state
  without secrets or personal data; or the issue needs the admin token or a partner's secret
  key and grants nothing beyond that role.
- **Low**: hardening gaps without a demonstrated exploit path, and client-side issues that
  need unusual user interaction.

## Reports and patches

- One report per root cause, listing every affected route or caller.
- Name the attacker's starting privileges, what they gain, and the spec invariant violated.
- Propose a minimal patch in the surrounding code's style, with a regression test.

## Anything to leave alone

- Exceptions accepted or deferred in `docs/security-spec/RISK-REGISTER.md`, unless you show
  the accepted bound does not hold.
- Moonbeam and other dormant XCM paths: report them only if a live route reaches them.
- Vulnerabilities in dependencies, chains or providers without a reachable path in Vortex code.
- Placeholder values in `.env.example` files and credentials in old migrations, which are
  revoked. Report one only if you can show it is still valid.
