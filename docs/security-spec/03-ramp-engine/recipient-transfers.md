# Recipient Transfers

## What This Does

The dashboard's recipient product: a sender invites a recipient via a shareable link, the recipient
onboards (KYC/KYB via the widget) under their **own** profile, and the sender may then create
transfers (offramps) that pay out to that recipient. Backed by the migration-`042` tables
(`recipient_invitations`, `sender_recipients`, `recipient_payout_references`), all anchored to
`customer_entities`. Routes live under `/v1/recipients` (`recipients.controller.ts`), all behind
`requireAuth` (Supabase bearer token):

| Endpoint | Purpose |
| :-- | :-- |
| `POST /v1/recipients/invite` | Sender creates an invite; response returns the raw link token **once** |
| `POST /v1/recipients/invite/:token/accept` | Authenticated recipient redeems the token |
| `GET /v1/recipients` | Sender lists relationships + pending invitations |
| `PATCH /v1/recipients/:id` | Sender sets nickname / `active` / `blocked` / `archived` |
| `GET /v1/recipients/:id/eligibility` | Transfer gate: `{ canCreateTransfer, blockingReasonCode? }` |

This matters because the sender↔recipient link is an authorization edge over money movement: a
broken invite or scoping check lets an attacker attach themselves as someone's recipient, or pay
out against another tenant's relationship.

## Security Invariants

1. **Raw invite tokens are never stored.** Tokens are 24 random bytes (base64url,
   `crypto.randomBytes`); only their sha256 hex hash lands in
   `recipient_invitations.token_hash` (UNIQUE). The raw token appears exactly once, in the
   `POST /invite` response (`recipient-invite.service.ts`).
2. **Redemption is token-bound (plan D1).** Possession of the token is the redemption key. If
   `invitee_email` was recorded, the redeemer's authenticated email must additionally match its
   canonical (trimmed, lowercased) form, else `403 INVITE_EMAIL_MISMATCH`.
3. **Invites are single-use and expiring.** `pending` is the only redeemable status: accepted →
   `409`, revoked/expired → `410`. Expiry is 14 days (`INVITE_TTL_MS`); redemption past
   `expires_at` transitions the row to `expired`.
4. **Redemption requires authentication and cannot be self-directed.** The redeemer must hold a
   valid session; a redeemer whose profile owns the sender entity gets
   `409 CANNOT_ACCEPT_OWN_INVITE`.
5. **A `blocked` relationship is never resurrected by a new invite.** Acceptance against a
   blocked pair returns `409 RELATIONSHIP_BLOCKED` and leaves the invite `pending`; only
   `archived` reactivates. Acceptance (entity resolve + relationship upsert + invite state) runs
   in one transaction.
6. **All sender-side routes are entity-scoped.** List/PATCH/eligibility resolve the caller's
   `customer_entity` from `req.userId` and filter on `sender_customer_entity_id`; foreign ids
   return a uniform `404`.
7. **No recipient payout PII is stored locally (plan D3).** `recipient_payout_references` holds a
   provider instrument id + masked label + status only; senders only ever see the mask.
8. **Transfer eligibility requires the full gate** (`transfer-eligibility.service.ts`): invite
   accepted ∧ relationship `active` ∧ recipient approved with the corridor's provider (rail →
   provider: `eur`→mykobo, `brl`→avenia, else alfredpay, country-scoped for alfredpay; statuses
   provider-verbatim, approved = `APPROVED`/`SUCCESS`/`Accepted`, restricted =
   `REJECTED`/`FAILED`/`Rejected`) ∧ a `verified` payout reference for the relationship + rail.
   First failing check returns its `blockingReasonCode`.

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

- **DB dump → redeemable invite links**: only sha256 hashes at rest; tokens are not recoverable.
- **Token brute force / enumeration**: 192-bit random tokens; unknown tokens return a uniform
  `404` with no timing-relevant branching before the hash lookup.
- **Intercepted link redeemed by the wrong party**: optional email binding rejects mismatched
  accounts; unbound links are deliberately bearer-redeemable (shareable-link product) and rely on
  TTL + single-use + sender review of the resulting relationship.
- **Cross-tenant access to relationships**: entity-scoped queries; PATCH/eligibility of a foreign
  relationship returns `404` (no existence oracle).
- **Blocked-recipient bypass via re-invite**: invariant 5.
- **Recipient bank PII exposure to the sender**: capture-at-transfer-time was rejected (plan §7.1
  option C); only provider-side references with masks are stored.
- **Transfer to an unverified/restricted recipient**: the eligibility gate reports
  `recipient_onboarding_pending` / `provider_restricted` / `provider_payout_reference_unverified`
  — advisory (UI-consulted) until the recipient-context extension above makes it a registration
  precondition. The exposure is bounded meanwhile: registration cannot pay third parties on
  mykobo/alfredpay at all, and on BRL only with a consistent pix key + tax id pair.

## Audit Checklist

- [ ] `recipient_invitations.token_hash` is sha256 hex; no raw token column exists; the create
      response is the only place the token appears.
- [ ] Accepting an invite twice returns `409`; revoked and expired invites return `410`; expiry
      lazily transitions status.
- [ ] Email-bound invites reject a mismatched authenticated email with `403` (case-insensitive
      match on the canonical form).
- [ ] Self-acceptance returns `409`; acceptance runs in a transaction.
- [ ] Re-inviting a blocked recipient does not reactivate the relationship and leaves the new
      invite pending.
- [ ] PATCH / eligibility with another sender's relationship id returns `404`
      (`recipients.integration.test.ts`).
- [ ] Eligibility walks the full ladder; each blocking reason is covered by the integration test.
- [ ] No route or table stores raw PIX/IBAN/CLABE/account values for recipients.
