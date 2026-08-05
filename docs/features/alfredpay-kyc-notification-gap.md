# Follow-up: Spanish copy for Alfredpay verification emails

Status: open follow-up, narrowed. The original gap — Alfredpay verification outcomes never
producing any email — is closed. What remains is that the mail goes out in English.

## What shipped

Alfredpay verification mail now has a producer. `refreshAlfredpayCustomerStatus()` in
`apps/api/src/api/services/alfredpay/alfredpay-customer.service.ts` enqueues on a terminal
outcome, and `AlfredpayStatusWorker` (`apps/api/src/api/workers/alfredpay-status.worker.ts`,
hourly) drives that function for accounts nobody is watching. Rows are keyed
`(alfredpay, verification_*, submissionId)`. Both KYC and KYB are covered.

Details of the design — why the enqueue sits in the shared refresh rather than in the
worker, why it is ordered before the status write, and why `verification_expired` never
fires for this provider — are in
[`docs/architecture/email-notifications.md`](../architecture/email-notifications.md) §3.

## What is left

**Alfredpay's users are MX, CO, AR and US. `SUPPORTED_LOCALES` in
`apps/api/src/api/services/email/types.ts` is still `["en-US", "pt-BR"]`.** `toEmailLocale`
falls back silently, so a Mexican or Colombian user receives English mail about their
verification.

This was deliberately deferred: it is translation work, not plumbing, and holding the
producer back for it would have left the larger gap — no mail at all — open.

To close it:

1. Add `es-419` to `SUPPORTED_LOCALES`.
2. Translate the four templates — `verification-status.ts` (approved / rejected / expired)
   and `ramp-completed.ts`. Both the `individual` and `business` copy variants need it.
3. Decide how a user's locale resolves onto it. `SupabaseAuthService.getUserLocale` supplies
   the locale at enqueue time; whether MX/CO/AR should map to `es-419` by country when the
   profile carries no locale is the open question.

Note that Alfredpay's `metadata.failureReason` is surfaced verbatim as the `Reason` row, so
an `es-419` reader can still receive untranslated vendor copy — the same caveat that already
applies to Avenia's `resultMessage` for `pt-BR`.
