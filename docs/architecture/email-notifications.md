# Email Notifications — Architecture

How outbound email works in Vortex after the `feat/email-notifications` branch, and how
it differs from what was there before.

Security-facing detail (invariants, threat model, audit checklist) lives in
[`docs/security-spec/05-integrations/resend.md`](../security-spec/05-integrations/resend.md).
This page is the shape of the system.

---

## 1. Before vs. after, in one picture

**Before** — there was no transactional email at all. Auth mail was the only mail, and it
came out of Supabase's built-in Inbucket capture in local dev with no production SMTP
configured. Nothing in `apps/api` ever sent an email.

```mermaid
flowchart LR
  subgraph before["BEFORE"]
    U1[User] -->|request OTP| SB1[Supabase Auth]
    SB1 -.->|"local: Inbucket<br/>hosted: Supabase default sender"| MB1[Mailbox]
    API1["apps/api"] -.->|no email path exists| NONE(["nothing"])
  end
```

- Ramp completion: user found out by watching the widget. Close the tab, no signal.
- KYC/KYB outcome (Avenia, hours-to-days): user had to come back and re-check. No webhook
  consumer, no polling, no notification — `TaxId.kycAttempt` was declared on the model but
  never written, and nothing in the codebase listened to Avenia at all.
- Main's in-app notification centre (migration 043, `notifications` table) existed with a
  comment marking where email dispatch *would* hook in. Nothing was wired.

**After** — two independent classes of mail, both through Resend, sharing only the
sending domain.

```mermaid
flowchart LR
  subgraph after["AFTER"]
    U2[User] -->|request OTP| SB2[Supabase Auth]
    SB2 -->|"SMTP smtp.resend.com:587"| R[Resend]

    RS["PhaseProcessor<br/>phase → complete"] -->|enqueue| Q[(email_notifications)]
    AV["Avenia"] -->|"webhook: KYC + KYB"| WH["POST /v1/webhooks/avenia"]
    WH -->|enqueue| Q
    KW["KybStatusWorker<br/>cron hourly"] -.->|"reconcile (deduped)"| Q
    Q -->|claim + send| NDW["NotificationDispatchWorker<br/>send every 1 min<br/>reconcile hourly"]
    NDW -.->|"re-enqueue completed ramps<br/>with no row"| Q
    NDW -->|"HTTPS api.resend.com"| R

    R --> MB2[Mailbox]
  end
```

| | Before | After |
|---|---|---|
| Auth mail transport | Supabase default / Inbucket | Resend SMTP relay, `vortexfinance.co` |
| Transactional mail | none | Resend HTTPS API from `apps/api` |
| Durability | n/a | every email is a DB row before any send |
| Retries | n/a | 6 attempts, backoff 1/5/15/60/180 min |
| Dedupe | n/a | unique `(provider, type, resource_id)` |
| KYC/KYB outcome visibility | user re-checks manually | Avenia webhook, emailed on settle; hourly poll as fallback |
| Inbound Avenia events | not consumed | RSA-PSS verified receiver, raw-body mounted |
| Non-prod safety | n/a | recipient allowlist gate |

---

## 2. The two mail classes

They are genuinely separate systems that happen to share one vendor and one domain.

```mermaid
flowchart TB
  subgraph auth["Authentication mail — no Vortex code involved"]
    A1["Supabase Auth / GoTrue"] -->|renders + sends| A2[Resend SMTP]
  end
  subgraph tx["Transactional mail — this feature"]
    B1["apps/api"] -->|renders + sends| B2[Resend HTTPS API]
  end
```

- **Auth mail** is configured *outside the repo*. `supabase/config.toml` only governs the
  local stack; staging and production must be set in the Supabase Dashboard
  (Project Settings → Authentication → SMTP). Nothing in CI pushes that file.
- **Transactional mail** is the rest of this document.

Shared-domain consequence: a reputation incident in either class affects both. Accepted
deliberately, in exchange for a recognisable sender.

---

## 3. Producers — what enqueues, and when

