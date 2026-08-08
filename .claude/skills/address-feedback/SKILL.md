---
name: address-feedback
description: Fetch a GitHub PR review (Copilot, human, or another agent), verify each finding against the code, fix what is real with regression tests, run the repo gates, and push. Use when the user shares PR review feedback, a pullrequestreview URL, or asks to address review comments.
---

# Address PR review feedback

Turns one review round into one command: fetch → verify → fix → gate → push → report.

## 1. Fetch the feedback

- `.../pull/<n>#pullrequestreview-<id>` URL →
  `gh api repos/{owner}/{repo}/pulls/<n>/reviews/<id>` for the body and
  `gh api repos/{owner}/{repo}/pulls/<n>/comments` filtered by `pull_request_review_id`
  for the inline comments.
- Bare PR number → fetch all reviews and review comments submitted since the last push
  (`gh pr view <n> --json reviews,commits`).
- Pasted findings text → use as-is.
- Make sure the PR branch is checked out and current (`gh pr checkout <n>` — never mix
  with uncommitted local work; stop and say so if the tree is dirty with unrelated
  changes).

## 2. Verify before trusting — triage every finding

Reviews (Copilot especially) contain false positives. For each finding, read the actual
code — whole functions and their callers, not diff hunks — then classify:

- **Agree**: real defect, fix it.
- **Disagree**: false positive or intended behavior. Keep the code evidence; it goes in
  the report verbatim.
- **Business decision**: a behavior/product choice (defaults, risk acceptance, who gets
  notified, what partners may see). Never guess these — collect them and ask the user,
  with a recommendation each (use AskUserQuestion when interactive).

## 3. Fix agreed findings

- Surgical changes only; match surrounding style; no drive-by refactors.
- Per repo rules: every bug that slipped past existing tests gets a regression test that
  fails without the fix, in the same commit.
- If the fix changes behavior documented in `docs/security-spec`, sync the owning spec
  file in the same change (grep `docs/security-spec/README.md` for the owner).

## 4. Gates before pushing

Run what the change touches:

- `bun lint:fix` (Biome — except `packages/sdk`, which uses `bun lint` / ESLint inside
  the package).
- `bun typecheck`.
- Affected package/app test suites (commands in each subdirectory's CLAUDE.md).
- `bun run build:shared` when `packages/shared` changed, then re-run dependent suites.
- `bun run wire-contract:check` when shared endpoint types or the SDK surface changed;
  if the change is intentional, `bun run wire-contract:update` and commit the snapshot
  diff with an explicit note on backward compatibility.

## 5. Push and report

- Commit in logical groups using Conventional Commits (`<type>(<scope>): <summary>`).
- Push to the PR branch; watch CI in a background task and fix failures it surfaces.
- Final message: a disposition table — every finding → **Fixed** (commit), **Disagreed**
  (evidence), or **Needs your decision** (options + recommendation). Nothing silently
  dropped.
- Reply on the PR threads only if the user asks.
