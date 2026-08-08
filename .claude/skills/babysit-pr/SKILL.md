---
name: babysit-pr
description: Watch an open PR and keep it moving without manual ferrying — react to new reviews (Copilot, human, agent) and CI failures, push mechanical fixes, and surface business decisions. Use after opening a PR, e.g. "babysit PR 1234" or "watch this PR until it's mergeable".
---

# Babysit a PR

Long-running watch loop for one PR. Autonomous for mechanical work; it never merges the
PR and never resolves business decisions on its own.

## Setup

- Resolve the PR: argument, or the current branch's PR via `gh pr view`.
- Make sure the PR branch is checked out and the tree is clean; stop and report if there
  is unrelated uncommitted work.
- Record a baseline to diff against on every wake-up (persist it in a scratch state
  file): head SHA, review ids, review-comment ids, issue-comment ids, CI runs —
  `gh pr view <n> --json headRefOid,reviews,comments,statusCheckRollup`.
- If no Copilot review exists yet, request one:
  `gh api repos/{owner}/{repo}/pulls/<n>/requested_reviewers -f "reviewers[]=copilot-pull-request-reviewer[bot]"`.
  If the API rejects the bot reviewer, note it in the report and continue — the user can
  request it in the GitHub UI.

## Each iteration

1. Fetch current PR state and diff against the baseline.
2. New CI failure on the current head → read the failing logs
   (`gh run view <run-id> --log-failed`), fix, run the repo gates, push.
3. New review or new inline review comments → run the `/address-feedback` flow on them:
   verify each finding against the code, fix agreed items with regression tests, run
   gates, push. Keep the disagree evidence and any business decisions for the report.
4. New human questions or discussion → draft replies but do not post them unless the
   user explicitly enabled posting; include the drafts in the report instead.
5. After pushing fixes prompted by a Copilot review, re-request the Copilot review so
   the next round starts without the user ferrying anything.
6. Update the state file.

## Pacing, notifying, stopping

- Pace with the harness loop mechanism (dynamic `/loop` / scheduled wake-ups): check
  every 5–15 minutes; after pushing, watch CI to completion in a background task and act
  on the result instead of waiting for the next tick.
- Actively notify the user (not just a log line) when: a business decision is pending, a
  reviewer pushes back on a disagree disposition, or all feedback is addressed and CI is
  green (mergeable — the user's call).
- Stop when the PR is merged or closed, or when the user says stop. Never merge.