Four producers, all fire-and-forget into the same table. None of them ever sends.

```mermaid
flowchart LR
  subgraph producers["Producers"]
    P1["PhaseProcessor.processPhase()<br/>currentPhase === 'complete'"]
    P2["POST /v1/webhooks/avenia<br/>KYC + KYB events"]
    P3["KybStatusWorker.poll()<br/>hourly reconciliation"]
    P4["refreshAlfredpayCustomerStatus()<br/>dashboard refresh + hourly sweep"]
  end
  P1 -->|"provider: vortex<br/>type: ramp_completed<br/>resourceId: rampState.id"| Q[(email_notifications)]
  P2 -->|"provider: avenia<br/>type: verification_*<br/>resourceId: attempt.id"| Q
  P3 -.->|"same key — deduped"| Q
  P4 -->|"provider: alfredpay<br/>type: verification_*<br/>resourceId: submissionId"| Q
```

P2 and P3 deliberately overlap. They enqueue through the same
`enqueueVerificationNotification()` on the same `(provider, type, attempt.id)` key, so the
poll racing or repeating a webhook is a no-op rather than a second email.

**Ramp completion** — `enqueueRampCompletedEmail()` in
`apps/api/src/api/services/email/ramp-completion.ts`, called from the terminal `complete`
branch of `apps/api/src/api/services/phases/phase-processor.ts`.

The hook belongs on the phase processor because that is the *only* place a ramp actually
reaches `complete` — it is the "single source of authority for phase transitions" and writes
`currentPhase` straight onto the model. `RampService.logPhaseTransition()` (and the
`notifyStatusChangeIfNeeded()` it wraps) has no call sites, so anything hung off it never
runs. The producer lives in the email module rather than on `RampService` because
`ramp.service.ts` imports `phase-processor`, so the reverse import would be a cycle.

Only ramps with a non-null `rampState.userId` produce mail — that field is populated solely
from `req.userId`, which only the Supabase auth middleware sets, so partner-API ramps are
excluded by construction. A partner-driven ramp has no Vortex-side recipient: the address on
`additionalData.email` belongs to the *partner's* customer, not to us.

The payload carries both legs of the trade, already resolved to the user's perspective. On a
buy the user pays fiat and receives the token; on a sell it is reversed, so which side of the
quote each leg reads from swaps with `rampState.type`:

| Payload field | `BUY` (onramp) | `SELL` (offramp) |
| --- | --- | --- |
| `fiatAmount` / `fiatCurrency` | `quote.inputAmount` / `inputCurrency` | `quote.outputAmount` / `outputCurrency` |
| `tokenAmount` / `tokenSymbol` | `quote.outputAmount` / `outputCurrency` | `quote.inputAmount` / `inputCurrency` |

Plus `network`, `rampId`, `rampType` and `completedAt`. The timestamp comes from the recorded
`complete` entry in `phaseHistory`, so delayed reconciliation does not claim the ramp completed
when the email was finally queued. Enqueue is fire-and-forget: a failure is logged but never
fails a ramp that already succeeded.

That isolation costs atomicity — the enqueue runs after the terminal phase is persisted, so a
backend that dies in between leaves a completed ramp with no row, and `complete` is never
revisited. `NotificationDispatchWorker` therefore reconciles hourly
(`reconcileMissedRampCompletedEmails()`): it asks PostgreSQL for all ramps with a `userId` that
reached `complete` but have no `(vortex, ramp_completed, <ramp id>)` row, with no age cutoff.
The indexed anti-join returns only anomalies instead of rescanning every historical ramp. It
shares the same idempotency key, so a row the inline path did write is untouched.

**Verification (KYC + KYB), primary path** —
`apps/api/src/api/controllers/avenia-webhook.controller.ts`

Avenia pushes attempt updates to `POST /v1/webhooks/avenia`. Both verification kinds are
handled here.

Three things make this endpoint unusual and are worth understanding before touching it:

