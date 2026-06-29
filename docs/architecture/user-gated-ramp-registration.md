# ADR: User-Gated Ramp Registration (Anonymous Quotes, Authenticated Ramps)

Last updated: 2026-06-29

Status: Accepted

Related: [`api-key-authentication-complete.md`](./api-key-authentication-complete.md),
[`supabase-auth.md`](./supabase-auth.md),
security spec [`01-auth/api-keys.md`](../security-spec/01-auth/api-keys.md),
[`03-ramp-engine/quote-lifecycle.md`](../security-spec/03-ramp-engine/quote-lifecycle.md)

## Context

Every Vortex corridor settles through a regulated fiat provider — Avenia/BRLA (BRL),
Mykobo (EUR), or Alfredpay (USD/MXN/COP/ARS). Each provider requires a real, KYC-completed
customer to mint or pay out. Historically the API accepted provider identity (e.g.
`additionalData.taxId`, or `customerId: req.userId || "unknown"`) directly from the request
body and allowed ramp registration with only a partner API key. That let a caller:

- Register a ramp on top of an arbitrary `taxId` / customer they did not own.
- Create upstream provider resources with a placeholder (`"unknown"`) customer identity.
- Drive provider-backed flows with no link to a verified profile.

At the same time, we want unauthenticated clients to be able to fetch a **quote** so they
can preview rates before signing up with Vortex.

## Decision

Split the trust boundary between quoting and ramping:

1. **Quotes stay anonymous-eligible.** `POST /v1/quotes` and `/quotes/best` accept anonymous
   callers (and partner keys with or without a user binding) for corridors that support public
   estimates (e.g. BRL/Avenia). Alfredpay quote creation is the exception: it is user-gated in
   the quote engine because the upstream provider call requires a real customer context — no
   `customerId: "unknown"` call is ever made.

2. **Ramp registration requires an effective user, for every corridor.** `RampService.registerRamp`
   derives an **effective user** (`req.userId` from Supabase, else `api_keys.user_id` from a linked
   secret key) and rejects when none is present:
   - `400 Invalid quote` when no effective user can be resolved.
   - `403` when an authenticated caller tries to claim an anonymous quote (`quote.userId == null && request.userId != null`).
   - `403` when a linked user tries to register a quote owned by a different user.

3. **Provider identity is derived server-side, never trusted from the body.** The sender `taxId`
   (Avenia) and `alfredPayId` (Alfredpay) are resolved from the effective user's KYC records
   (`resolveAveniaAccountForUser`, `resolveAlfredpayCustomerId`). A client-supplied `taxId` is
   accepted only when it matches the derived value; mismatches return `400`. (The PIX
   `receiverTaxId`, which may legitimately differ from the sender, stays client-supplied and is
   validated downstream against the PIX key owner.)

## Identity model

A secret API key now has two independent, nullable axes:

| `partner_name` | `user_id` | Meaning |
|---|---|---|
| set | null | Partner key, no bound user. **Can quote, cannot register** (no effective user). |
| set | set | Partner key bound to one profile. Quotes with partner pricing; registers ramps for that one user. |
| null | set | User-scoped key (self-serve `/v1/api-keys`). Registers ramps for that user; **no** partner pricing (defaults to the `vortex` fee rows). |
| null | null | Unusable; rejected as invalid. |

A single key binds to **at most one** profile. A partner serving many end users therefore either
(a) has each end user authenticate via Supabase, (b) has each end user mint their own user-scoped
key via the self-serve endpoint, or (c) provisions one partner-bound key per user through the admin
endpoint. There is intentionally no "one partner key acts for any user" path.

## Consequences

- **Breaking change for unlinked partner-key integrations.** A partner key with `user_id = NULL`
  can no longer register ramps. Existing production keys must be bound to a profile (admin
  `POST /v1/admin/partners/:partnerName/api-keys` accepts an optional `userId`) or callers must
  switch to per-user authentication. This requires partner communication ahead of deploy.
- **Anonymous rate discovery is preserved**, which keeps the pre-signup funnel working.
- **Provider fraud surface shrinks**: no arbitrary `taxId`, no `"unknown"` customer, no claiming
  another user's quote/subaccount.
- `ON DELETE SET NULL` on `api_keys.user_id` is deliberate: deleting a profile must not silently
  revoke a partner's operational keys; the binding is soft state.

## Alternatives considered

- **Per-corridor gating** (only provider-backed corridors require a user). Rejected: every active
  corridor is provider-backed, so a global check in `registerRamp` is simpler and removes the risk
  of a future corridor forgetting the guard. If a non-provider corridor is ever added, revisit.
- **Trusting body-supplied provider identity with an ownership check.** Rejected: deriving from the
  authenticated profile is strictly safer and removes an entire class of IDOR.
