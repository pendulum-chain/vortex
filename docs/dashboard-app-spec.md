# Dashboard app — product spec

`apps/dashboard` — the authenticated, account-based surface for Vortex.

## Purpose

Absorb everything the widget (`apps/frontend`) does today — on/offramp quoting, wallet
signing, KYC/KYB, ramp tracking — behind an email-authenticated account, and add two
capabilities the widget cannot express:

1. **Cross-border payments** — a sender pays **fiat in** and a *third-party* recipient
   receives **fiat out**, in another country. Onramp chained to offramp; the stablecoin leg
   is an implementation detail the sender never sees, and the sender needs no wallet at all.
   This is the dashboard's core feature. `#review`
2. **Invitation handling** — a sender invites a recipient by link; the recipient onboards
   under their own identity, in the widget, and becomes payable. `#review`

The widget stays as the embeddable, wallet-first product: one ramp, one leg, your own money to
your own destination — plus, now, invite redemption and recipient KYC. The dashboard is the
account-first payments product:
persistent identity, saved recipients, history, notifications — and money that moves between
two people.


## User stories

### Account & auth
- As a user, I sign in with my email via a 6-digit OTP; no wallet is needed to reach my account.
- As a user, my account has a type (individual or company) and an identifier (CPF/CNPJ), and I
  see it on Settings.
- As a user, I connect an EVM wallet only for wallet-funded transfers; the core fiat→fiat payment
  never asks for one.

### Onboarding (KYC/KYB)
- As a sender, I pick the corridors I care about (BR, EU, MX, CO, US, AR) and track only those.
- As a sender, I complete KYC (individual) or KYB (company) per corridor **inside the dashboard**,
  not by being bounced to another origin.
- As a sender, I see each corridor's real status — `not_started · pending · in_review · approved ·
  rejected` — read from the provider, surviving reload.
- As a Brazilian individual, my flow includes a liveness selfie; as an EU company, my KYB is
  collected out-of-band and confirmed in-dashboard; as a US applicant, I am redirected to the
  partner and return to confirm.
- As a sender, everything downstream (recipients, transfers) stays locked until at least one
  corridor is approved.

### Recipients & invitations `#review`
- As a sender, I invite a recipient for an approved corridor by generating a shareable link; I
  choose their country, rail, payout currency, and intended amount. Email is optional metadata —
  the **link token** is what redeems.
- As a sender, I copy the invite link and deliver it myself.
- As a recipient, I open the link and land **in the widget**, pinned to my corridor. I sign in with
  an emailed code — which creates my account — the invite is accepted, and I run the same KYC/KYB
  the widget already offers.
- As a recipient, I register a payout account (PIX key / IBAN / CLABE / ACH) — the sender never sees
  or holds my bank details.
- As a sender, I see each recipient's relationship status (`invited · active · blocked · archived`)
  and onboarding status, and I can nickname, block, or archive them.
- As a sender, a recipient becomes payable only when: invite accepted, relationship active,
  their onboarding approved for that corridor, and a payout reference is verified. Otherwise I see
  *why* it is blocked.
- As a recipient, I can be linked to many senders; I onboard once.

### Transfers

**Paying a third party.** The core feature. `#review`
- As a sender, I select an approved recipient, enter the payout amount in their currency, and see
  the rate and fees before committing.
- As a sender, I choose how to fund it: **crypto** from my connected wallet, or **fiat** from my
  bank account. Everything downstream is the same to me.
- As a sender, I watch the payment progress live and land on a clear success or failure state.
- As a recipient, the money arrives in my bank account on my corridor's rail.

**Paying myself.** Widget parity.
- As a user, I send crypto from my wallet and receive fiat in my own bank account (implemented).
- As a user, I pay fiat from my bank account and receive crypto at my own wallet (`#review` — not
  implemented; the dashboard quotes SELL only).

### Transactions
- As a sender, I see my transfer history — recipient, corridor, amounts in and out, status
  (`awaiting_payin · processing · completed · failed`), and the reason a payout failed.

### Notifications & settings
- As a user, I get in-app and email alerts when a corridor's KYC/KYB resolves, when an invited
  recipient completes onboarding, and when a payout settles or fails.
