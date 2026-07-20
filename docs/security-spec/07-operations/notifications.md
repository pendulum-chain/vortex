# Notifications

## What This Does

In-app notification feed + per-profile preferences for the dashboard (plan §8). Tables
`notifications` and `notification_preferences` (migration `043`), routes under
`/v1/notifications` (`notifications.controller.ts`), all behind `requireAuth`:

| Endpoint | Purpose |
| :-- | :-- |
| `GET /v1/notifications?limit=&before=` | Newest-first feed + `unreadCount` (limit clamped to 1–100) |
| `POST /v1/notifications/:id/read` | Mark one read (owner-scoped) |
| `POST /v1/notifications/read-all` | Mark all unread read |
| `GET /v1/notifications/preferences` | Read prefs (row created with defaults on first read) |
| `PUT /v1/notifications/preferences` | Update `emailEnabled` / `prefs` (typed validation) |

Writes go through `emitNotification(profileId, event)` (`notification.service.ts`). Notification
content is rendered verbatim to users and may later be emailed, so it is a PII-leak surface.

## Security Invariants

1. **Owner-scoped access.** Every route filters on `profile_id = req.userId`; reading or
   mutating another profile's notification returns a uniform `404`. Rows CASCADE on profile
   deletion.
2. **Server-emitted only.** There is no endpoint that creates notifications; only backend code
   calls `emitNotification`. Clients can only read and flip read-state/preferences.
3. **Emission never breaks business flows.** `emitNotification` catches and logs all errors and
   returns `null` — a notification failure must not fail the operation that triggered it.
4. **No sensitive values in content.** `title`/`body`/`metadata` must not contain payout
   instrument details, tax ids, addresses, tokens, or provider identifiers that aren't already
   user-visible. Current emitters: `recipient_invite_accepted` (metadata: internal row ids only).
5. **Bounded reads.** `limit` is clamped to 1–100; pagination via the `before` timestamp cursor.
6. **RLS with no policies** on both tables (like all 038+ tables): PostgREST/anon access is
   denied; only the API's direct PG connection reads them.

## Threat Vectors & Mitigations

- **Cross-profile feed reads or mark-read**: owner-scoped queries, uniform `404`
  (`notifications-onboarding.integration.test.ts`).
- **Client-forged notifications (phishing inside the product UI)**: no write endpoint exists;
  emission is server-side only (invariant 2).
- **PII leakage via feed or future email**: content rules (invariant 4) apply to every emitter;
  the planned invite email must contain the invite **link only**, never payout or identity data.
- **Unbounded query cost**: limit clamp + indexed `(profile_id, created_at)` reads.

## Audit Checklist

- [ ] Every `/v1/notifications` route resolves ownership from `req.userId` before touching rows.
- [ ] No route creates notification rows; grep confirms `emitNotification` callers are backend
      services/controllers acting on server-derived events.
- [ ] `emitNotification` cannot throw into its caller.
- [ ] Existing emitters carry no PII in `title`/`body`/`metadata`.
- [ ] **Email dispatch is NOT implemented** (plan D7 — Supabase SMTP/edge function pending):
      `email_enabled` is a stored preference with no effect yet. When the transport lands it must
      gate on preferences, be server-side triggered only, and follow the content rules — update
      this spec in the same change.
