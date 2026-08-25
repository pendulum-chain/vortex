# packages/sdk — @vortexfi/sdk

The **public** integration SDK shipped to partners. It is consumed outside this repo, so
treat its API surface as a stable contract — breaking changes ripple to integrators.

## SDK-specific gotchas

- **Lint uses ESLint, not Biome**: `bun lint` runs `eslint . --ext .ts`. The repo-wide
  `bun lint:fix` (Biome) does not govern this package's lint.
- **Relative ESM imports in `src` use `.js` extensions**: TypeScript resolves a specifier
  such as `./types.js` to `types.ts` while building, then preserves `.js` in the emitted
  declarations required by NodeNext consumers. The package-local ESLint configuration
  rejects extensionless relative imports and re-exports; do not remove the extensions.
- **`test` also builds and smoke-loads the dist**: `bun test` runs the suite, then
  `bun run build`, checks the declarations from a NodeNext consumer, then imports the ESM
  bundle with Node. A green `bun test` means the published boundary resolves cleanly too.
- **Package architecture**: read `ARCHITECTURE.md` before changing lifecycle, custody, or
  build boundaries.

## Commands (from `packages/sdk/`)

```bash
bun test          # suite + build + dist smoke-load
bun run build     # tsc types + bundle to dist/
bun typecheck     # bun x --bun tsc
bun lint          # eslint
```

## Integration recipes

Partner-facing usage patterns (quotes, on/off-ramp flows, webhooks, auth, error
recovery) are documented in the **`vortex-integration`** skill
(`.agents/skills/vortex-integration/SKILL.md`). Keep that skill in sync when the SDK's
public surface changes.

## Documentation

Follow [`docs/README.md`](../../docs/README.md). Keep public SDK usage in `README.md`,
internal boundaries in `ARCHITECTURE.md`, partner guides in `docs/api/`, and durable
security requirements in `docs/security-spec/`. Do not create build-change journals or
completed implementation guides.