1. **It is authenticated by signature, not by API key or session.** Avenia signs the raw
   body with RSA-PSS / SHA-256; we verify against their published key from
   `GET /v2/public-key`. The key is cached for an hour and refetched on a miss — coalesced
   and rate-limited to one fetch per 30s, so forged bodies cannot amplify into Avenia load.
   The fetch itself aborts after 10 seconds, so a stalled provider cannot tie up signature
   verification indefinitely. Avenia's guide states the key rotates and must never be pinned.
2. **It is mounted ahead of the global JSON body parser** in `config/express.ts`, using
   `bodyParser.raw`. The signature covers the exact bytes sent; parsing and re-serialising
   the JSON does not reproduce them byte for byte, so a normally-mounted route could never
   verify.
3. **Which kind of verification an event describes is read from our own database**, not
   from the payload — `provider_customers.customer_type` for the normalized account id.
   It also decides whether the mail says identity or business verification. So this keeps
   working regardless of how Avenia labels company events.

Everything after signature verification answers `200`: a ticket event, an unknown
subaccount, a partner-owned subaccount, or a still-in-progress attempt are all deliberate
no-ops, and Avenia must not retry them. Only an unverified or malformed body is rejected.

"Malformed" is decided by runtime validation, not by a TypeScript cast. A signature proves
Avenia sent the bytes; it says nothing about their shape, and `JSON.parse` will happily
return `null`, an array, or an attempt with no `status`. Since the payload is persisted and
later rendered into someone's inbox, the envelope and the attempt are both checked before
the first property read, and anything that fails gets a deterministic `400`. An unrecognised
*value* — a status Avenia adds later — is not malformed: it is acknowledged `200` and maps
to no email, because a `400` would make Avenia retry it forever.

Avenia's guides document two envelope shapes. The receiver accepts both the management
shape (`{ subAccountId, subscription, data }`) and the event-specific shape
(`{ event: { accountId, subscription, data } }`), then validates one normalized event.

**Verification, reconciliation path** — `apps/api/src/api/workers/kyb-status.worker.ts`

Runs hourly. It exists because **Avenia documents no KYB subscription**: their subscription
list is `TICKET`, `KYC`, `LIMIT-UPDATE`, `*`. Company attempts are *expected* to arrive
under the wildcard because Avenia fetches both kinds from the same `/v2/kyc/attempts`
resource — but that is an inference, not a documented guarantee, and if it is wrong the
failure is silent (no KYB emails, no error). The poll is what makes being wrong survivable.

It selects `kyc_cases` rows that are `provider = 'avenia'` + `type = 'kyb'` + undecided +
have a `providerCaseId` + belong to an entity with a `profileId` + were last written within
60 days, then calls `getKybAttemptStatus(providerCaseId)` for each one. It polls **one known
attempt id**, not a list: `GET /v2/kyc/attempts` has no documented ordering, so picking from
it would guess at which attempt a notification describes — and that attempt id *is* the
dedupe key. The window is on `updatedAt`, not `createdAt`: the case row is rebound to a
fresh attempt on re-initiation, so its creation date says nothing about the attempt in
flight.

```mermaid
stateDiagram-v2
  [*] --> observed: webhook event, or hourly poll of TaxId.kycAttempt
  observed --> observed: status ≠ COMPLETED/EXPIRED (no-op)
  observed --> approved: COMPLETED + APPROVED
  observed --> rejected: COMPLETED + REJECTED
  observed --> expired: EXPIRED
  approved --> [*]: enqueue verification_approved
  rejected --> [*]: enqueue verification_rejected (reason ≤200 chars)
  expired --> [*]: enqueue verification_expired
```

Both paths share `enqueueVerificationNotification()` in
`apps/api/src/api/services/avenia/verification-notifications.ts`, which owns the
terminal-state mapping above. That shared key is also the **replay defence**: Avenia's
signature carries no timestamp or nonce, so a captured event can be re-posted freely — it
just collapses to an existing row.

> **Deployment note:** the webhook must be registered once per environment with
> `bun register:avenia-webhook` (reads `AVENIA_WEBHOOK_URL`, subscribes with `*`). Until
> it is, no verification email is sent by the primary path.

