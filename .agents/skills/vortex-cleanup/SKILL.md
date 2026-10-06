---
name: vortex-cleanup
description: Rules and procedure for over-engineering cleanups in this repository, such as ponytail audits and reviews (/ponytail:ponytail-audit, /ponytail:ponytail-review), dead-code and unused-dependency removal, and simplifying refactors. Use before auditing or applying any cleanup, so the run respects the Compatibility Contract and the scope decisions already made.
---

# Vortex cleanup rules

Cleanup runs here follow the root `CLAUDE.md` **Compatibility Contract** first. The ponytail
plugin decides *what* looks over-engineered; this skill decides what may actually change
and how to prove nothing broke. When the two disagree, the contract wins.

## Scope decisions (do not propose these again without new information)

Excluded from cleanups by Marcel on 2026-10-01:

- Duplicate ABI files (`apps/api/src/contracts`, `apps/frontend/src/contracts`,
  `packages/shared/src/contracts`) and swaps to viem's `erc20Abi`.
- Storybook (`apps/frontend/.storybook`, `*.stories.tsx`), and any component a story
  imports.
- The retired BRL↔AssetHub flows, the phases only they use, and their substrate branches.
- Generic `packages/shared` shrinking: endpoint placeholders, twin helpers, dead DTO types.
- The rebalancer's BlindPay shadow quotes, and gold demo mode.
- Hand-rolled sleeps and IP-range checks (stdlib/`node:net` swaps).

Kept by the Compatibility Contract: mounted endpoints that nothing in this repo calls
(`/v1/siwe`, `/v1/storage`, `GET /v1/prices`), because external partners may call them.

Deferred because the swap changes behaviour; each needs an explicit decision and a
migration plan, not a cleanup commit:

- `body-parser` → `express.json()`: body-parser 2 leaves `req.body` undefined when nothing
  was parsed.
- `joi` → zod: the email validation regexes differ.
- `method-override`: live, it honours `X-HTTP-Method-Override`.
- `dotenv`: the api also loads `../.env`; Bun only auto-loads from the working directory.
- ethers/siwe → viem: signed-transaction parsing and the SIWE nonce format.
- The swc build step: the Render start command depends on it.
- SDK ESLint → Biome: it enforces `.js` import extensions in the published ESM.
- node-forge → `node:crypto` for BRLA signing: node:crypto rejects PEM spellings forge
  accepts, and the production key format is unverified.
- react-toastify → sonner, removing `input-otp`: UX changes.

## Procedure

1. **Base and isolation.** Work from `origin/staging` in a worktree. Re-check every finding
   against the latest `staging` before integrating: staging can start using something you
   deleted as dead.
2. **Audit.** Partition by workspace. Every delegated agent gets the Compatibility Contract
   and this skill's scope table in its prompt: built-in Explore/Plan subagents do not load
   `CLAUDE.md`. Finder-style passes can use the cheap tier (Claude Code: `sonnet`; Codex:
   GPT-5.6-Luna); agents that edit code use the strong tier (Claude Code: session model;
   Codex: GPT-5.6-Sol).
3. **Prove "dead" before deleting.** Zero references across `apps/`, `packages/`,
   `contracts/`, `scripts/`, CI workflows, and package.json scripts. Include barrels,
   string-keyed and dynamic use, lazy imports, TanStack file routes, dynamic i18n keys,
   tsconfig `types`, side-effect imports, and stories. Usage only by tests means the
   test usage goes too, never that the code is live.
4. **Dependencies.** Check imports, config files, CLI use in scripts, and peer requirements.
   The frontend bundles `packages/shared` from source through its browser export, so
   anything shared imports must stay resolvable from the frontend. The `bun.lock` diff may
   only remove packages or move hoisting, never shift a consumer's resolved version.
5. **Refactors.** Characterization tests against the old code come first and stay. Keep
   message strings, state keys, attempt classes, and log semantics that recovery or
   operators rely on. If the result isn't smaller, or equivalence is uncertain, skip it
   and say why. Skipping is fine; a silent behaviour change is not.
6. **Gates.** Before handing off:
   - `bun run typecheck`, `bun run verify`, `bun run wire-contract:check`.
   - The affected test suites. API tests need their own database: create
     `vortex_test_<name>` on `localhost:54329` and run with `TEST_DB_NAME`. The dashboard
     uses `bun run test`, since plain `bun test` picks up its Playwright specs.
   - `bun run build` for every affected app.
   - Any change to the wire-contract snapshot needs a compatibility note in the PR.
7. **Commits and PR.** One conventional commit per concern, with tests in the same
   commit, grouped by workspace. The PR targets `staging` and lists what was kept or
   skipped and why.

## Running parallel workstreams

- Install with Bun's global cache (`bun install --frozen-lockfile`). Per-worktree caches
  from `bun bootstrap:worktree` filled the disk when seven agents ran at once.
- Give each workstream exclusive ownership of the `package.json` files it edits. When
  integrating by cherry-pick, resolve `bun.lock` conflicts by keeping the integration
  side and re-running `bun install`.
