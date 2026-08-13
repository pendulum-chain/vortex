# apps/frontend — Vortex web app

React 19 + Vite. Root `CLAUDE.md` holds cross-cutting rules; this file holds
frontend-scoped architecture, conventions, and commands. Run commands from
`apps/frontend/` unless noted.

## Architecture

- **State**: Zustand stores (`src/stores/`) + React Context (`src/contexts/`).
- **Forms**: React Hook Form with Zod validation (not Yup).
- **Data fetching**: TanStack Query.
- **Routing**: TanStack Router — route tree auto-generated in `src/routeTree.gen.ts` (do not hand-edit).
- **Rendering**: TanStack Start. Marketing routes are prerendered to static HTML at build time
  (`dist/client`); `/widget` sets `ssr: false` and is served from the `_shell.html` SPA shell.
  See [`docs/adr-0004-landing-page-ssr.md`](../../docs/adr-0004-landing-page-ssr.md).
- **State machines**: XState machines in `src/machines/` for complex flows (KYC, ramp process).
- **Wallets**: Wagmi/AppKit (EVM) + Talisman (Polkadot).

## Conventions

- Avoid `useState` unless truly needed; prefer derived data and `useRef`.
- Avoid `useEffect` except for external-system synchronization.
- Avoid `setTimeout` (always comment why if used).
- Extract complex conditional rendering into new components.
- Skip useless comments; only comment race conditions, TODOs, or genuinely confusing code.

### Server-safe code (marketing routes)

Anything rendered by a marketing route is prerendered in a DOM-less environment, so:

- `useSyncExternalStore` must be given a server snapshot (third argument).
- Probe browser globals with `typeof` — `localStorage` is *undeclared* on the server, so
  `!localStorage` and `localStorage?.x` both throw a `ReferenceError`.
- Size from CSS, not from a measured viewport, or the layout shifts on hydration.

`src/tests/ssr-safety.test.tsx` guards these; keep it in the default `node` environment.

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
`tokenAvailability`, `mapFiatToDestination`, success-page `ARRIVAL_TEXT_BY_TOKEN`.

## Documentation

Follow [`docs/README.md`](../../docs/README.md). Product behavior belongs in the existing
product spec, public partner behavior in `docs/api/`, and security-sensitive flow changes
in `docs/security-spec/`. Do not create implementation plans, progress logs, or duplicate
machine walkthroughs; keep the machine and its tests as the local source.