> **Deployment note:** the poller's `providerCaseId IS NOT NULL` filter means KYB attempts
> started before this deploys are never observed by reconciliation. In dev all 15 `COMPANY`
> tax_ids have `kyc_attempt = NULL`. Either accept that those never notify, or backfill.

**Verification, Alfredpay (MX / CO / AR / US)** —
`apps/api/src/api/services/alfredpay/alfredpay-customer.service.ts`

Alfredpay is the one provider with **no webhook at all** — `AlfredpayApiService` exposes
only request/response methods, and Alfredpay publishes no verification events. So there is
no primary push path here and nothing to reconcile against: a status poll is the only way an
outcome is ever seen.

That poll is `refreshAlfredpayCustomerStatus()`, which resolves the account's latest
submission id, calls `getKycStatus`/`getKybStatus` for it, maps the result, and persists it.
Its background/onboarding callers share `refreshAlfredpayCustomerStatus()`. The two legacy
Alfredpay status endpoints perform the same terminal enqueue through
`enqueueAlfredpayVerificationNotification()` before they write their legacy-shaped view:

| Caller | When | Covers |
| --- | --- | --- |
| `onboarding.controller.ts` | dashboard status aggregation, TTL-throttled per account | the user who comes back to look |
| `alfredpay.controller.ts` | `/alfredpayStatus` and `/getKycStatus` | legacy clients that poll either status endpoint |
| `AlfredpayStatusWorker` | hourly, `15 * * * *` | the user who never returns |

These paths select on or eventually exclude a *terminal stored status*, so an account drops out of every
future poll the moment its outcome is written. Whichever caller observes the transition is
therefore the only one that may see it. Every observer consequently uses the same idempotent
enqueue helper before persisting the terminal outcome.

For the same reason the enqueue is ordered **before** the status write. An account persisted
terminal while the enqueue failed would be filtered out of every subsequent poll and its
mail lost for good; failing first leaves the account non-terminal so the next poll retries
the outcome and the email together. (The Avenia path does not need this — its webhook
re-delivers, and the reconciliation poll keys off an attempt id that stays pollable.)

The provider pollers run only on the `mykobo` flow-variant backend. Both flow variants share
the same database and provider accounts, so starting them on the legacy `monerium` backend as
well only duplicated every external status request. Cron jobs use `waitForCompletion`, which
also prevents a slow cycle overlapping its next tick within one process.

Two behavioural differences from Avenia worth knowing:

- **`verification_expired` never fires for Alfredpay.** `AlfredpayKycStatus` has no expiry.
  `COMPLETED` and `FAILED` are the only terminal values; `CREATED`, `PENDING` and
  `IN_REVIEW` are still in flight and `UPDATE_REQUIRED` is resumable in the wizard.
- **The dedupe key is the submission id**, not an attempt id. A resubmission after a
  rejection carries a fresh `submissionId`, so it correctly mails again rather than
  collapsing into the earlier row.

The sweep is bounded on both axes — 60 days of `provider_customers.updatedAt` and 250
accounts per cycle — because an account abandoned mid-wizard stays non-terminal forever
and each one costs two to three Alfredpay calls. It advances through a stable `id` keyset
and wraps after the last page, so a steady stream of newer accounts cannot starve older
eligible rows. A truncated cycle logs a warning rather than silently dropping the
remainder. Entities with no `profileId` (partner-owned) are excluded in the query, not
skipped in the loop, so they never spend provider calls.

> **Locale note:** Alfredpay's users are MX/CO/AR/US, and `SUPPORTED_LOCALES` is still
> `en-US` and `pt-BR` only. `toEmailLocale` falls back silently, so these users receive
> **English**. See §10.

---

## 4. The queue — `email_notifications`

The table *is* the design. It is simultaneously the queue, the retry ledger, the audit
trail, and the idempotency key.

Migration `055-create-email-notifications-table.ts`, model
`apps/api/src/models/emailNotification.model.ts`.

