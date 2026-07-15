# Profile Partner Pricing

## What This Does

Profile partner pricing lets an authenticated first-party user receive the custom quote behavior of a partner without exposing partner API credentials in the frontend. An administrator assigns a Supabase profile to a partner name, and the backend resolves that (unique) name once into a stable `partner_id`. When that user creates a quote with a valid Supabase Bearer token, the backend reads the active assignment's `partner_id` and loads the partner's pricing config for the requested ramp type from `partner_pricing_configs` (`UNIQUE(partner_id, ramp_type)`).

This feature is intentionally different from partner API-key authentication:

1. Partner API clients remain authenticated by `X-API-Key: sk_*` and may create partner-owned quotes.
2. Frontend users remain authenticated by `Authorization: Bearer <Supabase JWT>` and may create user-owned quotes.
3. A profile assignment grants pricing eligibility only. It does not grant partner ownership, API access, webhook permissions, or the ability to act as the partner.

The intended data model separates two concepts that were historically collapsed into `quote_tickets.partner_id`:

- `partner_id` remains the partner owner of a quote for API-key integrations.
- `pricing_partner_id` records which partner rate configuration was used for quote pricing, fee calculation, subsidy calculation, fee distribution, and dynamic discount state.

`profile_partner_assignments.partner_name` is a display/audit snapshot only. Runtime pricing resolution MUST use the assignment's stored `partner_id` foreign key (the legacy `buy_partner_id` / `sell_partner_id` pair remains as an unread backup — both directions always referenced the same logical partner), so partner renames cannot silently change an existing profile assignment. Duplicate partner names are structurally impossible: `partners.name` is unique and per-direction pricing lives in `partner_pricing_configs`.

For profile-assigned frontend quotes, `quote_tickets.user_id` is set to the authenticated profile, `quote_tickets.partner_id` stays `NULL`, and `quote_tickets.pricing_partner_id` is set to the resolved partner row. This lets the user consume their own quote through the existing Supabase ownership path while still preserving which partner pricing was applied.

## Security Invariants

1. **Profile assignments MUST be server-side only** - The client MUST NOT be able to choose its assigned partner by passing a request body field, URL parameter, or local storage value. The backend resolves assignments only from the authenticated `req.userId`.
2. **Profile assignments MUST NOT authenticate partner ownership** - A Supabase profile assigned to a partner MUST NOT populate `req.authenticatedPartner`, MUST NOT satisfy `enforcePartnerAuth()`, and MUST NOT access partner-owned quotes or ramps.
3. **Explicit partner API-key integrations MUST keep their existing behavior** - Requests that include `partnerId` still require a matching partner secret key. Existing SDK/API clients using partner keys must continue to create partner-owned quotes.
4. **Partner pricing source precedence MUST be deterministic** - Explicit `partnerId` has highest precedence, then validated public API key partner name, then profile assignment, then default `"vortex"` pricing.
5. **Profile-assigned quotes MUST be user-owned** - A quote priced through a profile assignment MUST persist `user_id = req.userId` and `partner_id = NULL`. Register/update/start/status access for the resulting ramp is authorized through the Supabase user path.
6. **The pricing partner MUST be persisted separately** - Any quote that applies non-default partner pricing MUST persist `pricing_partner_id` so downstream fee distribution and dynamic discount state use the same partner row that quote calculation used.
7. **Inactive or expired assignments MUST be ignored** - The assignment resolver must require `is_active = true` and either `expires_at IS NULL` or `expires_at > now()`.
8. **Assignment partner IDs MUST be stable** - Assignment creation may accept a logical partner name for admin convenience, but it MUST persist the resolved `partner_id` and quote resolution MUST use that ID, not a fresh name lookup. Direction selection happens at quote time via the `(partner_id, ramp_type)` pricing-config lookup.
9. **Partner-name ambiguity is structurally impossible** - `partners.name` carries a unique constraint (`uniq_partners_name`), so assignment creation resolves at most one row. (The pre-split ambiguity-rejection rule is retired.)
10. **Invalid assignments MUST fail closed to default pricing** - If an assignment points to no active partner row for the requested ramp type, quote creation proceeds without that partner's pricing instead of accepting untrusted client input or fabricating a partner.
11. **Admin active-list semantics MUST match quote-time semantics** - Default assignment listing MUST exclude rows that are inactive or expired; historical listing may include them only when explicitly requested.
12. **Fee distribution MUST use the pricing partner, not only the owner partner** - Partner markup payout uses `pricing_partner_id` when present, with `partner_id` as a backward-compatible fallback for older quotes.
13. **Dynamic discount state MUST use the pricing partner** - Quote consumption adjusts the dynamic discount state for the partner whose pricing was used, not for the quote owner.
14. **Assignment administration MUST require admin auth** - Create, list, and revoke assignment endpoints MUST be protected by `adminAuth`; partner API keys and Supabase user tokens MUST NOT manage assignments.
15. **Assignment replacement MUST be atomic per profile** - Creating a new active assignment MUST deactivate the previous active row and insert the replacement in one database transaction. The transaction MUST lock the profile row so concurrent admin writes for the same user serialize, and any residual active-assignment unique-index conflict MUST fail with a retryable `409`.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **User spoofs partner discount** | A frontend user passes another partner's `partnerId` in the quote request body to claim better rates. | Existing `enforcePartnerAuth()` rejects `partnerId` unless a matching `sk_*` is present. Profile assignment resolution ignores client-supplied partner fields. |
| **Assigned user becomes partner principal** | A profile assigned to a partner tries to read or mutate partner-owned quotes, ramps, webhooks, or history. | Assignment affects quote pricing only. It does not set `req.authenticatedPartner`; ownership guards still separate user-owned and partner-owned resources. |
| **Broken API-client compatibility** | Splitting pricing and owner fields accidentally makes SDK quotes user-owned or anonymous. | Existing partner-key and public-key request paths continue to populate `partner_id` as before. The new user-owned behavior is only used for server-resolved profile assignments. |
| **Dropped partner markup payout** | A profile-assigned quote computes a partner markup but downstream fee distribution looks only at `quote.partnerId`, sees `NULL`, and skips partner payout. | Fee distribution resolves payout from `pricing_partner_id ?? partner_id`. |
| **Dynamic state drift for the wrong principal** | A profile-assigned quote is consumed but dynamic discount state is decremented for no partner or the wrong partner. | Ramp registration resolves the partner from `pricing_partner_id ?? partner_id` before calling `handleQuoteConsumptionForDiscountState`. |
| **Stale assignment remains usable** | A profile's temporary partner entitlement expires but quote creation still applies custom rates. | Resolver filters out assignments with `expires_at <= now()`. |
| **Assignment changes after partner rename** | A partner row is renamed after assignment creation, and future quotes unexpectedly lose or change pricing. | Assignments persist `partner_id`; `partner_name` is display/audit only. |
| **Assignment to missing ramp-type config** | A profile is assigned to partner `Acme`, but `partner_pricing_configs` has only an active BUY config and the user requests SELL. | The `(partner_id, SELL)` pricing-config lookup returns nothing; resolver falls back to default pricing for SELL. |
| **Expired assignment shown as active** | Admin tooling lists an expired row as active, leading support to assume custom rates still apply. | Default list filtering uses the same active + unexpired predicate as quote resolution; `includeInactive=true` is the historical view. |
| **Unauthorized assignment management** | A partner or normal frontend user assigns themselves or another profile to a discounted partner. | Assignment management routes live under `/v1/admin/profile-partner-assignments` and require `adminAuth`. |
| **Partial assignment replacement** | Admin assignment creation deactivates the current row and then fails before inserting the replacement, leaving the profile with no active pricing assignment. Concurrent creates can also race against the active-user partial unique index. | Replacement runs in one transaction after locking the profile row. Rollback preserves the prior active assignment, and residual unique-index conflicts return `409 ASSIGNMENT_CONFLICT` so the admin can retry. |

