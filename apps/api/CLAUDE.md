# apps/api — Vortex backend

Express + PostgreSQL/Sequelize service. Root `CLAUDE.md` holds cross-cutting rules
(over-engineering, security-spec sync, testing policy); this file holds API-scoped
architecture and commands. Run commands from `apps/api/` unless noted.

## Architecture

- **API layer**: routes in `src/api/routes/`, controllers in `src/api/controllers/`.
- **Services**: business logic in `src/api/services/`.
- **Models**: Sequelize models in `src/models/` (RampState, QuoteTicket, Partner, …).
- **Workers**: background jobs in `src/api/workers/`.
- **Cross-chain**: XCM handlers, Nabla AMM integration, Stellar/BRLA APIs.
- **Middlewares / observability / errors / helpers**: under `src/api/`.

### Ramp state machine

The ramping process runs through defined phases; metadata and valid transitions live in
PostgreSQL, seeded via `bun seed:phase-metadata`.

- **Offramp**: prepareTransactions → squidRouter → pendulumFundEphemeral → subsidizePreSwap → nablaApprove → nablaSwap → subsidizePostSwap → performBrlaPayout → pendulumCleanup
- **Onramp**: brlaTeleport → createMoonbeamEphemeral → executeMoonbeamToPendulumXCM → subsidizePreSwap → nablaApprove → nablaSwap → executePendulumToAssetHubXCM → pendulumCleanup

## Commands (from `apps/api/`)

```bash
bun test                         # full backend suite
bun test <file>                  # single file, e.g. bun test ramp.service.test.ts
bun test phase-processor.integration.test.ts --timeout X   # integration test

bun migrate                      # run migrations
bun migrate:revert              # revert ALL migrations (destructive — dev only)
bun migrate:revert-last          # revert last migration
bun seed:phase-metadata          # seed phase configuration
```

Lint with the repo Biome config: from repo root `bun lint:fix`, or target a path with
`bunx @biomejs/biome check apps/api/src`. Dev server: `bun dev:backend` from root
(backend at http://localhost:3000).

## Integration test state

Integration tests store state in `lastRampState.json`. For recovery testing, copy a
failed state into `failedRampStateRecovery.json` and run the recovery test.

## Security spec

Changes to auth, admin routes, quote/ramp state, signing, fees, partner pricing,
integrations, or migrations that affect invariants must be cross-checked against
`docs/security-spec/` in the same change. See root `CLAUDE.md` → Security Spec Sync.
