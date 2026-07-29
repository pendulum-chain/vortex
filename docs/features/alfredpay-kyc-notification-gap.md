# Follow-up: Alfredpay KYC verification emails are never sent

Status: open follow-up. Created alongside the email-notifications work, deliberately
left out of that change to keep its scope to Avenia/Brazil.

## The gap

The `email_notifications` table accepts `provider = 'alfredpay'` — `NotificationProvider.Alfredpay`
exists in `apps/api/src/models/emailNotification.model.ts` and the `provider` column is a plain
`VARCHAR(32)` specifically so a new provider needs no `ALTER TYPE`. Nothing ever writes it.

Concretely:

- `KybStatusWorker` (`apps/api/src/api/workers/kyb-status.worker.ts`) only selects
  `TaxId` rows with `accountType = COMPANY`, which is the Avenia/BRL path. It enqueues
  `verification_approved` / `verification_rejected` / `verification_expired` with
  `provider = 'avenia'`.
- There is no equivalent poller or webhook consumer for Alfredpay.

So an MXN or COP user whose verification is approved, rejected, or expires is never
emailed. This is the same gap Brazil had before the KYB worker existed.

## Why it is not just "add another provider to the existing worker"

The Avenia worker polls one attempt per subaccount, using the `attemptId` persisted to
`TaxId.kycAttempt` at `initiateKybLevel1`. Alfredpay's verification state does not live in
`TaxId` at all — it is in `alfredpay_customers` — so the change is a separate poller (or a
webhook handler if Alfredpay exposes verification events), not a new branch in the current one.

## What already works once something enqueues

Nothing downstream needs changing:

- `renderNotification` dispatches purely on `notification.type`, not on provider, so the
  three verification templates already render for Alfredpay rows.
- The templates are localised for `en-US` and `pt-BR`. **MXN/COP users will need `es-*`
  copy** — `SUPPORTED_LOCALES` in `apps/api/src/api/services/email/types.ts` currently has
  only the two, and `toEmailLocale` silently falls back to `en-US`. This is the one real
  piece of work beyond the poller.
- Dedupe, retry/backoff, the recipient allowlist, and the `sending` row claim are all
  provider-agnostic.

## Suggested shape

1. Decide webhook vs. poll by checking whether Alfredpay emits verification events.
2. Add `es-419` (or `es-MX` / `es-CO`) to `SUPPORTED_LOCALES` and translate the three
   verification templates plus `ramp_completed`.
3. Enqueue with `provider: NotificationProvider.Alfredpay` and `resourceId` set to whatever
   Alfredpay's stable per-verification identifier is — the unique index is
   `(provider, type, resource_id)`, so that id is what makes re-notification impossible.
