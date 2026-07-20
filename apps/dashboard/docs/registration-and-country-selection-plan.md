# Plan — Registration + Country-of-Interest Selection (Vortex Dashboard)

> Status: **PLAN ONLY — not implemented.** Scope addition to the existing mocked
> `apps/dashboard`. This document is the spec to implement later.

## 1. Goal / User story

> As a new Vortex user, I want to **register for the service** and **choose which
> countries/corridors I'm interested in**. The dashboard then shows only those
> corridors for verification, and I can **add the remaining corridors later from a
> dropdown**.

This builds on the existing dashboard (fake login, account switcher with 2 seeded
accounts, Brazil/Europe corridor cards, XState KYB/KYC wizards, recipients gated by
approval, notifications).

## 2. Decisions locked during grilling

| Decision | Choice |
|---|---|
| Entry routes | Two dedicated routes: **`/register`** and **`/login`** (cross-linked). |
| What register produces | Creates a **new sender account**, added to the switcher and made active. The 2 seeded demo accounts **remain**. |
| Auth UX | **Mirror the Vortex Widget**: email + Terms checkbox → OTP (6-digit) → authenticated. Same for KYB/KYC (already mirrored). |
| Corridor catalog | **Brazil + Europe are the only working corridors.** Alfredpay corridors (Mexico, Colombia, USA, Argentina) appear as **"Coming soon"** (selectable for interest, locked in dashboard). |
| Country selection | Chosen during `/register`; dashboard shows only selected corridors; the rest are addable from an **"Add country" dropdown**. |
| State management | XState v5 for the auth flow (consistent with the widget and existing dashboard wizards); Zustand for stored data. |

## 3. What "mirror the Vortex Widget" means (reference)

Source flow in `apps/frontend` (the widget), to replicate **as a mock** (no real
Supabase / no real API — accept any email, any 6-digit code):

```
EnterEmail  [AuthEmailStep]   email + Terms & Conditions checkbox  → ENTER_EMAIL
  → CheckingEmail             (mock: always proceed)
    → RequestingOTP           (mock: pretend to send code)
      → EnterOTP [AuthOTPStep] 6-digit InputOTP, auto-submits on 6th digit → VERIFY_OTP
        → VerifyingOTP        (mock: any code accepted)
          → authenticated     (store mock token in localStorage)
```

Widget reference files (for UX parity only — do **not** import from the frontend app):
- `apps/frontend/src/components/widget-steps/AuthEmailStep/index.tsx` (email + T&C)
- `apps/frontend/src/components/widget-steps/AuthOTPStep/index.tsx` (6-digit `InputOTP`, auto-submit, "we sent a code to <email>")
- `apps/frontend/src/components/widget-steps/RegionSelectStep/index.tsx` (region `DropdownSelector`)
- `apps/frontend/src/machines/ramp.machine.ts` (auth states embedded), `src/machines/actors/auth.actor.ts`
- Provider routing: `src/machines/kyc.states.ts` (BRL→Avenia, EURC→Mykobo, ARS/USD/MXN/COP→Alfredpay)

Mock parity notes:
- Email step requires checking the **Terms & Conditions** box before continuing.
- OTP step uses a **6-digit numeric `InputOTP`** that **auto-submits** when full; shows
  the target email; offers "Change email" and "Resend code" (both no-op/mock).
- Tokens stored in `localStorage` (reuse the existing persisted auth store).

## 4. Corridor catalog change

Today corridors come from a fixed `CORRIDOR_LIST` of 2 (BR, EU). Expand the **catalog**
to 6, matching the real `FiatToken` set, with an availability flag.

| Corridor | Country | Currency | Provider | Availability |
|---|---|---|---|---|
| `BR` | Brazil | BRL | Avenia | **live** |
| `EU` | Europe | EURC | Mykobo | **live** |
| `MX` | Mexico | MXN | Alfredpay | coming_soon |
| `CO` | Colombia | COP | Alfredpay | coming_soon |
| `US` | USA | USD | Alfredpay | coming_soon |
| `AR` | Argentina | ARS | Alfredpay | coming_soon |

