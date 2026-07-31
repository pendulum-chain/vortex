# packages/kyc — shared provider KYC/KYB machines

Headless XState v5 machines and provider-neutral contracts used by both the widget and
dashboard. App-specific API calls, browser redirects, and UI rendering are injected at the
application boundary.

## Conventions

- Use `setup({ ... }).createMachine(...)`.
- Keep provider workflow state here when both apps need it; keep forms and navigation in
  the consuming app.
- Normalize provider responses at the boundary rather than leaking provider-specific
  status vocabularies into consumers.
- Update both app bindings and tests when a machine contract changes.

## Commands (from `packages/kyc/`)

```bash
bun test
bun typecheck
```

## Documentation

Follow [`docs/README.md`](../../docs/README.md). Current identity architecture belongs in
`docs/architecture-identity-model.md`, product behavior in the relevant product spec, and
provider security requirements in `docs/security-spec/05-integrations/`. Do not create
provider implementation plans or progress files in this package.
