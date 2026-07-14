# packages/sdk — @vortexfi/sdk

The **public** integration SDK shipped to partners. It is consumed outside this repo, so
treat its API surface as a stable contract — breaking changes ripple to integrators.

## SDK-specific gotchas

- **Lint uses ESLint, not Biome**: `bun lint` runs `eslint . --ext .ts`. The repo-wide
  `bun lint:fix` (Biome) does not govern this package's lint.
- **`test` also builds and smoke-loads the dist**: `bun test` runs the suite, then
  `bun run build`, then `node -e "require('./dist/index.js')"`. A green `bun test` means
  the built bundle imports cleanly too.
- **Dual build**: see `ARCHITECTURE.md`, `DUAL_BUILD_GUIDE.md`, and
  `CHANGELOG_DUAL_BUILD.md` before touching the build config.

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
