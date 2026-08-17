# ADR 0004: Sandbox Sales-Demo Account

Status: accepted 2026-08-07. Implemented in `apps/api/src/api/services/demo/`; the runbook
is [`operations-demo-environment.md`](operations-demo-environment.md).

## Context

Sales needed to demonstrate a working payin and payout on `apps/dashboard` to a prospect,
with onboarded corridors, several recipients, and a transaction history containing both
completed and pending rows.

No account could show that. Every dashboard view derives from live API calls with no seed
path (`useActiveAccount` → `/v1/onboarding/status`, `useRecipients` → Alfredpay fiat
accounts + `/v1/recipients`, `useTransactions` → `/ramp/history`), and standing up a real
account means completing real provider KYB in every corridor first.

Four things were conflated in the original request and are kept distinct here:

| Term | Meaning |
|---|---|
| **Sandbox** | The existing deployment environment. Already ships testnet networks, relaxed chain-id validation, provider sandbox URLs, and 10-second ramp completion. Not new. |
| **Demo account** | One seeded profile inside sandbox, with a business customer entity. |
| **Demo restore** | The idempotent routine that returns that account to a known state. |
| **Demo provider** | A sandbox-only stand-in for Alfredpay on the reset corridor. |

The request's "mocked KYC" was a misnomer: sandbox KYC already always succeeds — but
because Avenia's and Alfredpay's *own* sandboxes approve, not because Vortex has an
auto-approval branch. What was missing was **repeatability without a live dependency**,
not success.

Three findings shaped the design:

- **Payout was blocked outright.** `apps/dashboard`'s `ALCHEMY_NETWORK` map had no entry
  for Polygon Amoy and threw at the funding gate, so no sandbox SELL could start.
- **Seeded pending transactions decay into failures.** `RampRecoveryWorker` drives any
  stale non-terminal ramp through the phase processor, which fails it when no chain state
  backs it. Its query skips ramps with no presigned transactions — the only available
  escape hatch.
- **Recipients look payable and are not.** Nothing creates `RecipientPayoutReference` rows
  in normal operation, and the transfer tab still renders "Fiat-to-Fiat transfers are
  coming soon". Seeding cannot close that gap; the runbook routes the demo around it.

## Decision

1. **Demo state lives in the sandbox database, seeded by a script** — not frontend
   fixtures, not canned responses in the production API path. The demo has to do real
   transaction signing against the real backend; fixtures cannot, and a reload would make
   UI and API visibly disagree.
2. **One corridor is real, the rest is seeded.** Bounded setup cost, and the pitch still
   proves the product works end to end.
3. **BR (Avenia) is the real corridor.** It supports both BUY and SELL, and its payout
   destination is a PIX key entered at ramp time (`fallbackSelfRecipient`), so no payout
   account setup is needed.
4. **CO (Alfredpay) is the reset corridor.** Its KYB is entirely in-dashboard — no
   liveness step, no hosted redirect, so the demo never leaves the tab. BR, EU, and US all
   redirect out; AR has no company KYB at all.
5. **The demo account is a company.** Vortex sells B2B and the dashboard's copy is
   KYB-first. `profiles.active_customer_entity_id` is immutable (`ACTIVE_ENTITY_IMMUTABLE`),
   so an individual story would need a second account.
6. **The reset corridor is served by a demo provider adapter, not real Alfredpay calls.**
   A live provider 5xx mid-pitch has no fallback. The adapter fakes API responses only —
   the dashboard UI is unchanged. It is behind `DEMO_PROVIDER_ENABLED`, **off by default**,
   because a sandbox also serves partner integration testing, which needs the real
   provider.
7. **Restore runs on login, not from a visible button.** Zero-click during a call; a
   "Reset demo" control in front of a prospect breaks the illusion. The CLI script and the
   login hook call the same routine.
8. **Seeded recipients are third-party rows, for display only.** With BR the only approved
   corridor at rest, self-recipients are capped at one. Mixed statuses — approved, pending
   review, invite created — because a wall of identical "Approved" rows reads as fake.
9. **Seeded pending transactions carry `presigned_txs = NULL`.** The only way to keep them
   pending; see the finding above.
10. **Restore is idempotent, deterministic-UUID keyed, and hard-guarded on
    `DEPLOYMENT_ENV=sandbox`.** Every row it writes carries a fixed demo UUID prefix, so it
    can be re-run at will and can never touch a real ramp, recipient, or corridor created
    during a demo — including the real BR provider rows.

### Rejected

- **A frontend demo mode** — contradicts decision 1; two sources of truth that disagree
  after a reload.
- **Demo-shaped responses in the production API path** — puts demo lies inside audited code.
- **An ephemeral, never-persisted reset corridor** — the corridor would never *stay*
  approved, so "onboarding unlocks transfers" could not be shown across a reload.
- **Faking Alfredpay for all sandbox users** — would break the sandbox KYC flows the public
  docs promise partners. Hence the explicit, default-off flag in decision 6.

## Consequences

- The demo depends on a hand-created Avenia sandbox company KYB for BR. **This was not
  validated before implementation.** If Avenia's sandbox will not approve a company end to
  end, decision 3 fails and the real corridor becomes MX — the rest of the design is
  unaffected.
- The demo provider mints approved KYB status, and the login hook touches the auth path.
  Both are sandbox-guarded and covered by explicit invariants in
  `security-spec/05-integrations/alfredpay.md` and `security-spec/01-auth/supabase-otp.md`.
- Sign-in remains real email OTP against a mailbox the sales team can reach. No OTP bypass
  was added; adding one would be an auth-path change needing its own decision.
- A second demo account would be required for an individual (non-company) story.
- The moment a second corridor is seeded *approved* without a real provider customer behind
  it, transfers will need fencing to real corridors. Not a question while BR is the only
  approved corridor at rest.