| Column | Purpose |
|---|---|
| `provider` / `type` / `resource_id` | unique together — the idempotency key. All three `NOT NULL` because Postgres treats NULLs as distinct and would let duplicates through |
| `user_id` | FK → `profiles`, CASCADE. The *only* source of a recipient |
| `locale` | resolved at enqueue from Supabase `user_metadata.locale` |
| `payload` | JSONB snapshot of the facts at enqueue time |
| `status` | see the lifecycle below |
| `attempts` | incremented **at claim time**, not after success |
| `next_attempt_at` | backoff schedule; also the dispatch ordering key |
| `sent_at`, `provider_message_id` | proof of delivery |
| `last_error` | truncated to 2000 chars, never contains the API key |

Indexes: unique `uniq_email_notifications_provider_type_resource`, plus
`idx_email_notifications_dispatch` and `idx_email_notifications_user_id`.

> **Name collision:** this is `email_notifications`, *not* `notifications`. Migration 043 on
> `main` already owns `notifications` for the in-app notification centre. See §7.

### Status lifecycle

```mermaid
stateDiagram-v2
  [*] --> pending: enqueueNotification (findOrCreate)
  pending --> sending: claimed (FOR UPDATE SKIP LOCKED, attempts++)
  failed --> sending: claimed after backoff, attempts under 6
  sending --> sent: Resend 2xx
  sending --> skipped: no profile email, opted out,<br/>or not in allowlist (non-prod)
  sending --> failed: send error, attempts under 6
  sending --> abandoned: send error, attempts = 6 → Slack alert
  sending --> pending: RESEND_API_KEY missing (never consumed)
  sending --> failed: stale over 15 min, attempts under 6 — crash release
  sending --> abandoned: stale over 15 min, attempts = 6 → Slack alert
  sent --> [*]
  skipped --> [*]
  abandoned --> [*]
```

---

## 5. The dispatcher — one send path

`NotificationDispatchWorker`, cron `* * * * *`. It is the **only** code that calls Resend.

```mermaid
sequenceDiagram
  participant W as NotificationDispatchWorker
  participant DB as Postgres
  participant P as profiles
  participant T as Templates
  participant R as Resend

  W->>W: RESEND_API_KEY set? else warn + leave pending
  W->>DB: rows stuck in sending over 15 min:<br/>attempts < 6 → failed, attempts = 6 → abandoned + Slack
  W->>DB: BEGIN
  DB-->>W: SELECT … WHERE next_attempt_at ≤ now()<br/>AND status IN pending, failed<br/>AND attempts < 6<br/>LIMIT 25 FOR UPDATE SKIP LOCKED
  W->>DB: UPDATE → sending, attempts = attempts + 1
  W->>DB: COMMIT
  loop each claimed row
    W->>DB: notification_preferences WHERE profile_id = user_id
    alt opted out
      W->>DB: status = skipped (no request made)
    else
      W->>P: profiles.email WHERE id = user_id
      alt no email
        W->>DB: status = skipped
      else non-prod and not allowlisted
        W->>DB: status = skipped (no request made)
      else
        W->>T: renderNotification(row) → subject/html/text
        W->>R: POST https://api.resend.com/emails<br/>Idempotency-Key: row id
        alt 2xx
          R-->>W: { id }
          W->>DB: status = sent, sent_at, provider_message_id
        else error
          W->>DB: status = failed + next_attempt_at,<br/>or abandoned + Slack alert at attempt 6
        end
      end
    end
  end
```

Four properties worth naming, because each one is load-bearing:

1. **`FOR UPDATE SKIP LOCKED`.** Both flow-variant backends run against one database. Without
   the claim, both dispatch the same row and the user gets the email twice. This is the single
   most important line in the feature.
2. **Recipient resolved at send time**, never snapshotted and never caller-supplied. It comes
   from `profiles.email` via `user_id`. No request payload can influence where mail goes.
