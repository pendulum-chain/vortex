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

**Not yet enforced at quote/ramp creation.** The plan (§7) scopes server-side enforcement to
requests that carry a recipient context; no quote/ramp request carries one yet, and the payout
instrument capture mechanism (plan §7.1) is still an open decision — until it lands, no code path
writes `verified` payout references, so the gate cannot pass in production. When transfer
creation gains a recipient context, registration must call this service server-side; the
dashboard's client-side use of `GET /:id/eligibility` is UX, not the security boundary.

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
- **Transfer to an unverified/restricted recipient**: the eligibility gate blocks with
  `recipient_onboarding_pending` / `provider_restricted` / `provider_payout_reference_unverified`.

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
