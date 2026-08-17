---
name: vortex-review
description: Deep multi-lens review of a Vortex PR or branch. Runs parallel Vortex-specific finder lenses, loops until no new findings, adversarially verifies every finding, and reports severity-ranked results. Use when asked for an in-depth code review, a pre-merge confidence check, or to review a PR/branch/diff.
---

# Vortex deep review

Review-only skill: it produces a findings report and NEVER modifies code. Fixes happen in
the implementing session or via `/address-feedback`.

## 1. Resolve scope

- Argument is a PR number/URL → `gh pr view` for title/description/discussion, `gh pr diff`
  for the diff. If the branch isn't checked out locally, check it out in a worktree.
- No argument → diff the current branch against `$(git merge-base HEAD origin/staging)`.
- Build a change inventory: files by workspace, plus flags that route lens emphasis:
  migrations touched, `packages/shared` touched, SDK public surface touched,
  `docs/security-spec` relevant paths touched, frontend machines/widget touched.
- Trust guard: before running ANY branch-local command (installs, builds, tests,
  `wire-contract:check`), confirm the PR head lives in `pendulum-chain/vortex` itself
  and the author is a known collaborator or team agent. For fork or external-author
  PRs, review by inspection only — read the diff and files, execute nothing from the
  branch — and say so in the report.
- Run `bun run wire-contract:check` (after `bun run build:shared` if shared changed).
  A stale snapshot on the branch = automatic P1 finding.
- Read the PR description and any linked proposal/ADR: findings include "the change
  doesn't achieve its stated intent", not just "the code is wrong".

## 2. Round 1 — finder fleet

Spawn parallel read-only subagents, one per lens (use the Workflow tool if available,
otherwise parallel Agent tasks). Every finder gets: the diff, the change inventory, its
lens brief below, and these standing rules:

- Verify every claim against the actual code — read whole functions/files, never judge
  from diff hunks alone. Check whether a suspected issue is already guarded elsewhere.
- Report findings as: severity (P0 blocker / P1 must-fix / P2 should-fix / P3 nit),
  `file:line`, one-sentence claim, concrete failure scenario (inputs/state → wrong
  outcome), suggested fix, suggested regression test.
- Also report what you checked and found clean.

Lens briefs (these encode the classes that historically slipped through review):

| Lens | Hunt for |
|---|---|
| correctness | Logic errors, wrong conditionals, off-by-one, unhandled branches, race conditions, dead code introduced by the change |
| financial-integrity | Fee math and rounding (Big.js modes), raw (18-dp) vs decimal confusion, subsidy caps, net-rate promise, the same amount derived differently at quote vs settlement vs distribution time |
| phase-recovery | Phase handlers/blocks: idempotency under retry and crash-between-steps; preconditions that can never pass after partial success (e.g. balance checks for funds that already moved); presigned-tx identity must include nonce (phase+network+signer alone collides); retries vs lock expiry; `unknown`-status operations conflated with "not started" |
| silent-failures | Swallowed errors, catch-and-continue, fallbacks that mask wrong data, logs asserting success on unverified paths, error branches that can never fire |
| partner-surface | Anything a live integrator depends on: shared endpoint types, SDK public API and `parseAPIError` message matching vs actual backend error strings, webhook payloads/signing, auth semantics, `docs/api/openapi/vortex.openapi.json` sync, wire-contract snapshot diff review |
| db-migrations | Migrations vs the already-deployed staging/prod schema (edits to already-run migrations never re-run; backfills must handle existing rows); irreversible steps without a runbook; enum exhaustiveness (`FiatToken` has 6 values: EURC, ARS, BRL, USD, MXN, COP — check every `Record<FiatToken, X>`; `SubsidyToken`); Sequelize model ↔ schema drift |
| consistency | Corridor/capability matrix agreement across widget (frontend), API, dashboard, SDK (`tokenAvailability`, `mapFiatToDestination`, `ARRIVAL_TEXT_BY_TOKEN`); i18n in both en and pt-BR; `docs/security-spec` staleness per the CLAUDE.md sync rule |
| test-adequacy | Would the new tests fail without the fix; edge cases vs happy path only; `mock.module` leak rules (snapshot values before mocking, restore in `afterAll`); no production data/PII in fixtures; coverage gates still passing |

For small diffs (< ~150 changed lines) merge to 4 finders: correctness+silent-failures,
financial+phase-recovery, partner-surface+db-migrations, consistency+test-adequacy.

## 3. Loop until dry

- Deduplicate new candidates against everything already seen (file + line + claim), not
  only against confirmed findings — otherwise refuted findings resurface forever.
- After any round that produces new candidates, run another fleet round where finders get
  the list of everything found so far and the brief "hunt for what these reviewers
  missed — different files, different failure classes".
- Stop after two consecutive rounds with zero new candidates (typically 2–3 rounds).

## 4. Adversarial verification

Every candidate goes to a verifier subagent prompted to REFUTE it with code evidence: is
the path reachable, is the behavior actually wrong, is it guarded elsewhere, does the
failure scenario hold? P0/P1 candidates get two independent verifiers; the finding
survives only if the refutation fails. Refuted candidates go to a one-line appendix so
the same false positive isn't re-litigated next run.

## 5. Report

Deliver in the final message (and post via `gh pr review --comment` only if asked):

1. One-paragraph verdict: mergeable or not, and the dominant risk.
2. Findings ranked by severity: `file:line`, claim, failure scenario, fix, regression
   test to add.
3. "Verified clean" — per lens, what was checked and held up. Absence of findings must
   be evidence of checking, not of not looking.
4. Appendix: refuted candidates (one line each).
