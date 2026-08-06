---
applyTo: "apps/frontend/**/*.ts,apps/frontend/**/*.tsx,apps/dashboard/**/*.ts,apps/dashboard/**/*.tsx"
---

# React application review instructions

- Preserve monetary values at their configured token precision in form state, query parameters, and API payloads. Apply display precision only while rendering; formatting must never truncate or mutate the value submitted or quoted.
- Treat authentication refresh, sign-out, OTP completion, navigation, and query completion as race-prone. A stale promise or response must not overwrite a newer session, clear replacement credentials, or update an unmounted/superseded flow.
- Use `useEffect` only to synchronize with an external system. Flag effects that merely derive state, mirror props/query data, orchestrate an event that belongs in its handler, or omit cleanup for subscriptions and async work.
- Keep server state in TanStack Query, local UI state close to the component, shared client state in the established Zustand/context boundary, and multi-step workflows in XState. Flag duplicate sources of truth and manual synchronization between them.
- For XState changes, use XState v5 `setup(...).createMachine(...)` and verify every event, guard, actor result, error, cancellation, retry, and persisted/resumed state affected by the change. Shared KYC/KYB workflow belongs in `packages/kyc`, not a fork in an app.
- Validate API and browser-storage data at the boundary. Loading/error/empty states must not expose stale data from a previous user, entity, route, or query key.
- Check TanStack Query keys, invalidation, optimistic updates, cancellation, and rollback together; a mutation must not refresh or corrupt the cache for another profile, entity, corridor, or filter.
- Require tests for the meaningful interaction and failure modes introduced by the change, including async races where relevant. Assertions should verify submitted wire values and resulting state, not only formatted text or the happy-path screen.
