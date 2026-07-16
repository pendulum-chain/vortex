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

**Iteration 1 scope.** The first iteration ships the unified schema (customer entities,
provider customers, KYC cases, recipients, notifications) and sender/recipient KYC/KYB
onboarding. On/offramping from the dashboard and cross-border transfers — including recipient
payability and payout-instrument registration — are explicitly out of scope for this iteration;
the sections below that describe them are target-state, not current behavior.


## User stories

### Account & auth
- As a user, I sign in with my email via a 6-digit OTP; no wallet is needed to reach my account.
- As a user, my account has a type (individual or company) and an identifier (CPF/CNPJ), and I
  see it on Settings.
- As a user, I connect an EVM wallet only for wallet-funded transfers; the core fiat→fiat payment
  never asks for one.

### Onboarding (KYC/KYB)
- As a sender, I pick the corridors I care about (BR, EU, MX, CO, US, AR) and track only those.
- As a sender, I complete KYC (individual) or KYB (company) per corridor from the dashboard.
  Monerium uses its hosted OAuth portal; after the callback exchange, the dashboard reopens the EU onboarding modal.
- BR companies complete Avenia's hosted company and representative steps; MX/CO companies submit
  AlfredPay KYB details and documents in the dashboard; US companies use AlfredPay's hosted flow.
  AlfredPay company onboarding is not offered for AR until provider support is confirmed.
- As a BR company whose KYB is pending (Avenia profile already created — CNPJ and company name
  supplied), Continue resumes directly at the hosted verification steps instead of re-asking the
  form: the status payload exposes the business `taxReference`, and the wizard skips form filling,
  reusing the existing Avenia subaccount and issuing fresh verification links.
- As a sender, opening Monerium onboarding immediately marks the EU corridor started; it moves to
  in review only after Monerium reports that all required information was submitted.
- As a sender whose Monerium onboarding is in review, I see a **Re-authenticate with Monerium**
  action only when the backend returns `MONERIUM_REAUTHENTICATION_REQUIRED` while loading the corridor.
- **To be confirmed:** the current assumption is that Vortex cannot retrieve a user's Monerium
  status unless the user has authenticated and Vortex holds app-specific Monerium authorization.
  Under that assumption, missing authorization produces a `404` and the custom error above.
  Note this assumption is already load-bearing: the user-visible **Re-authenticate with
  Monerium** affordance is built on it, so confirming (or refuting) it with Monerium changes
  shipped behavior, not just documentation.
- As a sender, I see each corridor's real status — `not_started · started · pending · in_review ·
  approved/rejected` — read from the provider, surviving reload. `pending` is only used for
  missing or stale provider data when applicable.
- As a Brazilian individual, my flow includes a liveness selfie; EU individuals and companies use
  Monerium's hosted OAuth KYC/KYB.
- Corridor/kind combinations without an implemented provider flow — US individual onboarding
  (the partner redirect is not wired) and AR company KYB (provider support unconfirmed) — are
  shown as **not yet available** and cannot be started. They are disabled rather than simulated:
  a mocked approval would be contradicted by the backend at transfer registration.
- As a sender, everything downstream (recipients, transfers) stays locked until at least one
  corridor is approved.

### Recipients & invitations `#review`
- As a sender, once **any** corridor of mine is approved I invite a recipient for **any live
  corridor** by generating a shareable link; I choose their country, rail, and payout currency,
  and type an **alias** — a sender-local label that identifies the link (and later the recipient)
  in my list. Email is optional metadata — the **link token** is what redeems. The one exception
  is combinations the corridor's provider cannot onboard: the dialog hides Argentina for
  **company** recipients (Alfredpay has no AR KYB), per the shared corridor-capability matrix
  (`@vortexfi/shared` `CORRIDOR_CAPABILITIES`). The API enforces the same rules server-side —
  unknown corridors, unsupported corridor × recipient-type combinations, and senders without any
  approved corridor are rejected — and the widget's region selector applies the matrix once the
  invite's recipient type is known.
- As a sender, I copy the invite link and deliver it myself.
- As a sender, I click a row in my recipients list to open a management modal. While the invite
  is not yet accepted, I can **re-copy the link** from there; once accepted (or when the link is
  a legacy invite created before tokens were retained), re-copy is no longer offered.
