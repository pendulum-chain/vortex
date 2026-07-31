# Vortex API

The API owns quote creation, authenticated ramp registration, phase execution,
provider integrations, webhooks, customer/onboarding data, and background recovery.
It uses Express, PostgreSQL, Sequelize, and Bun.

## Local setup

From the repository root:

```bash
bun install
cp apps/api/.env.example apps/api/.env
bun dev:backend
```

Configure PostgreSQL and any provider credentials required by the flow you are testing.
The service listens on `http://localhost:3000` by default.

## Database

Run from `apps/api/`:

```bash
bun migrate
bun migrate:revert-last
bun seed:phase-metadata
```

Do not run bulk migration reverts against shared or production databases. The production
migrations under `src/database/migrations/` are the schema source of truth.

## Tests

```bash
# From the repository root
bun test:db:start
bun test:api

# From apps/api
bun test
bun test <file-or-pattern>
```

The normal suite is hermetic. Tests that call live provider sandboxes or chains require
`RUN_LIVE_TESTS=1` and are never part of the default PR path. See
[`docs/testing.md`](../../docs/testing.md).

## Architecture and contracts

- [`CLAUDE.md`](CLAUDE.md) contains API-specific commands and contributor rules.
- [`src/api/services/phases/blocks/README.md`](src/api/services/phases/blocks/README.md)
  explains the block-flow quote and execution architecture.
- [`docs/security-spec/`](../../docs/security-spec/README.md) is authoritative for
  security-sensitive behavior and accepted risks.
- [`docs/api/`](../../docs/api/README.md) is the partner-facing API documentation source.
- [`docs/identity-model.md`](../../docs/identity-model.md)
  explains the cross-module customer, provider, partner, and recipient model.

Do not duplicate endpoint catalogs or security rules in this README; update the canonical
sources above.
