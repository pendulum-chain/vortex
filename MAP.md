# Repository Map

Wayfinding for the Vortex monorepo: what kind of code lives where. Each app/package
has its own `CLAUDE.md` with scoped commands and conventions — `cd` into the relevant
one before working there.

## Apps

| Path | What lives here |
|------|-----------------|
| `apps/frontend` | React 19 + Vite web app — the user-facing ramp UI. Zustand, TanStack Query/Router, XState, Wagmi/Talisman wallets. → [`CLAUDE.md`](apps/frontend/CLAUDE.md) |
| `apps/api` | Express backend (PostgreSQL + Sequelize). Ramp state machine, quotes, partners, webhooks, XCM/Nabla/Stellar/BRLA integrations. → [`CLAUDE.md`](apps/api/CLAUDE.md) |
| `apps/rebalancer` | Standalone liquidity rebalancing service. → [`CLAUDE.md`](apps/rebalancer/CLAUDE.md) |

## Packages

| Path | What lives here |
|------|-----------------|
| `packages/shared` | `@vortexfi/shared` — token/network configs, contract ABIs & addresses, decimal/BigNumber helpers, endpoint helpers, logger. Consumed by every app. → [`CLAUDE.md`](packages/shared/CLAUDE.md) |
| `packages/sdk` | `@vortexfi/sdk` — the public integration SDK shipped to partners. → [`CLAUDE.md`](packages/sdk/CLAUDE.md) |

## Contracts

| Path | What lives here |
|------|-----------------|
| `contracts` | Solidity contracts: `cctp-settlement` and `relayer`. |
| `relayer-contract` | Relayer contract security-audit material. |

## Docs & specs

| Path | What lives here |
|------|-----------------|
| `docs/security-spec` | Audit-facing source of truth for security-sensitive behavior. Keep in sync with code changes (see root `CLAUDE.md` → Security Spec Sync). |
| `docs/api` | Public API docs — OpenAPI spec (`openapi/`) and prose pages (`pages/`). Whitelabeled. |
| `docs/architecture`, `docs/features`, `docs/qa`, `docs/refactoring` | Architecture notes, feature write-ups, QA and refactoring records. |
| `docs/testing-strategy.md`, `docs/test-audit-findings.md` | Testing approach and audit findings. |
| `memory-bank` | Long-form project context: product/tech context, decision log, phases, progress. |

## Tooling & config

| Path | What lives here |
|------|-----------------|
| `scripts` | Repo tooling — `check-coverage.ts`, `coverage-report.ts` (LCOV-based coverage gate). |
| `supabase` | Supabase config, DB migrations, snippets, email templates. |
| `.agents/skills` | Repo-scoped agent skills: `vortex-integration` (partner integration recipes), `sentry-vortex` (frontend error-instrumentation audit). |
| `.clinerules` | Cline coding rules (general, useful prompts, frontend). |
| `.claude` | Claude Code config — shared `settings.json` (deny rules), personal `settings.local.json` (ignored), worktrees. |
