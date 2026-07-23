# Recipient Transfers

## What This Does

The dashboard's recipient product: a sender invites a recipient via a shareable link, the recipient
onboards (KYC/KYB via the widget) under their **own** profile, and the sender may then create
transfers (offramps) that pay out to that recipient. Backed by the migration-`042` tables
(`recipient_invitations`, `sender_recipients`, `recipient_payout_references`), all anchored to
`customer_entities`; migration-`050` added the sender-local `alias`, the retained raw `token`,
and `archived_at` to `recipient_invitations` (dropping the unused `amount`). Routes live under `/v1/recipients` (`recipients.controller.ts`), all behind
`requireAuth` (Supabase bearer token):

| Endpoint | Purpose |
| :-- | :-- |
| `POST /v1/recipients/invite` | Sender creates an invite (with a sender-local `alias`); response returns the raw link token |
| `POST /v1/recipients/invite/:token/accept` | Authenticated recipient redeems the token |
| `GET /v1/recipients` | Sender lists relationships + pending invitations; pending items include the raw token for re-copy |
| `PATCH /v1/recipients/:id` | Sender sets nickname / `active` / `blocked` / `archived` (archived rows are excluded from the list) |
| `PATCH /v1/recipients/invitations/:id` | Sender archives/unarchives a pending invitation — a cosmetic list hide; the token stays redeemable (this is **not** revocation) |
| `GET /v1/recipients/:id/eligibility` | Transfer gate: `{ canCreateTransfer, blockingReasonCode? }` |

This matters because the sender↔recipient link is an authorization edge over money movement: a
broken invite or scoping check lets an attacker attach themselves as someone's recipient, or pay
out against another tenant's relationship.

## Security Invariants

1. **Raw invite tokens are stored only while redeemable-by-design, and exposed only to their
   sender.** Tokens are 24 random bytes (base64url, `crypto.randomBytes`). Redemption still looks
   up exclusively by the sha256 hex hash in `recipient_invitations.token_hash` (UNIQUE) — the raw
   `token` column is never a lookup key. The raw token is retained on the row **while the invite
   is pending** (accepted product decision, superseding the earlier never-stored rule) so the
   sender can re-copy the link from the list; it is exposed only in the `POST /invite` response
   and in the sender-entity-scoped `GET /v1/recipients` pending list. Acceptance and expiry checks
   set it to `NULL` (acceptance re-checks `expired` under the row lock, so the sweep below cannot
   race an accept into overwriting an already-expired invite); sender listing also expires and
   clears pending rows past their TTL — expired rows stay visible to the sender (token `NULL`,
   no re-copy) until archived — so accepted/expired invites hold no live secret at rest
   (`recipient-invite.service.ts`, `recipients.controller.ts`).
2. **Redemption is token-bound (plan D1).** Possession of the token is the redemption key. If
   `invitee_email` was recorded, the redeemer's authenticated email must additionally match its
   canonical (trimmed, lowercased) form, else `403 INVITE_EMAIL_MISMATCH`.
3. **Invites bind to one recipient, and expire.** A `pending` invite is redeemable by anyone
   holding the token (subject to 2). Once accepted it binds to `accepted_by_profile_id`: any
   *other* profile presenting the token gets `409 INVITE_ALREADY_ACCEPTED`. Revoked/expired →
   `410`. Expiry is 14 days (`INVITE_TTL_MS`); redemption of a *pending* invite past `expires_at`
   transitions the row to `expired`; sender listing performs the same transition and excludes
   expired rows. This holds under concurrency: the acceptance transaction
   re-reads the invitation `FOR UPDATE` and re-checks acceptance/revocation under the lock, so
   two profiles redeeming the same token simultaneously produce exactly one relationship
   (integration-tested with parallel accepts).
3a. **Re-entry.** The accepting recipient may re-present the token to resume onboarding: the accept
   endpoint is idempotent for that profile, returning `200` with the existing relationship instead
   of `201`. Re-entry does not re-notify the sender, does not move `accepted_at`, and does not
   revive an `archived` relationship. It survives `expires_at` passing — the relationship already
   exists, and KYC can outlast the invite's TTL. It does **not** survive a `blocked` relationship
   (`409 RELATIONSHIP_BLOCKED`) or sender revocation (`410 INVITE_REVOKED`) — but revocation is
   currently enforced on redemption only: **no endpoint, service, or dashboard action writes
   `status = 'revoked'` yet** (TODO — see Next Steps). Until a revoke path ships, the operable
   mitigations for a leaked pending invite are the 14-day TTL, first-redeemer binding, and
   blocking the resulting relationship.
