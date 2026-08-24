# Demo environment — operations

How to stand up and run the seeded sales-demo account on the dashboard. Applies only to
the **sandbox** deployment (`DEPLOYMENT_ENV=sandbox`, `SANDBOX_ENABLED=true`); every entry
point described here refuses to run anywhere else. Decisions and rationale are in
[`adr-0004-sandbox-demo-environment.md`](adr-0004-sandbox-demo-environment.md).

## What the demo account shows

One profile — the login email in `DEMO_ACCOUNT_EMAIL`, defaulting to
`demo@satoshipay.io` — with a `business` customer entity.

**Onboarding** opens at 🇧🇷 **BR approved** (a real Avenia customer, created once by hand)
and 🇨🇴 **CO not started**. CO is onboarded live during the pitch and ends approved, so the
view finishes with two approved corridors.

**Recipients** — four seeded rows, display-only:

| Country | Status | Instrument |
|---|---|---|
| 🇧🇷 Padaria Aurora LTDA | Approved | PIX `••••4821` |
| 🇲🇽 Miguel Ortega Servicios | Approved | CLABE `••••7390` |
| 🇨🇴 Andrea Rojas | Pending review | — |
| 🇦🇷 Estudio Belgrano SRL | Invite created | — |

**Transactions** — four seeded rows, plus whatever the demo itself creates:

| Direction | Status | Amounts |
|---|---|---|
| BUY | completed | 5,000.00 BRL → 912.44 USDC |
| SELL | completed | 1,500.00 USDC → 8,194.35 BRL |
| BUY | processing | 2,400.00 BRL → 437.98 USDC |
| SELL | processing | 750.00 USDC → 4,097.18 BRL |

Every seeded date is relative to restore time, so the history never reads as stale.

## One-time setup

1. **Sign in once as the demo account.** `profiles.id` is the Supabase Auth UUID, so the
   seed cannot forge the profile — it has to exist first. Log into the sandbox dashboard
   with the demo email and complete the email OTP. Restore fails with an explicit message
   until this is done.
2. **Onboard BR for real.** Complete Avenia company KYB for the demo entity in the sandbox.
   This is the one corridor restore never touches, and it is what makes the transfers real.
3. **Set the sandbox API environment:**

   ```bash
   DEPLOYMENT_ENV=sandbox
   SANDBOX_ENABLED=true
   DEMO_ACCOUNT_EMAIL=demo@satoshipay.io     # optional; this is the default
   DEMO_PROVIDER_ENABLED=true                # canned Alfredpay KYB, see below
   ```

   `DEMO_PROVIDER_ENABLED=true` with any other `DEPLOYMENT_ENV` refuses to start.
4. **Fund the demo wallet** with testnet USDC on Polygon Amoy (or Base Sepolia) for the
   SELL demo. Payins need no funding.

## Restoring the demo state

Restore is idempotent and can be run as often as you like.

```bash
cd apps/api && bun seed:demo
```

It also runs **automatically after every demo-account login**, so in practice a fresh
browser session is all that is needed before a call. A restore failure never blocks the
login — it is logged and swallowed.

Each run:

- ensures the business customer entity exists and is the profile's active entity;
- **wipes the CO corridor** (`provider_customers` + `kyc_cases` for `alfredpay`/`CO`) so
  the onboarding wizard is walkable again;
- re-seeds the four recipients and four transactions, re-stamping their dates;
- **leaves BR alone**, along with every ramp, recipient, and corridor created during a
  demo — restore only writes rows whose ids carry the demo UUID prefix.

## Running the demo

- **Onboarding** — start CO. With `DEMO_PROVIDER_ENABLED=true`, the KYB form, questionnaire,
  and document upload accept anything, the submission sits in review for ~10 seconds, then
  approves. No hosted redirect, no liveness step: the demo never leaves the tab.
- **Payin (BUY)** — BRL → USDC on BR. Real quote, real signing, and the sandbox's
  10-second auto-completion carries it to `complete`.
- **Payout (SELL)** — USDC → BRL on BR. The PIX key is entered at ramp time, so no
  recipient setup is needed.
- **Avoid the transfer tab for the seeded recipients.** No recipient can currently be paid
  from the recipients list (see [`product-dashboard.md`](product-dashboard.md)); the tab
  still renders "Fiat-to-Fiat transfers are coming soon". Demo payouts run through the BUY/
  SELL flow above.

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `No profile for <email>. The demo account must sign in once via OTP first` | Step 1 of setup was skipped | Log in once with the demo email |
| `Demo restore is sandbox-only` | `DEPLOYMENT_ENV` is not `sandbox` | Point the script at the sandbox API's `.env` |
| `Active entity selection is immutable` | The profile signed up as an individual | Delete the profile in Supabase, sign in again, and choose **Company** |
| CO onboarding hits the real Alfredpay | `DEMO_PROVIDER_ENABLED` is unset | Set it to `true` and restart the API |
| The processing rows flipped to failed | Something wrote `presigned_txs` on them | Re-run `bun seed:demo` |