- As a user, I toggle each of those three notification categories.

## High-level implementation strategy

The dashboard is the same stack as the widget, and reuses its logic wherever the logic is
provider-shaped rather than UI-shaped.

- **Same stack as `apps/frontend`.** React 19 + Vite, TanStack Router (file routes) + TanStack
  Query, Zustand for client state, React Hook Form + Zod, Tailwind, wagmi/AppKit for EVM wallets.

- **XState v5 for every multi-step flow**, `setup().createMachine()`, machines under
  `src/machines/`. Three flows are machines: onboarding (headless / external), the provider KYC
  bindings, and the transfer.

- **Reuse the KYC machines, don't re-implement them.** `@vortexfi/kyc` already holds the Avenia
  and AlfredPay provider machines, shared by widget and dashboard; each app binds them to its own
  API services and its own "open the provider page" side effect. Mykobo still lives in the widget
  and needs the same extraction. The provider endpoints already exist — **no new onboarding
  backend**.

- **Reuse the ramp core.** `transfer.machine.ts` is the widget's ramp machine reduced to the
  dashboard's flow: register → presign ephemeral → user wallet signature → start → poll to
  terminal. Signing helpers come from `@vortexfi/shared`; route-level code splitting keeps the
  blockchain graph off the non-transfer pages. The fiat-funded shapes drop the signature step
  entirely, so the machine needs a payin-wait state, not a wallet.

- **Crypto-funded reuses the ramp; fiat-funded does not exist yet.** `RampDirection` is
  `BUY | SELL` — one fiat side, one crypto side. A fiat-funded payment has two fiat sides, so it is
  an onramp chained to an offramp, not a ramp. Open: one backend object or two chained ramps, who
  holds the stablecoin in between, how a single price is quoted across both legs, and how the
  second leg is unwound if it fails after the first settled. `#review`

- **Cross-border needs a second principal in ramp registration.** Registration today is
  structurally a self-ramp — payout destinations are sender-bound. A sender→recipient transfer
  must carry the relationship id, have the server verify ownership and eligibility, and resolve
  the payout side from the *recipient's* provider identity. BRL is the cheapest first corridor
  (it already accepts a third-party PIX destination). `#review`

- **Invitations are link-based.** The invite link carries a bearer token — 24 random bytes, stored
  server-side only as a hash, shown once at creation. It is not the invitation id, and it does not
  authenticate: `POST /v1/recipients/invite/:token/accept` requires *both* a session and the token.

- **Redemption and recipient KYC happen in the widget. `#decided`** The invite link opens the widget
  pinned to the invite's corridor (`?kybLocked=<country>`), carrying the token. The widget already
  has OTP login and the shipped KYC/KYB flows; it gains one new step — after login, redeem the token
  against the accept endpoint, then proceed into the existing KYB flow. The dashboard needs no
  `/invite` route.
  - **Accepted cost:** widget and dashboard sessions are namespaced apart on purpose
    (`vortex_access_token` vs `vortex_dashboard_access_token`), so a recipient who later uses the
    dashboard signs in a second time. Fine for this iteration.
  - **Order is fixed:** authenticate → accept → KYC. The recipient needs a `customer_entity` before
    any provider record can attach to it.
  - **EU recipients remain unreachable** — the widget's `KYB_REGIONS` excludes EU, because Mykobo is
    individual-KYC-only and needs a connected wallet. Unchanged by this decision. `#review`

- **The recipient's payout instrument** is created provider-side and stored as a masked pointer,
  never as raw bank PII. Where it is captured follows from the above — the widget. `#review`

- **Backend is the same API.** Shared `/v1/quotes`, `/v1/ramp/*`, `/v1/auth/*`,
  `/v1/onboarding/status`, plus dashboard-only `/v1/recipients/*` and `/v1/notifications`.

---

*Schema detail: `docs/architecture/unified-user-management-schema.md`,
`docs/architecture/recipient-transfers-schema.md`. Migration phasing and open decisions:
`docs/plans/dashboard-full-product-connection.md` (deprecated) and
`docs/plans/dashboard-followup-plan.md`.*