4. **Redemption requires authentication and cannot be self-directed.** The redeemer must hold a
   valid session; a redeemer whose profile owns the sender entity gets
   `409 CANNOT_ACCEPT_OWN_INVITE`. The widget retains the `invite` query parameter through email
   OTP authentication and calls `POST /recipients/invite/:token/accept` before onboarding. The
   accepted invitation response, not the editable URL, selects the locked corridor and recipient
   type. Provider records are attached to the corresponding individual or business entity.
5. **A `blocked` relationship is never resurrected by a new invite.** Acceptance against a
   blocked pair returns `409 RELATIONSHIP_BLOCKED` and leaves the invite `pending`; only
   `archived` reactivates. Acceptance (entity resolve + relationship upsert + invite state) runs
   in one transaction.
6. **All sender-side routes are entity-scoped.** List/PATCH (relationship and invitation
   archive)/eligibility resolve the caller's `customer_entity` from `req.userId` and filter on
   `sender_customer_entity_id`; foreign ids
   return a uniform `404`. Entity resolution is deterministic: a partial unique index on
   `customer_entities (profile_id, type)` (migration 049) makes the acceptance-path
   `findOrCreate` race-safe, and `getOrCreateCustomerEntityForProfile` resolves type-less
   lookups to the profile's oldest entity rather than arbitrary row order.
7. **No recipient payout PII is stored locally (plan D3).** `recipient_payout_references` holds a
   provider instrument id + masked label + status only; senders only ever see the mask.
8. **Transfer eligibility requires the full gate** (`transfer-eligibility.service.ts`): invite
   accepted ∧ relationship `active` ∧ recipient approved with the corridor's provider (rail →
   provider: `eur`→monerium, `brl`→avenia, else alfredpay; the provider-record lookup is
   country-scoped for alfredpay and always scoped to the invite's `invitee_type`
   (`customer_type`), so a business invite is never satisfied by an individual approval;
   canonical status must be `approved`, while `rejected` is provider-restricted) ∧ a `verified`
   payout reference for the relationship + rail.
   First failing check returns its `blockingReasonCode`. The `GET /v1/recipients` onboarding
   summary applies the same provider/type/country scoping, so the status a sender sees in the
   list agrees with the eligibility gate.
9. **Invite creation is server-validated, not dashboard-trusted.** `POST /v1/recipients/invite`
   rejects unknown corridors and rail mismatches (`400 INVALID_INVITE_CORRIDOR` against
   `CORRIDOR_CAPABILITIES` in `@vortexfi/shared`), corridor × invitee-type combinations the
   provider cannot onboard (`400 UNSUPPORTED_INVITEE_TYPE`, e.g. AR business — Alfredpay has no
   AR company KYB), and senders with no approved onboarding anywhere
   (`403 NO_APPROVED_CORRIDOR`; approvals are read from `provider_customers.status`, which every
   provider persists). The dashboard's corridor filter is a UX mirror of these rules, not the
   enforcement point.
10. **Sender self accounts are not recipient payout references.** For Alfredpay self offramps, the
    dashboard lists and creates provider-side fiat accounts owned by the authenticated sender and
    registration carries their `fiatAccountId` in `additionalData`. This does not create a
    `recipient_payout_references` row and does not satisfy an invited recipient's payout gate;
    recipient payout capture remains in the recipient's widget onboarding session.
