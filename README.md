# Vortex

Vortex is a cross-border payments gateway built on Pendulum. It provides fiat
onramps and offramps, cross-chain stablecoin routing, partner APIs, an embeddable
widget, an account dashboard, and an integration SDK.

## Repository

This is a Bun monorepo.

| Workspace | Purpose |
|---|---|
| [`apps/api`](apps/api/) | Express API, ramp engine, provider integrations, PostgreSQL workers |
| [`apps/frontend`](apps/frontend/) | Public site and embeddable ramp widget |
| [`apps/demo`](apps/demo/) | Minimal browser SDK example for a BRL/PIX onramp |
| [`apps/dashboard`](apps/dashboard/) | Authenticated customer dashboard |
| [`apps/rebalancer`](apps/rebalancer/) | Liquidity rebalancing service |
| [`packages/shared`](packages/shared/) | Shared contracts, token/network configuration, and signing utilities |
| [`packages/kyc`](packages/kyc/) | Provider KYC/KYB state machines shared by the two web apps |
| [`packages/sdk`](packages/sdk/) | Public `@vortexfi/sdk` integration package |
| [`contracts/relayer`](contracts/relayer/) | Token relayer Solidity project |
| [`contracts/monerium-forwarder`](contracts/monerium-forwarder/) | Monerium B2B onramp forwarder Solidity project (Foundry) |

See [`MAP.md`](MAP.md) for detailed wayfinding and [`docs/README.md`](docs/README.md)
for the documentation structure.

## Getting started

Requirements: Node.js 18+ and the Bun version declared by `packageManager` in
[`package.json`](package.json).

```bash
bun install
bun dev
```

In a fresh Git worktree, run `bun bootstrap:worktree` instead of `bun install`; it also
builds the shared and SDK workspaces required by the apps.

The Foundry-based contracts in `contracts/monerium-forwarder` use a git submodule
(`forge-std`). If you plan to work on those contracts, initialize it once with
`git submodule update --init` (or clone with `git clone --recurse-submodules`).
Everything else in the monorepo works without this step.

The default development command starts the shared package, API, and widget. Run other
surfaces explicitly:

```bash
bun dev:dashboard
bun dev:demo
bun dev:rebalancer
```

Copy the relevant workspace's `.env.example` to `.env` before running code that needs
database, provider, chain, or authentication credentials. Never commit real secrets.

## Common commands

```bash
bun build
bun typecheck
bun verify
bun lint
bun lint:fix
bun test
```

Useful targeted commands:

```bash
bun test:db:start
bun test:api
bun test:frontend
bun test:e2e
bun test:e2e:dashboard
bun test:contracts:relayer
bun test:contracts:monerium-forwarder
```

The root scripts in [`package.json`](package.json) are the canonical command list.
Workspace-specific setup and caveats live in their `README.md` or `CLAUDE.md`.

## Documentation

- [`docs/security-spec/`](docs/security-spec/README.md) is the audit-facing source of
  truth for security-sensitive behavior.
- [`docs/api/`](docs/api/README.md) contains the public OpenAPI source and partner guides.
- [`docs/README.md`](docs/README.md) indexes current architecture, product, operations,
  decisions, incidents, and proposals.
- [`AGENTS.md`](AGENTS.md) links to the canonical root [`CLAUDE.md`](CLAUDE.md); scoped
  `CLAUDE.md` files contain app and package rules.

## AI integration guidance

The repository includes a Vortex integration skill at
[`.agents/skills/vortex-integration/SKILL.md`](.agents/skills/vortex-integration/SKILL.md).
When working outside this repository, it can be installed from:

```text
https://github.com/pendulum-chain/vortex/tree/main/.agents/skills/vortex-integration
```

The published AI-agent integration guide is available at
<https://api-docs.vortexfinance.co/ai-agent-integration>.
