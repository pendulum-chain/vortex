# apps/rebalancer — liquidity rebalancing service

Standalone service that rebalances liquidity across chains. Root `CLAUDE.md` holds
cross-cutting rules. Run commands from `apps/rebalancer/`.

## Commands

```bash
bun run src/index.ts   # run the service (also: bun dev:rebalancer from root)
bun test               # test suite
```

Lint from root with `bun lint:fix`, or `bunx @biomejs/biome check apps/rebalancer/src`.

Depends on `@vortexfi/shared` — after changing `packages/shared`, run `bun build:shared`
(from root) before running this service.

## Documentation

Follow [`docs/README.md`](../../docs/README.md). Keep setup that operators need in the
local README and maintain security/behavioral requirements in
`docs/security-spec/07-operations/rebalancer.md`. Do not add session plans or progress logs.