## Audit Checklist

- [x] `profile_partner_assignments` exists with `user_id`, display/audit `partner_name`, canonical `partner_id` FK (legacy `buy_partner_id` / `sell_partner_id` retained as unread backup), `is_active`, optional `expires_at`, timestamps, and indexes for active user lookups.
- [x] Admin assignment endpoints are protected by `adminAuth` and reject non-admin credentials.
- [x] Admin assignment creation resolves the unique-name partner or returns `404 PARTNER_NOT_FOUND` (same-name ambiguity is structurally impossible post-split).
- [x] Default admin assignment listing excludes expired rows; `includeInactive=true` is required for historical rows.
- [x] Admin assignment replacement deactivates the old active row and creates the new row in one transaction after taking a row lock for the target profile.
- [x] Active-assignment unique-index collisions return `409 ASSIGNMENT_CONFLICT` instead of a generic server error.
- [x] Quote creation resolves profile assignments only from `req.userId`; unauthenticated quotes never use profile assignment pricing.
- [x] Profile assignment quote resolution uses the stored `partner_id` plus a `(partner_id, ramp_type)` pricing-config lookup, not a fresh runtime `partner_name` lookup.
- [x] `POST /v1/quotes` and `POST /v1/quotes/best` still reject explicit `partnerId` without matching secret-key authentication.
- [x] Profile-assigned quotes persist `user_id` and `pricing_partner_id`, while leaving `partner_id` `NULL`.
- [x] Existing partner API-key and public-key quote paths preserve their previous `partner_id` behavior.
- [x] Fee distribution uses `pricing_partner_id ?? partner_id` for partner markup payout.
- [x] Ramp registration updates discount state using `pricing_partner_id ?? partner_id`.
- [x] User ownership checks continue to authorize profile-assigned quotes through `user_id`.
- [x] Partner ownership checks continue to authorize API-client quotes through `partner_id`.
- [x] Tests cover assigned user quote ownership, ramp-specific partner-ID resolution, quote persistence of `pricing_partner_id`, expired list filtering, and the non-regression path for partner-owned quotes.