11. **Invite discounts are role-gated at creation and materialized only once, at first
    acceptance.** `POST /v1/recipients/invite` accepts an optional `discounts` body
    (`buyBps`/`sellBps`, integers `0..300` — bounded so the advertised discount always fits
    under the runtime EVM discount-subsidy cap with execution headroom; `0` means none)
    only from profiles holding the `discount_manager` role in `profile_roles`
    (`403 DISCOUNT_ROLE_REQUIRED` otherwise — the role check is server-side, the dashboard's
    field visibility is UX only). Validated seeds are stored on
    `recipient_invitations.seeded_discounts` as `{ rampType, fiatCurrency, bps }[]`, with
    `fiatCurrency` derived server-side from the invite's corridor (never client-supplied).
    Inside the first-acceptance transaction (never on re-entry), `materializeSeededDiscounts`
    creates a dedicated partner row named by the accepting profile's email (reused — with its
    seeded configs replaced wholesale — when a later discount invite re-seeds the same
    profile after its previous assignment ended; an unrelated partner that merely carries
    that name is never repurposed, guarded by requiring a prior assignment linking it to the
    profile), one corridor-scoped pricing config per seed (`targetDiscount = bps/10000`, `maxSubsidy` mirroring the runtime
    EVM discount-subsidy cap fraction so a quote-time subsidy can never exceed what
    subsidize-post-swap will execute, partner markup `none`, and the default vortex platform
    fee copied into the config's vortex-fee fields so seeded profiles do not ramp
    platform-fee-free — if the vortex pricing row for a seeded direction/corridor is missing,
    seeding is skipped entirely and logged rather than materializing a fee-free config), and
    an active `profile_partner_assignments` row for the accepting profile. Seeding locks the
    profile row first (the same serialization point as admin assignment replacement) so it
    cannot race a concurrent admin assignment. A profile that already holds an active,
    unexpired assignment keeps it — the seed is discarded and the invite only connects the
    recipient. Roles are admin-managed via `POST/DELETE /v1/admin/profile-roles` behind
    `adminAuth` and surfaced to the dashboard as `roles` on `GET /v1/onboarding/status`.
    Discount-carrying invites deep-link to the **dashboard** (`/invite/<token>`, rebuilt for
    re-copy from `seededDiscounts` on the pending-invitations listing) instead of the widget.
    The invitee signs in (email OTP) on the invite page, then must **explicitly confirm with
    the active account shown** before anything is redeemed — links are bearer tokens and
    redemption binds the first acceptor permanently, so a "use a different account" action is
    offered. The confirm screen is fed by `GET /v1/recipients/invite/:token`, a read-only
    preview that runs the same gate checks as acceptance (existence, expiry, email binding,
    self-accept) but consumes and mutates nothing. On confirmation the dashboard first fixes
    the account type from the invitation via `PUT /v1/onboarding/active-entity` — an
    established profile of the other type fails here (`ACTIVE_ENTITY_IMMUTABLE`) **before**
    the invite is consumed — and only then calls the same
    `POST /v1/recipients/invite/:token/accept` endpoint; every redemption invariant above
    applies unchanged, and provider onboarding attaches to the same `(profile, type)`
    customer entity the acceptance linked. Sender-side KYC tracking is client-agnostic
    either way: list/eligibility read `provider_customers` scoped by the relationship's
    recipient entity + the invitation's provider/type/country.

### Ramp registration vs. the recipient model — **PRESSING, TO BE DEFINED**

Ramp registration today is structurally a **self-offramp** flow, and (post ownership
enforcement) payout destinations are already bound to the *sender* on two of three corridors —
verified against the code:

- **Mykobo/EUR** (`evm-to-mykobo.ts`): the withdraw intent is created for the sender's own
  anchor profile (email derived from the effective user); the payout IBAN lives anchor-side.
  Third-party payout impossible.
- **Alfredpay** (`evm-to-alfredpay.ts`): `customerId` is server-derived from the effective user;
  the client-supplied `fiatAccountId` is provider-scoped to that customer. Third-party payout
  impossible.
- **BRL/avenia** (`ramp.service.ts` `prepareOfframpBrlTransactions`): sender identity is
  server-derived, but `pixDestination` + `receiverTaxId` are client-supplied; `receiverTaxId`
  defaults to the sender's own tax id and is only consistency-checked against the pix key's
  owner (`validateBrlaOfframpRequest`). **Third-party payout is possible here by design** — the
  one corridor where it is.

Consequently, sender→recipient transfers cannot be expressed through the current registration
API at all (except mechanically on BRL): the gap is **not a missing destination check** but a
missing concept — registration has no second principal. The pending design (plan §7 + §7.1,
still to be defined) is a **recipient-context extension**: a registration that carries the
`sender_recipients` id, where the server (a) verifies the relationship belongs to the
authenticated sender, (b) runs `getTransferEligibility`, and (c) resolves the payout side from
the **recipient's** provider identity / verified payout reference — recipient pix key + tax id
for BRL (narrowing the currently-free destination whenever a recipient context is present), an
order against the recipient's alfredpay customer + fiat account, a withdraw intent under the
recipient's mykobo profile. Until that lands, every dashboard "transfer" is a self-offramp of
the sender, and `GET /:id/eligibility` is UX, not a security boundary. Blocked on the §7.1
payout-instrument decision (no code path writes `verified` payout references yet).

## Threat Vectors & Mitigations

