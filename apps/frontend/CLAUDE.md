# apps/frontend — Vortex web app

React 19 + Vite. Root `CLAUDE.md` holds cross-cutting rules; this file holds
frontend-scoped architecture, conventions, and commands. Run commands from
`apps/frontend/` unless noted.

## Architecture

- **State**: Zustand stores (`src/stores/`) + React Context (`src/contexts/`).
- **Forms**: React Hook Form with Zod validation (not Yup).
- **Data fetching**: TanStack Query.
- **Routing**: TanStack Router — route tree auto-generated in `src/routeTree.gen.ts` (do not hand-edit).
- **State machines**: XState machines in `src/machines/` for complex flows (KYC, ramp process).
- **Wallets**: Wagmi/AppKit (EVM) + Talisman (Polkadot).

## Conventions

- Avoid `useState` unless truly needed; prefer derived data and `useRef`.
- Avoid `useEffect` except for external-system synchronization.
- Avoid `setTimeout` (always comment why if used).
- Extract complex conditional rendering into new components.
- Skip useless comments; only comment race conditions, TODOs, or genuinely confusing code.

### XState v5

- Use `setup({ ... }).createMachine(...)` — not `createMachine` directly.
- Get actor refs via `useActor` / `useSelector` from `@xstate/react`.

## Commands (from `apps/frontend/`)

```bash
bun test              # Vitest suite
bun test <pattern>    # single file / pattern
```

Dev server: `bun dev:frontend` from root (http://127.0.0.1:5173). Lint from root with
`bun lint:fix`, or `bunx @biomejs/biome check apps/frontend/src`.

## Error instrumentation

Sentry conventions here are strict (single-source filtering, no capture in components,
no PII). Before adding error handling, API service methods, or machine error states,
follow the **`sentry-vortex`** skill (`.agents/skills/sentry-vortex/SKILL.md`) — it is
the authority for correct instrumentation in this app.

## Token exhaustiveness

`FiatToken` has 6 values (`EURC`, `ARS`, `BRL`, `USD`, `MXN`, `COP`). Any
`Record<FiatToken, X>` must include all six or the build fails. Common spots:
`tokenAvailability`, `mapFiatToDestination`, success-page `ARRIVAL_TEXT_BY_TOKEN`,
sep10 `tokenMapping`.
