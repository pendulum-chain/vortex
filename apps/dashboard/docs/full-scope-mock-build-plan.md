# Vortex Dashboard — Full-Scope Mock Build Plan

Plan to bring the mocked dashboard app in line with the full product brief
(sender onboarding → recipient KYC/KYB invite → wallet-to-fiat payout).

This app is a **standalone, fully-mocked** React app (no API). All flows are
simulated client-side via Zustand stores + XState machines + timers.

Stack: React 19, TanStack Router, XState 5, Zustand (persist), shadcn/ui,
Tailwind v4, react-hook-form + zod, sonner.

---

## Workstream 1 — Domain & data model

`src/domain/`

1. **Routing method.** Add `OnboardingRoute = "headless" | "google_form" | "redirect"`.
   Add `routeFor(corridorId, kind)` helper implementing the §2 matrix:
   - `US` → `redirect`
   - `EU` + `kyb` → `google_form`
   - else → `headless`
2. **Make all 6 corridors onboardable.** Drop the `coming_soon` gate for
   onboarding (or repurpose it). Remove the `supportsKyb`-only-for-BR gate;
   `kind = accountType === "company" ? "kyb" : "kyc"` for every country.
3. **Recipient model (see Decision Q1).** Target shape per brief:
   `{ id, accountId, email, recipientType: AccountType, corridorId,
      amount, payoutCurrency, bankDetails: { method, value... }, status,
      createdAt }`.
4. **Recipient status model.** Expand `RecipientStatus` to
   `"invite_sent" | "pending" | "approved" | "rejected"`.
5. **Transaction model.** Rework to payout-centric per §8:
   `{ id, accountId, recipientId, payinWallet, payinNetwork, amountIn,
      amountInToken, fiatPayoutAmount, payoutCurrency, corridorId,
      status, createdAt }`.
   Add `TransactionStatus = "awaiting_payin" | "processing" | "completed" | "failed"`.
6. Update `STATUS_META` / `TX_STATUS_META` for the new statuses.

## Workstream 2 — Sender onboarding (account type + routing)

`routes/_app/overview.tsx` → rename to **Onboarding**; `components/onboarding/`

1. **Account type selection.** On first login (empty account) prompt
   Individual vs Company before/with country selection. Persist on
   `SenderAccount.type`. Allow change while no onboardings exist.
2. **Generic headless machines.** Replace the 3 bespoke machines with **2
   config-driven machines** (`headlessKyc`, `headlessKyb`) parameterized by a
   per-country step config map (`onboardingSteps[corridorId][kind]`). Covers
   BR/EU/CO/MX/AR KYC and BR/CO/MX/AR KYB.
3. **Google Form route** (EU company KYB). `OnboardingWizard` branches on
   `routeFor`: render a card with an "Open Google Form" external link +
   "I've submitted the form" → status `pending` → (timer) `approved`.
4. **Redirect route** (USA). Render a "You'll be redirected to our partner"
   screen → button simulates redirect (mock partner screen / new tab) →
   returns `pending` → (timer) `approved`.
5. `CorridorCard` actions already cover not_started/pending/in_review/approved/
   rejected — keep; wire the three route branches into the action handler.
6. `AddCorridorDropdown` — list all 6, no "Soon" gating.

## Workstream 3 — Recipients

`routes/_app/recipients.tsx`; `components/recipients/`

1. **Rich invite form** (Decision Q1) — fields: email, recipient type
   (individual/company), country, amount, payout currency (derived from
   country, editable if needed), bank payout details (method-specific input:
   PIX key / IBAN / CLABE / ACH routing+account, driven by
   `corridor.recipientMethod`).
2. **4-status model + actions** per §6:
   - `invite_sent` → Resend invite · View
   - `pending` → View (transfer blocked)
   - `approved` → Create transfer
   - `rejected` → Retry · View (transfer blocked)
3. **Recipient onboarding simulation** (Decision Q2) — route the invited
   recipient through widget/Google-Form/redirect per the same matrix, ending
   in pending → approved/rejected.
4. `RecipientsTable` — columns: Recipient (email), Type, Country, Amount,
   Payout currency, Status, Added. Compliance status only (no payment status).

## Workstream 4 — New transfer (Privy payin)

`routes/_app/transfer.tsx`; `components/transfer/TransferForm.tsx`

1. **Recipient-driven.** Select an **approved** recipient (only approved are
   selectable — blocking rule §7; others shown disabled with reason).
2. Show read-only **amount + bank payout details** captured at recipient
   creation (no amount input here).
3. **Privy wallet payin mock.** "Create / use Vortex wallet" → show a
   generated deposit **address** + network + payin instructions (static mock
   address; no real Privy).
4. "I've sent the payin" → create transaction `awaiting_payin` →
   (timer) `processing` → `completed`; navigate to Transactions.

## Workstream 5 — Transactions

`routes/_app/transactions.tsx`; `components/transactions/TransactionsTable.tsx`

1. Drop the onramp/offramp tabs (brief transactions are payout-centric).
2. Columns per §8: Created at · Recipient · Payin wallet (shortened addr) ·
   Amount in · Fiat payout amount · Country/currency · Status.
3. Status badges: Awaiting payin · Processing · Completed · Failed.

## Workstream 6 — Settings & nav

1. Sidebar/nav: label first tab **Onboarding**.
2. Settings — keep read-only profile + accounts; add basic notification
   toggle stub if cheap (per §3 "notifications, basic workspace settings").

## Workstream 7 — Seed data refresh

`src/domain/seed.ts`

- Refresh seed accounts to include an Individual example and multi-country
  onboarding (EU + BR + MX) in mixed statuses.
- Seed recipients with the rich shape across statuses (invite_sent/pending/
  approved/rejected).
- Seed transactions with the new payout-centric shape across all 4 statuses.
- Bump `dashboard.store` persist version (→ v4) so the new shapes migrate.

---

## Decisions (locked)

- **Q1 — Recipient form richness → RICH FORM (follow brief).** Sender captures
  email, recipient type, country, amount, payout currency, and method-specific
  bank details. Reverts the Jun-24 email-only simplification.
- **Q2 — Recipient-side onboarding mock → TIMER AUTO-ADVANCE.** No recipient-
  facing screens; status advances on a timer
  (`invite_sent → pending → approved`), matching the existing pattern. No
  `/invite` route built.
- **Q3 — Country scope → ALL 6 (BR, EU, CO, MX, AR, US).** Full §2 matrix:
  headless for BR/EU/CO/MX/AR KYC + BR/CO/MX/AR KYB, Google Form for EU company
  KYB, redirect for US. `coming_soon` no longer gates onboarding.

## Suggested build order

1. WS1 domain types + seed scaffolding (unblocks everything).
2. WS2 onboarding (account type + routing matrix + generic machines).
3. WS3 recipients (rich form + statuses + sim).
4. WS4 transfer (Privy payin).
5. WS5 transactions.
6. WS6 nav/settings polish.
7. Lint, typecheck, visual pass per `figma-design-system.md`.