- Add `availability: "live" | "coming_soon"` to the `Corridor` type.
- Only `live` corridors run the XState wizards. `coming_soon` corridors render a
  locked card (badge "Coming soon", no Start button, disabled in the wizard).
- `coming_soon` corridors **can still be selected** at registration / added later
  (the user expresses interest); they simply can't be verified yet.

## 5. Data model changes

### `Corridor` (`src/domain/types.ts` + `corridors.ts`)
- Add `availability: "live" | "coming_soon"`.
- Add the 4 Alfredpay corridors to `CORRIDORS` and `CORRIDOR_LIST`.

### `SenderAccount` (`src/domain/types.ts`)
- Add `selectedCorridors: CorridorId[]` — the corridors the account chose to track.
- `onboardings` becomes **partial**: `Partial<Record<CorridorId, Onboarding>>`,
  populated only for selected corridors. (Adding a country creates its onboarding.)
- Helper: when a corridor is selected, its onboarding initializes to
  `not_started` (live) — coming_soon corridors show a derived "Coming soon" state.

### Seed (`src/domain/seed.ts`)
- Give the 2 seeded accounts a `selectedCorridors: ["BR", "EU"]` so existing demo
  is unchanged.

### New status surface
- Either add a derived display state `"coming_soon"` in `STATUS_META` / `StatusBadge`,
  or compute it from `corridor.availability` at render. Recommended: compute from
  `corridor.availability` (don't pollute the onboarding status enum, which mirrors
  real provider enums).

## 6. New routes & flow

### `/register` (outside the app shell, like `/login`)
A multi-step flow (XState `registerMachine`), mirroring the widget:

1. **Account details** — name, email, account type (company / individual),
   **Terms & Conditions** checkbox. (RHF + Zod.)
2. **OTP** — 6-digit `InputOTP`, auto-submit, mock-accept any code. "Change email" /
   "Resend".
3. **Choose countries** — multi-select grid/list over the 6-corridor catalog:
   - Brazil & Europe tagged **Available**; the 4 Alfredpay corridors tagged **Coming soon**.
   - At least one selection required (recommend defaulting Brazil + Europe checked).
4. **Finish** → `useDashboardStore.createAccount({...})`:
   - creates a new `SenderAccount` with `selectedCorridors`, account type, name, identifier;
   - initializes onboardings (`not_started` for selected live corridors);
   - sets it active; authenticates (auth store `login(email)`); navigates to `/overview`.

### `/login` (existing, refactored to mirror widget)
- Step 1: email + Terms checkbox.
- Step 2: OTP (6-digit, auto-submit, mock).
- → `/overview` (seeded demo accounts).
- Add a "Don't have an account? **Register**" link; `/register` gets "Already have an
  account? **Log in**".

### Route guards
- `_app` layout already redirects to `/login` when unauthenticated — unchanged.
- `/register` and `/login`: if already authenticated, `<Navigate to="/overview" />`.

## 7. Dashboard changes (Overview)

- **Filter corridor cards to `activeAccount.selectedCorridors`** (instead of the full
  `CORRIDOR_LIST`).
- **"Add country" dropdown** (top-right of the corridors section): lists catalog
  corridors **not** in `selectedCorridors`. Selecting one calls
  `dashboardStore.addCorridorToAccount(accountId, corridorId)` → appends to
  `selectedCorridors` + creates its onboarding → card appears.
  - Live corridors appear startable; coming_soon corridors appear locked.
- **Coming-soon card**: badge "Coming soon", greyed progress, button disabled
  ("Available soon").
- Summary cards: count over selected corridors (Corridors / Approved / In progress);
  optionally a 4th "Coming soon" count.
- Recipients gating unchanged (only **approved live** corridors unlock recipients).

## 8. Store changes (`src/stores/dashboard.store.ts`)
- `createAccount(input: { name; email; type; selectedCorridors })`: builds a
  `SenderAccount`, pushes to `accounts`, sets `activeAccountId`, returns id.