- **DB dump → redeemable invite links**: a dump now yields the raw tokens of **pending** invites
  (accepted trade-off for sender re-copy). Bounds: the 14-day TTL, first-redeemer binding, the
  token being nulled at acceptance (accepted invites hold no live secret), row-level security on
  the table, sender-entity-scoped API exposure — and redemption still requires an authenticated
  session (the token alone does not authenticate).
- **Token brute force / enumeration**: 192-bit random tokens; unknown tokens return a uniform
  `404` with no timing-relevant branching before the hash lookup.
- **Intercepted link redeemed by the wrong party**: optional email binding rejects mismatched
  accounts; unbound links are deliberately bearer-redeemable (shareable-link product) and rely on
  TTL + first-redeemer binding + sender review of the resulting relationship. An intercepted link
  is only useful *before* the intended recipient redeems it; after that it is inert to everyone
  else (invariant 3).
- **Cross-tenant access to relationships**: entity-scoped queries; PATCH/eligibility of a foreign
  relationship returns `404` (no existence oracle).
- **Blocked-recipient bypass via re-invite**: invariant 5.
- **Recipient bank PII exposure to the sender**: capture-at-transfer-time was rejected (plan §7.1
  option C); only provider-side references with masks are stored.
- **Self-granted pricing discount via invite**: a sender without the `discount_manager` role
  posts `discounts` directly to the API (bypassing the role-gated UI), or a discount manager
  posts oversized bps. The role is checked server-side against `profile_roles` and bps are
  bounded (`0..1000`, integers); the seeded `fiatCurrency` comes from the validated corridor, so
  a seed can never price a corridor the invite was not created for. An accepting profile with an
  existing active assignment keeps it (admin-set pricing is never clobbered by a link).
- **Transfer to an unverified/restricted recipient**: the eligibility gate reports
  `recipient_onboarding_pending` / `provider_restricted` / `provider_payout_reference_unverified`
  — advisory (UI-consulted) until the recipient-context extension above makes it a registration
  precondition. The exposure is bounded meanwhile: registration cannot pay third parties on
  mykobo/alfredpay at all, and on BRL only with a consistent pix key + tax id pair.

## Audit Checklist

- [ ] `recipient_invitations.token_hash` is sha256 hex and is the only redemption lookup key;
      the raw `token` column is populated only for pending invites, nulled inside the acceptance
      transaction, and surfaced only via the create response and the sender-scoped list.
- [ ] Archiving an invitation (`PATCH /v1/recipients/invitations/:id`) does not block redemption;
      archived invitations and `archived` relationships are excluded from `GET /v1/recipients`.
- [ ] The accepting recipient can redeem an invite twice and receives the existing relationship;
      other profiles receive `409`. Revoked and expired invites return `410`; expiry lazily
      transitions status.
- [ ] Email-bound invites reject a mismatched authenticated email with `403` (case-insensitive
      match on the canonical form).
- [ ] Self-acceptance returns `409`; acceptance runs in a transaction.
- [ ] Re-inviting a blocked recipient does not reactivate the relationship and leaves the new
      invite pending.
- [ ] PATCH / eligibility with another sender's relationship id returns `404`
      (`recipients.integration.test.ts`).
- [ ] Eligibility walks the full ladder; each blocking reason is covered by the integration test.
- [ ] No route or table stores raw PIX/IBAN/CLABE/account values for recipients.
- [ ] Discount-carrying invite creation without the `discount_manager` role returns `403`;
      seeding happens only inside the first-acceptance transaction, is skipped when the profile
      has an active unexpired assignment, and copies the vortex platform fee into the seeded
      config (`recipients.integration.test.ts` "invite discounts").
- [x] Alfredpay sender self accounts remain provider-side, registration carries only the
      sender-owned `fiatAccountId`, and creating one does not write a
      `recipient_payout_references` row or satisfy invited-recipient eligibility. **PASS**.

## Next Steps

- **Implement sender-side invite revocation.** The redemption path already returns
  `410 INVITE_REVOKED` for `status = 'revoked'` rows, but nothing writes that status — no
  endpoint, service, or dashboard action exists. Ship a sender-scoped revoke route (writing
  `status` / `revoked_at`) so the invariant-3a kill switch becomes operable pre-acceptance;
  today only TTL expiry and first-redeemer binding neutralize a leaked pending invite. The
  invitation-archive PATCH is **not** this: it only hides the row from the sender's list and
  leaves the token redeemable by design.