3. **`attempts` increments at claim, not after success.** A process that dies mid-send still
   burns an attempt. That alone does not stop the loop, though: a crashed send records no
   failure, so the cap in `handleDeliveryFailure` never runs for it. The stale-claim sweep
   therefore abandons rows at the cap rather than releasing them, and the claim query skips
   them — those two are what actually terminate a crash loop.
4. **The row id is Resend's `Idempotency-Key`.** The unique index stops two *rows* for one
   event; it says nothing about the window between Resend accepting a send and `sent` being
   persisted. A crash in there returns the row to the queue with the mail already gone, and
   the key is what makes the retry a replay rather than a second email.

---

## 6. Rendering

```mermaid
flowchart LR
  N["row.type + row.locale + row.payload"] --> RN["renderNotification()"]
  RN -->|"ramp_completed"| T1["ramp-completed.ts"]
  RN -->|"verification_approved<br/>verification_rejected<br/>verification_expired"| T2["verification-status.ts"]
  T1 --> L["layout.ts"]
  T2 --> L
  L --> O["{ subject, html, text }"]
```

- Dispatch is on **type only**, not provider — which is why Alfredpay rows needed no
  template work at all: they render through the same verification templates as Avenia.
- Locales: `en-US`, `pt-BR`. `toEmailLocale` falls back to `en-US` for anything else, which
  today silently catches Alfredpay's MX/CO/AR users — see the `es-419` follow-up in §10.
- Templates import nothing from the database layer, which is what makes
  `bun preview:emails` able to render them standalone.
- Every interpolated value is HTML-escaped; Avenia's `resultMessage` is additionally capped
  at 200 chars and only included on rejection.

---

## 7. Relationship to the in-app notification centre

`main` has a separate, older feature also called notifications:

| | In-app notifications (`main`) | Email notifications (this branch) |
|---|---|---|
| Table | `notifications` (migration 043) | `email_notifications` (migration 055) |
| Model | `models/notification.model.ts` | `models/emailNotification.model.ts` |
| Service | `api/services/notifications/` | `api/services/email/` |
| Preferences | `notification_preferences.email_enabled` | same row, read at delivery |
| Surface | API routes, read by the client | no route; write-only, worker-read |

The two tables stay separate, but they share one opt-out. `notification_preferences` is
already the user-facing switch (`GET`/`PUT /v1/notifications/preferences`), so the dispatcher
reads it rather than introducing a second one:

- `email_enabled = false` silences every email.
- `prefs[<type>] = false` silences one type. The key is the stored `type` value —
  `ramp_completed`, `verification_approved`, `verification_rejected`, `verification_expired`.
  Any other value, including an absent key, means enabled.

Both fields can only ever *suppress* mail, which is what makes the missing-row case safe: a
profile that has never touched its preferences has no row, and is treated exactly as the
default row `getOrCreateNotificationPreferences` would write. The dispatcher reads rather
than creates, so a send never writes a preferences row as a side effect.

The check runs at delivery, not at enqueue — an opt-out registered while a row is still in
the queue is honoured, and an opted-out row is recorded `skipped` with no request to Resend.

---

## 8. Configuration

| Variable | Effect |
|---|---|
| `RESEND_API_KEY` | Missing → the worker warns and leaves rows `pending`. Never marks them sent/failed/abandoned, so the backlog flushes when the key arrives |
| `EMAIL_FROM_ADDRESS` | Defaults to `Vortex Finance <support@vortexfinance.co>` |
| `EMAIL_REPLY_TO_ADDRESS` | Optional |
| `EMAIL_RECIPIENT_ALLOWLIST` | Comma-separated. Enforced whenever `DEPLOYMENT_ENV !== "production"`. **Empty = nothing is ever sent outside production** |
| `AVENIA_WEBHOOK_URL` | Public https URL of this backend's `/v1/webhooks/avenia`. Read only by `bun register:avenia-webhook`; the receiver itself needs no config |

Domain requirements on `vortexfinance.co`: Resend DKIM CNAMEs, exactly **one** SPF record
(Resend merged into any existing sender — two records fail SPF outright), and a published
DMARC policy.