- As a sender, an invite whose 14-day TTL passed stays in my list as **Expired** (its token is
  cleared server-side, so re-copy is no longer offered) until I remove it — it never silently
  vanishes.
- As a sender, I **remove** an entry (pending invite, expired invite, or established
  relationship) from my list via the same modal. Removal is an archive, not a revocation: the link keeps working, the
  recipient can still sign in and complete KYC — only the entry disappears from my list (and,
  for an accepted invite, the sender↔recipient relationship is archived).
- As a recipient, I open the link and land **in the widget**, pinned to my corridor. I sign in with
  an emailed code — which creates my account — the invite is accepted, and I run the same KYC/KYB
  the widget already offers.
- As a recipient, I register a payout account (PIX key / IBAN / CLABE / ACH) — the sender never sees
  or holds my bank details.
- As a sender, I see each recipient's relationship status (`invited · active · blocked · archived`)
  and onboarding status, and I can nickname, block, or archive them. Archived entries — both
  archived relationships and archived pending invitations — are hidden from my list.
- The list's status wording is deliberate: a not-yet-accepted invite reads **"Invite created"**
  (never "sent" — the system sends nothing; the sender delivers the link), and review states are
  provider-neutral (**"Pending review"**, no provider names in the recipients list).
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

- **Reuse the KYC machines, don't re-implement them.** `@vortexfi/kyc` holds the Avenia,
  AlfredPay, and Monerium provider machines. Each app binds them to its API client and browser
  side effects. Monerium OAuth state, PKCE, code exchange, and tokens stay in the backend; the
  shared machine receives only an authorization URL and normalized profile status.

- **Reuse the ramp core.** `transfer.machine.ts` is the widget's ramp machine reduced to the
  dashboard's flow: register → presign ephemeral → user wallet signature → start → poll to
  terminal. Signing helpers come from `@vortexfi/shared`. `RampService` is loaded via a dynamic
  import inside the transfer machine, but there is no route-level code splitting yet — the
  Polkadot/EVM graph is statically reachable from the entry chunk, so non-transfer pages do not
  currently avoid it. The fiat-funded shapes drop the signature step entirely, so the machine
  needs a payin-wait state, not a wallet.

