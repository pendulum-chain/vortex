# Production rollout — dashboard app + unified schema (migrations 038–049)

Checklist and reference for promoting the dashboard/unified-schema release
(PR #1236, `feature/dashboard-app-staging` → `staging` → `main`) to production.
Verified on staging 2026-07-15: all migrations applied at boot, parity checks passed
(see §4), zero status drift.

What the release contains: the unified customer schema (`customer_entities`,
`provider_customers`, `kyc_cases`), the partner split + API-key partner FK,
recipients/invitations, notifications, Monerium server-side OAuth, the dashboard app
(own domain, `dashboard.vortexfinance.co`), the one-active-ramp-per-user lock, and the
widget KYB deep-link changes.

---

## 1. Before the production deploy

### Render (production API service)

- [ ] `MONERIUM_CLIENT_ID=<auth-code client id, production Monerium application>`
- [ ] `MONERIUM_REDIRECT_URI=https://dashboard.vortexfinance.co/monerium/callback`
- Both are **required** — the API refuses to boot without them (`config/vars.ts`).
- Do **not** set `MONERIUM_API_URL` or `SANDBOX_ENABLED` (default resolves to the
  production `api.monerium.app`).
- Do **not** set `DASHBOARD_ORIGINS` — `dashboard.vortexfinance.co` is hardcoded in the
  CORS whitelist; the env var is only for staging/preview origins.

### Monerium application portal

- [ ] Register `https://dashboard.vortexfinance.co/monerium/callback` as a redirect URI
  (must match `MONERIUM_REDIRECT_URI` byte for byte).

### Netlify — production dashboard site

- [ ] Site created with **Base directory `apps/dashboard`** (build/publish come from
  `apps/dashboard/netlify.toml`; leave command/publish/package-directory empty in the UI).
- [ ] `VITE_API_URL=https://api.vortexfinance.co`
- [ ] `VITE_WALLETCONNECT_PROJECT_ID=<same as widget site>`
- [ ] `VITE_ALCHEMY_API_KEY=<optional, same as widget site>`
- `VITE_WIDGET_URL` may stay unset — production builds default to
  `https://app.vortexfinance.co`.
- [ ] DNS: `dashboard.vortexfinance.co` → the Netlify site.

### Netlify — existing frontend (widget) site

- [ ] `apps/frontend/netlify.toml` overrides the UI build settings on the first deploy
  that contains it — confirm they agree with the current UI configuration.

---

## 2. Deploy

- [ ] Merge/promote per the usual staging → main flow.
- Migrations **038–049 run automatically at API boot** (umzug). First boot is slower
  than usual. A dropped connection mid-migration (the Supavisor pooler has produced
  `EAUTHTIMEOUT` before) is safe to retry — completed migrations are bookkept in
  `SequelizeMeta` and each migration's backfills are idempotent.
- [ ] Watch the first boot's logs until `SequelizeMeta` reaches
  `049-unique-customer-entities-profile-type`.
- No `seed:phase-metadata` rerun is needed (no seeder changes in this release).

### Rollback posture

Rolling the **app** back to the previous release is safe **without** reverting
migrations — the schema changes are additive and the old code ignores the new tables.
Never run `migrate:revert*` against production (migration `down()`s drop tables).

---

## 3. Post-deploy data checks

Production-specific — staging was clean on all three, but production data is real:

- [ ] **Quarantined Avenia rows**: `tax_ids` rows with `user_id IS NULL` were deliberately
  not migrated. Check how many have a real subaccount
  (`sub_account_id <> ''`) — those users' KYC status is invisible to the new schema until
  they re-onboard, at which point the adoption path
  (`brla.controller.ts`, `TaxId.findByPk` on subaccount creation) reclaims the legacy
  subaccount by tax id. Non-zero is acceptable; know the number.
- [ ] **Ramp-locked users**: users with a non-terminal ramp cannot register a new one.
  Ramps stuck in `initial` self-heal (swept at that user's next registration after 15
  minutes); ramps **wedged past `initial`** block their user indefinitely and need an
  operator to move them to a terminal phase after verifying no funds are in flight.
- [ ] **Orphaned API keys**: active keys with `partner_name` set but `partner_id NULL`
  are treated as revoked by the new validators. Confirm no production integration
  depends on one (staging had zero).

All three are counted by Section 2 of the parity script (next section).

---

## 4. Parity verification (precondition for ever dropping legacy tables)

Script: [`apps/api/scripts/schema-parity-checks.sql`](../../apps/api/scripts/schema-parity-checks.sql)
— pure `SELECT`s, mirrors the backfill eligibility rules of migrations 038/039/040 and
the 045 status canonicalization.

Run it **soon after the deploy**: the backfills are one-shot (no dual-write), so the
legacy tables start drifting from live data immediately, and parity comparisons lose
meaning over time.

Access notes (Supabase):

- Every table has RLS enabled; a read-only role sees zero rows without help, and
  `BYPASSRLS` cannot be granted (requires superuser, which Supabase's `postgres` isn't).
- Either run the script directly in the Supabase SQL editor (runs as `postgres`, the
  table owner, which bypasses RLS), or create a temporary read-only role plus per-table
  `FOR SELECT TO <role> USING (true)` policies, and drop both afterwards.
- Section 0 of the script is an RLS sanity probe — if it reads 0 on tables that
  `pg_stat_user_tables.n_live_tup` says are populated, fix access before interpreting
  anything else.

Expected results:

- **Section 1 (parity): all 0.** Exception: `1e` counts provider accounts without a KYC
  case, and an **in-flight Monerium authorization started after the deploy** legitimately
  appears there (the KYC case is created later in that flow) — check `created_at` before
  treating it as a gap.
- **Section 2 (info): non-zero expected**; these size the deliberately skipped buckets
  from §3.
- **Section 3 (status drift): empty right after the deploy.** Later rows normally mean
  the account progressed post-deploy (the new schema is authoritative).

- [ ] Section 1 all zero (or explained by post-deploy activity)
- [ ] Section 2 numbers reviewed and acceptable
- [ ] Section 3 empty
- [ ] Record the result (date + numbers) in this file or the PR

---

## 5. Smoke tests

- [ ] Dashboard: OTP login at `dashboard.vortexfinance.co`, account-type selection,
  corridor statuses render from `GET /v1/onboarding/status`.
- [ ] Monerium: start EU onboarding → hosted OAuth → callback lands on
  `/monerium/callback` → corridor moves to `started`/`in_review`.
- [ ] Widget: a `?kybLocked=BR` deep link renders the **company** (CNPJ) form, not the
  individual CPF form.
- [ ] Recipients: create an invite, open the link, redeem in the widget.
- [ ] CORS: dashboard requests to `api.vortexfinance.co` succeed (origin is hardcoded in
  `config/express.ts`).

---

## 6. Table inventory — what stays, what can go

Reference for the eventual drop migration. **Do not write that migration until the
production parity check (§4) has passed and one full release cycle has run clean.**

### Keep (live schema)

| Table | Role |
| :-- | :-- |
| `profiles` | Login identity + `active_customer_entity_id` pointer |
| `customer_entities` | Legal/compliance customer anchor (new) |
| `provider_customers` | Unified provider/rail accounts (new) |
| `kyc_cases` | Unified KYC/KYB attempts (new) |
| `partners`, `partner_pricing_configs` | Post-split partner identity + per-direction pricing |
| `profile_partner_assignments` | Kept per schema plan |
| `api_keys` | Live; see column note below |
| `recipient_invitations`, `sender_recipients`, `recipient_payout_references` | Recipient product (new) |
| `notifications`, `notification_preferences` | Notifications (new) |
| `quote_tickets`, `ramp_states`, `subsidies`, `anchors`, `webhooks`, maintenance/observability tables | Unchanged operational schema |

### Droppable after production parity + one clean release cycle

| Table | Why it exists | Drop precondition |
| :-- | :-- | :-- |
| `mykobo_customers` | 040 backfill source; no model, no reads/writes | §4 passed in production |
| `alfredpay_customers` | 040 backfill source; no model, no reads/writes | §4 passed in production |
| `kyc_level_2` | Superseded by `kyc_cases` (no data conversion — dead before migration) | §4 passed in production |
| `partners_legacy` | 039 pre-split snapshot, "never read by code" | §4 passed in production (1f specifically) |

### Not yet droppable

| Object | Blocker |
| :-- | :-- |
| `tax_ids` | One live read remains: the subaccount **adoption** path in `brla.controller.ts` (legacy row claimed on re-onboarding), and it quarantines the unowned rows from §3. Drop only after deciding what happens to unclaimed quarantined subaccounts and removing the adoption read. |
| `api_keys.partner_name` (column) | **Load-bearing**: the validators use "partner_name set + partner_id NULL" to detect orphaned partner keys (partner deletion = revocation). Droppable only after an explicit revocation mechanism (e.g. cascade `revoked_at` on partner deletion) replaces the heuristic. |

### Checklist for the future drop-migration author

- [ ] §4 recorded as passed on production
- [ ] One full release cycle since, with no reads of the legacy tables (they have no
  models — a grep for the table names in `apps/api/src` should only hit migrations)
- [ ] `tax_ids`: adoption read removed or explicitly retired; quarantined-row policy decided
- [ ] `api_keys.partner_name`: revocation cascade shipped first
- [ ] Migration drops tables only (no data transformation); `down()` restores nothing —
  document it as irreversible
- [ ] Security-spec sync: `01-auth/api-keys.md` (partner_name references) and
  `03-ramp-engine/recipient-transfers.md`