Auth-mail SMTP is *not* configured by this repo outside local dev. Set it in the Supabase
Dashboard per hosted project.

---

## 9. File map

```
apps/api/src/
├── api/
│   ├── services/avenia/
│   │   ├── verification-notifications.ts  terminal-state mapping, shared enqueue
│   │   ├── webhook-signature.ts           RSA-PSS verify + cached Avenia public key
│   │   └── webhook-signature.test.ts
│   ├── services/alfredpay/
│   │   ├── verification-notifications.ts  terminal-state mapping, enqueue (submissionId key)
│   │   └── alfredpay-customer.service.ts  refreshAlfredpayCustomerStatus — the only producer
│   ├── services/email/
│   │   ├── index.ts                    barrel
│   │   ├── notification.service.ts     enqueue, claim, deliver, retry, stale-release
│   │   ├── dispatch.test.ts            preference gate, idempotency key, crash-loop cap
│   │   ├── ramp-completion.ts          ramp-completion producer (payload from quote)
│   │   ├── resend.transport.ts         the only HTTP call to Resend
│   │   ├── types.ts                    locales + payload shapes
│   │   └── templates/
│   │       ├── index.ts                type → template dispatch
│   │       ├── layout.ts               shared HTML shell
│   │       ├── ramp-completed.ts
│   │       └── verification-status.ts  approved / rejected / expired
│   ├── workers/
│   │   ├── notification-dispatch.worker.ts   cron 1m — the only sender
│   │   ├── kyb-status.worker.ts              cron 1h — reconciliation behind the webhook
│   │   └── alfredpay-status.worker.ts        cron 1h — Alfredpay's only background watcher
│   ├── routes/v1/avenia-webhook.route.ts     POST /v1/webhooks/avenia
│   ├── controllers/avenia-webhook.controller.ts  primary KYC + KYB producer
│   ├── services/phases/phase-processor.ts    fires the ramp-completion producer
│   └── controllers/brla.controller.ts        persists attemptId → TaxId.kycAttempt
├── models/emailNotification.model.ts
├── database/migrations/055-create-email-notifications-table.ts
├── config/express.ts                         raw-body mount, ahead of the JSON parser
├── config/vars.ts                            config.integrations.{resend,avenia}
├── scripts/preview-emails.ts                 bun preview:emails
└── scripts/register-avenia-webhook.ts        bun register:avenia-webhook
```

## 10. Open follow-ups

- **Confirm whether Avenia delivers KYB events at all.** Their docs list no KYB
  subscription; we subscribe with `*` and infer company attempts will arrive because both
  kinds share `/v2/kyc/attempts`. Run one company attempt to a terminal state in sandbox and
  check for the `Avenia COMPANY verification webhook` log line. If it appears, delete
  `KybStatusWorker` — the reconciliation poll exists only to cover this unknown. If it does
  not, the poll is load-bearing and must stay.
- **Spanish copy.** Alfredpay verification mail now ships, but `SUPPORTED_LOCALES` has no
  `es-*`, so MX/CO/AR users are silently served `en-US`. Adding `es-419` means translating
  the three verification templates plus `ramp_completed` and mapping those countries onto
  it. See [`docs/features/alfredpay-kyc-notification-gap.md`](../features/alfredpay-kyc-notification-gap.md).
- Decide whether to backfill `TaxId.kycAttempt` for in-flight KYB attempts (§3). The
  attemptId is only persisted from `initiateKybLevel1` onward, so COMPANY `tax_ids` rows
  created before that change have a null `kyc_attempt`, are filtered out by the worker, and
  will never be emailed.
- No `Hi <Name>,` greeting. [#1144](https://github.com/pendulum-chain/vortex/issues/1144)
  asks for one, but the `User` model holds only `id` and `email` — there is no name to
  interpolate. Sourcing it (Supabase `user_metadata`, or the KYC/KYB submission data) is a
  separate change.
- Avenia's `resultMessage` is surfaced verbatim as the `Reason` row, so a pt-BR reader can
  receive untranslated vendor copy (§6).