- **Only one ramp may be active per user.** Registration takes a database row lock on the user and
  rejects a second nonterminal ramp, including requests from another tab, client, or API instance.
  Unstarted ramps stop blocking after the existing 15-minute start window — but only ramps still
  in `initial` are released that way. A ramp wedged in a mid-flow phase (it may hold user funds)
  blocks new registrations indefinitely; there is no self-service recovery, only operational
  intervention that moves it to a terminal phase. The dashboard stores each ramp's EVM and
  Substrate ephemeral secrets locally before registration (under a dashboard-namespaced
  localStorage key, so the widget's own ephemeral-store pruning cannot evict them) and retains
  earlier ramp entries independently of disposable transfer-machine state.

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

- **Invitations are link-based.** The invite link carries a bearer token — 24 random bytes. The
  sha256 hash remains the redemption key, but the raw token is also retained on the invitation
  **while it is pending** (a deliberate product decision, so the sender can re-copy the link from
  the list) and is cleared on first acceptance. It is exposed only to the sender who owns the
  invitation, it is not the invitation id, and it does not authenticate:
  `POST /v1/recipients/invite/:token/accept` requires *both* a session and the token.

- **Redemption and recipient KYC happen in the widget. `#decided`** The invite link opens the widget
  carrying the token (`?invite=`) plus `?kybLocked=<country>`, which pre-pins the corridor when the
  widget recognizes the region. The token alone is sufficient: the widget enters the recipient flow
  for any link carrying `?invite=`, and after acceptance the invitation response — not the editable
  URL — is authoritative for both corridor and individual/business onboarding. The widget already
  has OTP login and the shipped KYC/KYB flows; it gains one new step — after login, redeem the token
  against the accept endpoint, then proceed into the existing KYB flow. The dashboard needs no
  `/invite` route.
  - **Accepted cost:** widget and dashboard sessions are namespaced apart on purpose
    (`vortex_access_token` vs `vortex_dashboard_access_token`), so a recipient who later uses the
    dashboard signs in a second time. Fine for this iteration.
  - **Order is fixed:** authenticate → accept → KYC. The recipient needs a `customer_entity` before
    any provider record can attach to it.
  - **EU recipient onboarding is currently contradictory.** The widget's EURC KYC child is Mykobo
    (individual-only, needs a connected wallet), while the recipient backend's `eur` rail requires
    a Monerium provider record (`providerForRail`) — and Monerium onboards in the dashboard, not
    the widget. EU is therefore excluded from the widget's KYB region list: an EU link's
    `?kybLocked=EU` is not recognized, and the corridor locks only from the acceptance response.
    The dashboard intentionally does not prevent creating EU invites — once any corridor is
    approved, all live corridors are selectable in the recipient dialog — so an EU invite can be
    issued but cannot produce a payable recipient until recipient EU onboarding is routed through
    Monerium (or the rail mapping changes). Known gap, tracked with the EUR corridor
    reconciliation.

- **The recipient's payout instrument** is created provider-side and stored as a masked pointer,
  never as raw bank PII. Where it is captured follows from the above — the widget. `#review`

- **Backend is the same API.** Shared `/v1/quotes`, `/v1/ramp/*`, `/v1/auth/*`,
  `/v1/onboarding/status`, plus dashboard-only `/v1/recipients/*` and `/v1/notifications`.
- **The sender entity is selected once.** Account-dependent dashboard routes require an active
  customer entity. `PUT /v1/onboarding/active-entity` persists the initial individual/company
  choice, and `GET /v1/onboarding/status` returns `activeEntityId` and `selectionRequired`. Legacy
  profiles with one meaningful entity are backfilled when it already owns provider or recipient
  data; empty legacy entities do not silently force an individual selection. Profiles with mixed
  entities must choose. The dashboard derives account type, onboarding status, and approval gates
  only from the exact active sender entity. Explicitly typed invitation onboarding may still use a
  second recipient entity without changing the active sender entity.

## Acknowledged gaps

- Only self-offramp is fully functional. Third-party recipient payments and fiat-funded
  fiat-to-fiat payments remain future work (out of scope for iteration 1).
- **No recipient can currently become payable.** The payable gate requires a *verified payout
  reference*, and nothing in the API creates `RecipientPayoutReference` rows — payout-instrument
  registration is not implemented. Invitations and recipient KYC work end-to-end, but capability
  #2 stops at "onboarded", not "payable". The product and provider contract must define how
  payout instruments are created for both senders creating links and recipients redeeming them,
  while keeping raw bank PII provider-side.
- The notification feed rendered in the dashboard shell and the three notification preference
  toggles on Settings are still client-mocked even though `/v1/notifications` exists; wiring them
  up is listed under next steps.

## Next steps

- Add self payout-account (AlfredPay fiat-account) management to the Onboarding corridor cards,
  per `docs/plans/dashboard-followup-plan.md` §2 (reworked 2026-07-15: Onboarding placement
  instead of Recipients/Transfer CTAs, ~90% blue progress bar for approved corridors without an
  account, offramp-only messaging, list + add without delete in v1). The backend
  `/v1/alfredpay/fiatAccounts` routes already exist.
- Display relationship status and authoritative transfer eligibility, including the reason a
  recipient is not payable, instead of deriving availability from onboarding status alone.
- Connect the dashboard notification feed and its three preference controls to the backend.
- Consider persisting intended corridor selection independently of provider entities. A small
  backend table could support adding/removing tracked corridors and explicit status management;
  provider-created entities remain the authoritative persisted onboarding state meanwhile.
- Add the remaining recipient management actions such as nickname, block, reactivate, and
  revoke (archive ships as the list-removal action; invitation amounts were dropped in favor of
  the sender-typed alias).

## Open questions

- Settings still needs a provider-safe display identifier for business entities; email remains the
  fallback until that display contract is defined.
- Entity selection is now explicit and immutable: the account-type selector persists
  `profiles.active_customer_entity_id` once (`ACTIVE_ENTITY_IMMUTABLE` on change attempts), a
  unique `(profile_id, type)` index precludes duplicate entities, and profiles without a
  selection fall back deterministically to their oldest entity in
  `getOrCreateCustomerEntityForProfile`. Whether users will ever be able to *switch* the active
  entity (individual ↔ company) remains open.

---

*Schema detail: `docs/architecture/unified-user-management-schema.md`,
`docs/architecture/recipient-transfers-schema.md`. Migration phasing and open decisions:
`docs/plans/dashboard-full-product-connection.md` (deprecated) and
`docs/plans/dashboard-followup-plan.md`.*