- `addCorridorToAccount(accountId, corridorId)`: adds to `selectedCorridors` and seeds
  its `Onboarding` (`not_started`). No-op if already present.
- Existing `setOnboardingStatus` / recipient actions unchanged (guard for partial
  onboardings).
- Consider persisting accounts to `localStorage` so a registered account survives a
  reload (today the dashboard store is in-memory; auth persists but accounts don't —
  a full reload currently resets to seeds). **Decision needed** (see open questions).

## 9. New / changed files (estimate)

**New**
- `src/routes/register.tsx` — `/register` route hosting the register flow.
- `src/machines/register.machine.ts` — XState v5 (details → otp → countries → done).
- `src/machines/auth.machine.ts` *(optional)* — shared email→OTP sub-flow reused by
  `/login` and `/register`.
- `src/components/auth/AuthEmailStep.tsx` — email + T&C (mirrors widget).
- `src/components/auth/AuthOtpStep.tsx` — 6-digit OTP (needs an `InputOTP` ui component).
- `src/components/auth/CountrySelectStep.tsx` — catalog multi-select.
- `src/components/onboarding/AddCorridorDropdown.tsx` — "Add country" dropdown.
- `src/components/ui/input-otp.tsx` — shadcn `InputOTP` (uses `input-otp` dep — add it).

**Changed**
- `src/domain/types.ts` — `Corridor.availability`, `SenderAccount.selectedCorridors`, partial onboardings.
- `src/domain/corridors.ts` — add MX/CO/US/AR + availability + flags.
- `src/domain/seed.ts` — `selectedCorridors` on seeded accounts.
- `src/domain/status.ts` / `StatusBadge.tsx` — coming-soon rendering.
- `src/stores/dashboard.store.ts` — `createAccount`, `addCorridorToAccount`.
- `src/routes/login.tsx` — refactor to email→OTP, add register link.
- `src/routes/_app/overview.tsx` — filter by selectedCorridors + Add-country dropdown.
- `src/components/onboarding/CorridorCard.tsx` — coming-soon variant.
- `package.json` — add `input-otp` (and `@radix-ui`? no — `input-otp` is standalone).

## 10. Dependencies
- Add **`input-otp`** (used by the widget for the 6-digit code) — `bun add input-otp -F vortex-dashboard`.

## 11. Edge cases / rules
- Register requires ≥1 selected country and the Terms box checked.
- OTP mock: accept any 6 digits; "Resend" is a no-op toast.
- Adding a country already selected is a no-op.
- Coming-soon corridors: never startable, never unlock recipients, excluded from
  "Approved/In progress" counts (or shown separately).
- Switching accounts shows that account's `selectedCorridors` only.
- A registered account with no live corridors selected → Recipients stays locked.

## 12. Verification (when implemented)
- `bun typecheck`, `bun lint:fix` clean; `vite build` + prerender pass.
- Live browser walk-through:
  1. `/register` → details + T&C → OTP → select Brazil + Mexico → land on dashboard
     showing Brazil (startable) + Mexico (coming soon); new account active in switcher.
  2. "Add country" → add Europe → card appears.
  3. Start Brazil KYC → approve → recipients unlock.
  4. `/login` (email→OTP) → lands on seeded demo accounts.

## 13. Open questions (resolve before building)
1. **Persist registered accounts to localStorage?** (so they survive reload like auth
   does). Recommended: yes, persist `accounts` + `activeAccountId` + `recipients` so the
   registered account isn't lost on refresh. Trade-off: seeded demo edits also persist.
2. **`/login` Terms checkbox** — widget shows T&C on the email step always; for a
   returning-user login it's arguably redundant. Recommended: show T&C only on
   `/register`, plain email on `/login`.
3. **Country selection minimum** — force Brazil+Europe preselected, or start empty?
   Recommended: preselect Brazil + Europe (the live corridors), allow deselect.
4. **Coming-soon in summary counts** — separate "Coming soon" stat card, or hide from
   counts? Recommended: separate stat.
