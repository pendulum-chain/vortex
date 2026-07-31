# apps/dashboard — authenticated customer dashboard

React 19 + Vite account surface for OTP authentication, customer-entity selection,
provider onboarding, recipients, notifications, transaction history, and self-ramp flows.
Read [`docs/product/dashboard.md`](../../docs/product/dashboard.md) before changing product
scope or an acknowledged gap.

## Architecture

- TanStack Router and Query for routing and server state.
- XState v5 for multi-step onboarding and transfer flows.
- `@vortexfi/kyc` for provider KYC/KYB machines; do not fork those machines locally.
- `@vortexfi/shared` for wire contracts, signing helpers, tokens, and networks.
- Zustand for local client state; React Hook Form + Zod for forms.

## Commands (from `apps/dashboard/`)

```bash
bun dev          # Vite on port 5174
bun test         # Bun unit tests under src/
bun test:e2e     # Playwright
bun typecheck
bun run build
```

Lint from the repository root with `bun lint:fix`. After changing
`packages/shared`, run `bun build:shared` before testing the dashboard.

## Documentation

Follow [`docs/README.md`](../../docs/README.md). Update the dashboard product spec instead
of adding plans under this app. Identity architecture belongs in
`docs/architecture/identity-model.md`; tests in `docs/operations/testing.md`; security
behavior in `docs/security-spec/`.
