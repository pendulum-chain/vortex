# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository. This root file
holds **cross-cutting** context only. Each app/package has its own `CLAUDE.md` with
scoped architecture and commands — `cd` into the relevant one before working there, and
read it first.

## Project Overview

Vortex is a cross-border payments gateway built on the Pendulum blockchain. It enables
on-ramping and off-ramping of fiat currencies through stablecoins using cross-chain swaps
via XCM (Cross-Consensus Messaging).

## Repository Map

Full wayfinding is in [`MAP.md`](MAP.md). This is a **Bun monorepo** using workspaces:

- **apps/frontend** — React 19 + Vite web app → [`apps/frontend/CLAUDE.md`](apps/frontend/CLAUDE.md)
- **apps/api** — Express backend (PostgreSQL + Sequelize) → [`apps/api/CLAUDE.md`](apps/api/CLAUDE.md)
- **apps/rebalancer** — liquidity rebalancing service → [`apps/rebalancer/CLAUDE.md`](apps/rebalancer/CLAUDE.md)
- **packages/shared** — `@vortexfi/shared` utilities/configs → [`packages/shared/CLAUDE.md`](packages/shared/CLAUDE.md)
- **packages/sdk** — `@vortexfi/sdk` public SDK → [`packages/sdk/CLAUDE.md`](packages/sdk/CLAUDE.md)

## Monorepo Commands

> Always use `bun` — never `npm`, `yarn`, or `pnpm`. Run `bun lint:fix` after any code
> change — **except in `packages/sdk`, which is linted by ESLint** (`bun lint` inside that
> package); Biome does not govern it. Per-app test/dev/migrate commands live in each
> subdirectory's `CLAUDE.md`.

```bash
bun install          # install all dependencies
bun dev              # frontend + backend + shared concurrently
bun dev:frontend     # http://127.0.0.1:5173
bun dev:backend      # http://localhost:3000
bun dev:rebalancer

bun build            # build all (shared -> sdk -> frontend -> backend)
bun build:shared     # rebuild shared (see below)

bun lint             # Biome lint          bun lint:fix   # auto-fix
bun format           # format all           bun verify     # check without fixing
bun typecheck        # type check
```

### Always rebuild shared after changing it

`packages/shared` is consumed as built output. **After ANY change to `packages/shared`,
run `bun build:shared` before running frontend/api** — otherwise they use stale code.

## Token Exhaustiveness

`FiatToken` currently has 6 values: `EURC`, `ARS`, `BRL`, `USD`, `MXN`, `COP`.

Any `Record<FiatToken, X>` must include ALL six. Missing entries cause TypeScript errors
when shared is rebuilt. Check: `tokenAvailability`, `mapFiatToDestination`, success page
`ARRIVAL_TEXT_BY_TOKEN`, sep10 `tokenMapping`.

## Code Style

Biome config: line width 128, 2-space indent, semicolons always, no trailing commas,
double quotes, sorted Tailwind classes (`useSortedClasses`). General: prefer composition
over inheritance; create ADRs in `/docs/adr` for major architectural changes.
Frontend-specific and XState conventions live in
[`apps/frontend/CLAUDE.md`](apps/frontend/CLAUDE.md).

## Commit Messages & PR Titles

Every commit message and PR title follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>
```

- **type** — `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `style`, `chore`, `ci`, or
  `revert`.
- **scope** — the workspace touched: `api`, `frontend`, `dashboard`, `rebalancer`,
  `shared`, or `sdk`. Use `repo` for cross-cutting changes (root config, CI, monorepo
  tooling). One workspace dominates a mixed change? Use that. Truly global? `repo`.
- **summary** — imperative mood ("add", not "added"/"adds"), lowercase after the colon,
  no trailing period, ≤ 72 characters.
- Append `!` after the scope for breaking changes (e.g. `feat(sdk)!: …`).
- Body is optional; when present, explain **why**, not what — the diff shows what.
- PR titles use the same format as commit subjects. PRs are merged with merge commits,
  so individual commits land in history — format each one, not just the PR title.

Examples from history: `fix(api): keep active phase retries below lock expiry`,
`feat(dashboard): add searchable token selection`, `docs(dashboard): sync implemented
feature specs`.

## No Over-Engineering

- Don't add features, refactors, or "improvements" beyond what was asked.
- Don't add docstrings/comments to code you didn't touch.
- Don't create helpers/utilities for one-time operations.
- Don't validate inputs that can't be invalid (internal calls, typed params).
- Three similar lines is better than a premature abstraction.

## Testing

These apply to every agent working in this repo:

- **Bug fixes and regressions**: if a bug slipped past existing tests, add a test that
  reproduces it (and fails without the fix) before/with the fix, so it can't silently
  come back. Write it at the level that covers the gap (unit or integration). Only skip
  when a test genuinely can't capture it (purely cosmetic, environment/config, or
  third-party behavior) — and say why you skipped.
- **New features**: always ship the appropriate tests alongside the feature. Cover the
  core behavior and the edge cases that matter, not just the happy path.

Per-app test commands and integration-test state handling live in each subdirectory's
`CLAUDE.md`.

## Security Spec Sync

`docs/security-spec/` is the audit-facing source of truth for security-sensitive
behavior, and it must not go stale. Any change to an API feature or its business logic —
auth, admin routes, quote/ramp state, signing, fees, partner pricing, integrations,
migrations/schema that affect invariants, or cross-chain fund flow — must be cross-checked
against the matching spec file and updated in the same change whenever the behavior it
documents changed. This applies to every agent working in this repo.

Keep this lightweight: grep/read only the relevant spec path from
`docs/security-spec/README.md`; skip it for cosmetic refactors, test-only changes, or
implementation changes that do not alter security-relevant behavior. If a change alters
documented behavior but you are unsure which spec file owns it, say so rather than leaving
the spec silently stale.

## Type Issues

If the IDE doesn't detect `@pendulum-chain/types` properly, ensure all `@polkadot/*`
packages match versions in the types package. The root `package.json` uses `catalog:` for
version management.

---

# AI AGENT RULES

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work")
require constant clarification.
