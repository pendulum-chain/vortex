# packages/shared — @vortexfi/shared

Cross-package utilities consumed by every app: token/network configs, contract ABIs &
addresses, decimal/BigNumber helpers, endpoint helpers, logger.

## Rebuild after every change

`@vortexfi/shared` is built to `dist/` (dual node + browser targets). Consumers read the
built output, not `src/`. **After ANY change here, run `bun build:shared` (from root)**
before running or testing frontend/api — otherwise they use stale code.

```bash
bun test              # from packages/shared/
bun build:shared      # from root — rebuild node + browser bundles
```

## Token exhaustiveness

`FiatToken` has 6 values (`EURC`, `ARS`, `BRL`, `USD`, `MXN`, `COP`). Any
`Record<FiatToken, X>` defined here must include all six, or dependents fail to typecheck
when shared is rebuilt.

## Type resolution

If `@pendulum-chain/types` isn't detected properly, ensure all `@polkadot/*` packages
match the versions in the types package. The root `package.json` manages versions via
`catalog:`.
