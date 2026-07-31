# Repository Map

Wayfinding for the Vortex monorepo. Start with the nearest `CLAUDE.md` before changing a
workspace; use [`docs/README.md`](docs/README.md) to locate durable project context.

## Applications

| Path | Responsibility |
|---|---|
| `apps/api` | Express API, PostgreSQL/Sequelize models and migrations, block-flow ramp engine, provider integrations, webhooks, and workers. |
| `apps/frontend` | React widget and public web surface. XState ramp/KYC flows, wallets, and partner embedding. |
| `apps/dashboard` | React account dashboard. Auth, customer entities, onboarding, recipients, history, and self-ramp flows. |
| `apps/rebalancer` | Standalone service for cross-chain liquidity correction and profitability-aware rebalancing. |

## Packages

| Path | Responsibility |
|---|---|
| `packages/shared` | `@vortexfi/shared`: wire contracts, tokens/networks, provider clients, signing helpers, and shared configuration. |
| `packages/kyc` | `@vortexfi/kyc`: provider KYC/KYB state machines shared by widget and dashboard. |
| `packages/sdk` | `@vortexfi/sdk`: public partner SDK for quote, registration, signing, update, start, and status flows. |

## Contracts

| Path | Responsibility |
|---|---|
| `contracts/relayer` | Hardhat project for `TokenRelayer.sol`, tests, and deployment scripts. |
| `contracts/cctp-settlement` | CCTP settlement contract workspace. |

## Documentation

| Path | Responsibility |
|---|---|
| `docs/security-spec` | Normative security invariants, current risk register, and dated audit evidence. |
| `docs/api` | Partner-facing OpenAPI and guide-page publication source. |
| `docs/architecture` | Current cross-module architecture. |
| `docs/decisions` | Accepted ADRs. |
| `docs/product` | Current product specs and acknowledged gaps. |
| `docs/operations` | Testing, operational behavior, runbooks, and incidents. |
| `docs/research` | Dated external research retained for live decisions. |
| `docs/proposals` | Active, non-authoritative discussion drafts. |

The full placement and lifecycle policy is in [`docs/README.md`](docs/README.md).

## Tooling and configuration

| Path | Responsibility |
|---|---|
| `scripts` | Repository coverage and maintenance tooling. |
| `supabase` | Supabase configuration, migrations, snippets, and email templates. |
| `.agents/skills` | Purpose-built, repository-specific agent workflows (currently Vortex integration and Sentry guidance). |
| `.claude` | Shared Claude Code settings and worktree configuration. |
| `.clinerules` | Pointer from Cline to the canonical `CLAUDE.md` and documentation policy. |
