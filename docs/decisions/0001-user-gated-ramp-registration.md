# ADR 0001: User-Gated Ramp Registration

Status: accepted. Last reconciled: 2026-07-31.

## Context

Every active Vortex corridor settles through a regulated fiat provider. Provider-backed
work must be tied to the customer who completed KYC/KYB, but unauthenticated users should
still be able to preview rates before creating an account.

Historically, registration could accept provider identity from request data and could be
authenticated only as a partner. That allowed an integration to attempt work for a
provider customer it did not own.

## Decision

Quoting and ramp registration have different trust boundaries.

1. **Quotes remain anonymous-eligible.** Public rate discovery may create a quote before
   login. Partner and user credentials can still attach ownership or pricing where
   applicable.
2. **Ramp registration requires an effective user.** The API resolves one from a Supabase
   bearer token or the `user_id` bound to a validated secret API key. A partner-only key
   has no authority to select an arbitrary user.
3. **An anonymous quote may be claimed once by an authenticated user.** A quote already
   owned by another user cannot be registered.
4. **Provider identity is derived server-side.** Avenia tax identity, Alfredpay customer,
   and equivalent provider records are resolved from the effective user's customer
   entity. Request values may narrow or confirm the choice but cannot replace the
   ownership check.

The key axes are independent:

| Partner attribution | User binding | Effect |
|---|---|---|
| yes | no | Partner pricing and quoting; no ramp registration |
| yes | yes | Partner pricing and ramps for the linked user |
| no | yes | User-scoped ramps with default pricing |
| no | no | Invalid principal |

## Consequences

- Partner integrations that register ramps need per-user authentication or a key bound
  to exactly one profile.
- Anonymous quote-first funnels continue to work.
- Registration and provider read/write endpoints share the same effective-user ownership
  model.
- New corridors must derive their provider customer from the effective user; adding a
  body field that selects provider identity is not an acceptable shortcut.

## Alternatives rejected

- **Gate only selected corridors.** Every active corridor is provider-backed, and a
  global registration invariant is harder to omit accidentally.
- **Trust a body-supplied provider ID after a partial check.** Server-side derivation has
  a smaller IDOR surface and one ownership model across UI and SDK callers.

## Current references

- [`architecture/identity-model.md`](../architecture/identity-model.md)
- [`security-spec/01-auth/api-keys.md`](../security-spec/01-auth/api-keys.md)
- [`security-spec/03-ramp-engine/quote-lifecycle.md`](../security-spec/03-ramp-engine/quote-lifecycle.md)
- `apps/api/src/api/middlewares/{dualAuth,effectiveUser,ownershipAuth}.ts`
- `apps/api/src/api/services/ramp/ramp.service.ts`
