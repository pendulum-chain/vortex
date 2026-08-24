# apps/demo - Browser SDK example

Minimal React 19 + Vite example of a backend-free BRL/PIX to BSC USDC onramp. It is an
integration reference, not a second production frontend.

- Keep the corridor and UI intentionally fixed and small.
- Use `@vortexfi/sdk` for quote, registration, signing, update, start, and status calls.
- Browser sessions, ramp snapshots, and SDK ephemeral backups are stored in localStorage
  for this prototype.
- Use Wagmi/Reown AppKit for the BSC destination wallet.

Run `bun dev:demo`, `bun test:demo`, `bun typecheck`, or `bun build:demo` from the repository root. The SDK must be built before demo-local typechecking or bundling; `bun bootstrap:worktree` handles this in fresh worktrees.
