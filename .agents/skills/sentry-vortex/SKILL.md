---
name: sentry-vortex
description: "Scoped to apps/frontend (the React web app). Audit code against Vortex's Sentry conventions and guide correct error instrumentation. Triggers when working under apps/frontend on: sentry, captureException, error reporting, error monitoring, beforeSend, ignoreErrors, adding an API service method, new error class, new XState machine error handling, ErrorBoundary, \"is this reported to Sentry\"."
user-invocable: true
argument-hint: "[files or 'current changes' — defaults to the working-tree diff]"
---

Audit changed code against Vortex's established Sentry conventions and report violations with concrete fixes; also the authority for how to instrument new code correctly.

## MANDATORY PREPARATION

1. Read the canonical implementation so you check against real code, not memory:
   - `apps/frontend/src/helpers/sentry.ts`
   - `apps/frontend/src/services/api/api-client.ts`
   - `apps/frontend/src/machines/ramp.machine.ts`
2. Determine scope: the argument, or `git diff --name-only HEAD` if blank.

---

## Diagnostic Scan

Check each rule. Report a finding only when violated.

### Configuration (single source of truth)
- All filtering lives in `helpers/sentry.ts`. New ignore/deny/scrub logic edits that file — **NEVER** inline new filter config into `Sentry.init` in `main.tsx`.
- `environment: config.env` (never `config.isProd ? ... : ...`). Sampling stays prod-gated.
- Session Replay keeps `maskAllText: true` + `blockAllMedia: true`.

### Error classes
- A custom `Error` whose failures should be filterable by business area **must** `implements DomainError` and set `domain`. API errors derive it from `getApiDomain()` (the source of truth for domain values); non-API errors set it directly (e.g. `SignRampError` → `wallet`).

### API layer (`services/api/`)
- A new top-level path segment (e.g. `/payouts/...`) **must** be added to `getApiDomain()`.
- `ApiError` messages run through `normalizePath()` — **CRITICAL**: never interpolate raw ids/addresses into an error message or Sentry tag; it fragments grouping and can leak PII.

### Capture points
- Money-flow / machine failures are captured at the machine's terminal error state (`captureActorError` pattern), skipping `SignRampError` `UserRejected`.
- **NEVER** call `Sentry.captureException` inside React components, render paths, or fetch/TanStack-Query interceptors — let errors propagate to the machine error state or the global handler.
- Risky subtrees (widget/KYC/ramp) are wrapped in `Sentry.ErrorBoundary` with a fallback.

### Noise & privacy
- `ignoreErrors` covers wallet user-rejections, `ResizeObserver` loops, extension-context errors, `AbortError`. **IMPORTANT**: keep `TimeoutError` reportable — a timeout can mean a slow backend.
- `beforeSend` drops expected client 4xx (`401/403/404/409/429`); `400/422` and all `5xx` are kept.
- No PII in query params, tags, contexts, or messages — `beforeSend` strips query strings, but new code must not route PII somewhere it can't reach.
- **User context**: `Sentry.setUser` is set/cleared only in `AuthService` (plus a startup seed in `main.tsx`) and carries the **pseudonymous Supabase id only** (`{ id: userId }`) — **NEVER** email, wallet, or IP. New auth code must keep this invariant.

## Generate Report

Group findings by file, `file:line`, each with the violated rule and a concrete fix. End with a one-line compliance verdict.

```
## apps/frontend/src/services/api/payouts.service.ts
payouts.service.ts:14 - new "/payouts" segment not mapped in getApiDomain() → add case "payouts": return "ramp"

## apps/frontend/src/components/Foo.tsx
Foo.tsx:88 - Sentry.captureException in a component → remove; let it propagate to the machine Error state

Verdict: 2 violations — not compliant.
```

**NEVER:**
- Report a violation without the exact fix.
- Flag `Sentry.captureException` at the sanctioned capture point (`captureActorError`) as a violation.
- Recommend blanket-ignoring `Failed to fetch` / `NetworkError` / `Loading chunk failed` — monitor volume first.
- Recommend adding `SENTRY_AUTH_TOKEN` or `VITE_ENVIRONMENT` in code — they are Netlify build env vars; flag as infra TODOs only.

## Verify Audit

- Every changed `services/api/`, error class, and XState machine error path was checked.
- Every finding has a `file:line` and a fix.
- No false positives against the sanctioned patterns in the canonical files.

A trustworthy Sentry is one where every reported issue is real and actionable — audit to keep noise out and signal in.
