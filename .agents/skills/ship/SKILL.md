---
name: ship
description: End-to-end Vortex feature pipeline — plan with decision gates, implement with tests, self-review until dry, open the PR, and hand off to babysit-pr. Use for "ship this feature", "one-shot this", or when starting substantial feature work from a problem statement or handoff document.
---

# Ship a feature

Pipeline with exactly two human gates: plan approval and merge. Everything in between
runs autonomously.

## Phase 0 — Understand and plan (human gate 1)

- Ingest the problem statement, handoff doc, linked PRs/proposals/ADRs.
- Fan out parallel read-only mapping subagents over the affected subsystems (quote
  pipeline, phases/blocks, providers, dashboard, SDK — whatever the change touches).
- Draft the implementation plan: approach and alternatives considered, files to touch,
  DB/migration impact (including what is already deployed on staging/prod),
  `docs/security-spec` impact, wire-contract impact (is a partner-facing change
  intended?), and the test plan (which suites, which new tests).
- Collect every open product/behavior decision — defaults, who is notified, what
  partners may see, risk acceptances — and ask the user concretely with a
  recommendation per question (AskUserQuestion). Never resolve these silently.
- Present the plan and wait for approval before writing any code.

## Phase 1 — Implement

- Work in a fresh worktree branched off the latest `origin/staging`.
- Implement in logical Conventional Commits; ship tests alongside per the repo rules
  (features get tests; bug fixes get regression tests that fail without the fix).
- Gates before every push: `bun lint:fix` (ESLint inside `packages/sdk`),
  `bun typecheck`, affected test suites, `bun run build:shared` when shared changed,
  `bun run wire-contract:check` (update + compatibility note only when the surface
  change is intentional), security-spec sync when documented behavior changed.

## Phase 2 — Self-review until dry

- Run `/vortex-review` on the branch.
- Fix the confirmed findings here (this session has implementer context), rerun the
  gates, then rerun `/vortex-review`. Repeat until a run reports no new confirmed
  findings.
- Findings deliberately not addressed go into the PR description with the reasoning —
  never silently dropped.

## Phase 3 — PR and handoff (human gate 2)

- Push and open the PR against `staging`: human-friendly sentence-case title, and a
  description covering what/why, the decisions taken in phase 0, test evidence, and the
  wire-contract note when the snapshot changed.
- Request a Copilot review and start `/babysit-pr` for the follow-through.
- Merging is always the user's decision.
