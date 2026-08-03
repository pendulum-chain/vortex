# Proposal: Headless Profiles and Pricing Plans

Status: proposed. The product direction is accepted; exact migration ordering and final
internal route shapes remain implementation-review decisions. Last updated: 2026-08-03.

Related decisions and specifications:

- [`ADR 0001: User-Gated Ramp Registration`](adr-0001-user-gated-ramp-registration.md)
- [`Identity, Customer, and Partner Model`](architecture-identity-model.md)
- [`API Credential Authentication`](security-spec/01-auth/api-keys.md)
- [`Monerium Integration`](security-spec/05-integrations/monerium.md)
- [`API Credential Production Rollout`](operations-api-credential-rollout.md)
- [PR #1298](https://github.com/pendulum-chain/vortex/pull/1298)

## Decision sought

Approve this deliberately smaller model:

1. A headless profile is a permanently local Vortex access principal. It has no Supabase
   identity, login email, OTP flow, or later claiming lifecycle.
2. Every headless profile is attached to exactly one existing `customer_entities` row.
   Entity-less technical managed profiles are removed because Vortex has no current use
   for partner-wide operations or webhooks across profiles.
3. Every API credential belongs to exactly one profile. Credentials do not select
   pricing, represent an organization, or own resources as a second principal.
4. Quotes, ramps, and webhooks are profile-owned. The credential ID additionally binds a
   public-key quote to the corresponding secret key where required.
5. The current `partners` subsystem is renamed to describe what it actually stores:
   reusable pricing plans, corridor rules, and time-bounded profile assignments.
6. Self-service and headless profiles use the same pricing-resolution path. Pricing never
   depends on which credential or login method the profile used.
7. A managed profile records a normalized source plus an external subject ID solely for
   provenance and idempotency. That source is not an authentication or pricing entity.
8. Interactive provider onboarding is not expanded for headless profiles. Their customer
   entities and KYC/KYB/provider records are created through manual operational processes.

When implemented, replace this proposal with an accepted ADR, update the canonical
architecture and security specifications, and remove this proposal. Git history is the
implementation record.

## Context

PR #1298 correctly moves Vortex toward one public/secret credential row acting for one
profile. Its managed-profile implementation, however, extends the overloaded `partners`
concept into identity and authorization.

Today one `partner_id` can mean several different things:

```text
pricing template
credential manager
quote owner
webhook tenant
managed-profile namespace
```

This is extraneous complexity, not inherent domain complexity. The clearest evidence is
the recipient-invitation discount flow: it creates a dedicated `partners` row named after
a profile email only to hold pricing configuration. Such a row is a pricing plan, not a
commercial organization.

The product requirements are narrower:

- some profiles receive reusable custom fees, markups, discounts, and rates;
- pricing may be time-bounded and its previous assignments are operationally useful;
- legacy and manually imported customers sometimes need API access without login;
- all new credentials act for one profile;
- all sensitive customer operations derive their entity from that profile;
- Vortex admins, not external partner tenants, provision headless profiles and their
  credentials;
- partner-wide webhooks across multiple profiles are not currently used or required.

The schema should model those facts directly. It should not preserve organization-level
authorization or claimable identities for hypothetical future requirements.

## Design sacrifices

This proposal intentionally does not support:

- later claiming of a headless profile;
- partner/organization principals in API authentication;
- one credential operating across multiple profiles;
- partner-wide webhooks across multiple profiles;
- entity-less technical managed profiles;
- pricing selected by an API credential or request body;
- entity-specific pricing beneath one profile;
- an integration-account, tenant, or organization table;
- a public partner-management API.

Those sacrifices reduce the runtime model from an overloaded graph (`🤯`) to four
independent concepts (`🧠`):

```text
access identity          compliance identity
profile                  customer_entity
api_credential           provider_customer / kyc_case

commercial terms         import provenance
pricing_plan             managed_profile.source
pricing_plan_rule        external_subject_id
profile_pricing_assignment
```

If organization-wide login, permissions, billing, or multi-profile webhooks become real
requirements later, introduce an explicit integration-account model then. Do not reuse a
pricing plan as an authorization principal.

## Vocabulary and invariants

### Profile

A profile is the principal that owns API credentials and runtime resources. It may be:

- self-service: backed by Supabase and a non-null email; or
- headless: local to Vortex, with a null email and one managed-profile record.

Every authenticated request resolves exactly one profile. If a Supabase session and API
credential are presented together, they must resolve to the same profile or the request
fails with `CREDENTIAL_SUBJECT_MISMATCH`.

### Customer entity

A customer entity is the legal KYC/KYB subject. It owns provider customers and
verification cases. It may exist without a profile after a manual import.

A headless profile is created only when API access is required, then attached to one
existing eligible customer entity. It never creates a blank entity lazily.

### API credential

One credential contains one public value and one secret value and belongs to one profile.
Both values have one environment, expiry, revocation, and subject lifecycle.

The credential carries no pricing-plan, partner, source, or customer-entity foreign key.
Those facts are resolved from the profile and its associations.

### Pricing plan

A pricing plan is a reusable named collection of commercial terms. It is not a person,
organization, authentication principal, or provider.

One active profile-pricing assignment selects a plan for a profile. A profile without an
active assignment receives the default Vortex plan. Truly anonymous quotes also receive
the default plan.

### Managed-profile source

`managed_profiles.source` is a normalized namespace such as `legacy-client-a` or
`monerium-import`. Combined with `external_subject_id`, it makes provisioning idempotent
and records provenance.

It grants no permissions and selects no pricing. Vortex-admin authentication protects all
managed-profile and managed-credential routes.

## Target model

### Self-service profile

```text
Supabase Auth user
    -> profiles(id = Supabase UUID, email = login email)
    -> optional active profile_pricing_assignment
    -> customer_entities
    -> provider_customers / kyc_cases
    -> api_credentials(profile_id)
    -> profile-owned quotes, ramps, and webhooks
```

Self-service OTP, profile creation, provider onboarding, and dashboard credential
management remain unchanged apart from the removal of partner-principal branches.

### Manually imported entity

```text
customer_entities(profile_id = NULL, type = business)
    -> provider_customers(provider = monerium, provider_customer_id = corporate profile ID)
    -> kyc_cases(type = kyb, normalized status and provider evidence)
```

This is a complete compliance identity. It needs neither a profile nor pricing until API
access is required.

### Headless profile

```text
source + external subject ID
    -> managed_profiles
    -> local profiles row(email = NULL)
    -> attach one existing customer_entity and make it active
    -> optional profile_pricing_assignment
    -> api_credentials(profile_id)
    -> profile-owned quotes, ramps, and webhooks
```

Pricing assignment is separate from provisioning. An administrator may assign any active
pricing plan after provisioning; without one, the profile uses the default plan.

### No technical managed-profile variant

The former `technical` subject existed to support partner-operational credentials and
partner-wide webhooks. Those capabilities are not required. Every managed profile in this
proposal therefore represents an individual or business customer through its attached
entity.

If a machine-to-machine principal without a customer identity becomes necessary, design
it explicitly around the concrete capability. Do not create an entity-less profile that
can accidentally enter customer/provider paths.

## Proposed database changes

### `profiles`

Change `email` from non-null to nullable. PostgreSQL's existing unique email index may
remain because multiple null values do not conflict.

Required invariants:

- every `profiles.email IS NULL` row has exactly one `managed_profiles` row;
- no managed profile has a non-null email;
- every self-service OTP/session profile has a non-null email;
- no API or admin path can create an unassociated null-email profile.

Do not add a `profile_kind` discriminator. The unique managed-profile association is the
source of truth. Update the misleading model comment that every profile ID is a Supabase
UUID; headless IDs are generated locally.

### Rename `partners` to `pricing_plans`

Target columns:

| Column | Meaning |
|---|---|
| `id` | UUID primary key |
| `code` | Stable unique machine identifier, replacing `name` |
| `display_name` | Operator-facing name |
| `is_default` | Marks the single fallback plan |
| `is_active` | Whether new quotes may resolve this plan |
| timestamps | Standard audit timestamps |

Remove `logo_url` after confirming there is no current consumer. Do not preserve legacy
inline pricing/ramp columns as runtime model attributes; pricing belongs only in rules.

Rename the existing `vortex` row to a stable code such as `vortex-default`, with a clear
display name such as `Vortex Default`, and set `is_default = true`. Add a partial unique
index allowing only one default row and a startup assertion requiring exactly one active
default. Resolution must use that invariant, not scattered string fallbacks.

### Rename `partner_pricing_configs` to `pricing_plan_rules`

Rename `partner_id` to `pricing_plan_id`. Retain the existing commercial fields:

- ramp direction and optional fiat-corridor scope;
- markup type, value, and currency;
- Vortex fee type and value;
- target discount and dynamic-difference/subsidy bounds;
- payout addresses required for markup distribution;
- active state and timestamps.

Keep the unique scope:

```text
(pricing_plan_id, ramp_type, COALESCE(fiat_currency, '*'))
```

A corridor-specific rule continues winning over the plan's wildcard rule.

### Rename `profile_partner_assignments` to `profile_pricing_assignments`

Target columns:

| Column | Meaning |
|---|---|
| `id` | UUID primary key |
| `profile_id` | Profile receiving the plan |
| `pricing_plan_id` | Selected reusable pricing plan |
| `is_active` | Current administrative selection |
| `expires_at` | Optional time boundary |
| timestamps | Assignment history |

Remove `partner_name`, `buy_partner_id`, and `sell_partner_id`. They are redundant or
legacy representations.

Retain the partial unique invariant that a profile has at most one active assignment.
Resolution additionally requires `expires_at IS NULL OR expires_at > now`.

The assignment table earns its existence by retaining time bounds and previous inactive
assignments. If product later confirms neither is useful, it may be collapsed into
`profiles.pricing_plan_id`; that simplification is not required for this change.

### Rename `partner_managed_profiles` to `managed_profiles`

Target columns:

| Column | Meaning |
|---|---|
| `id` | UUID primary key |
| `source` | Normalized provenance/idempotency namespace |
| `external_subject_id` | Immutable subject identifier within the source |
| `profile_id` | Unique headless profile |
| `customer_entity_id` | Unique existing legal entity attached to the profile |
| timestamps | Standard audit timestamps |

Remove `partner_id`, `subject_type`, and `claimed_at`.

- The attached customer entity supplies individual/business type; do not duplicate it.
- There is no claiming lifecycle.
- There is no organization principal.

Normalize `source` to a lowercase slug at the request boundary. Trim the external subject
ID without lowercasing it unless the source contract explicitly declares case-insensitive
IDs. Enforce bounded lengths before database access.

Required uniqueness:

```text
UNIQUE (source, external_subject_id)
UNIQUE (profile_id)
UNIQUE (customer_entity_id)
```

Add a composite relationship ensuring `(customer_entity_id, profile_id)` references the
same pair on `customer_entities`. This makes it impossible for the managed record to name
an entity owned by a different profile. Provisioning also sets
`profiles.active_customer_entity_id` to this entity; startup assertions verify it remains
the active entity for every managed profile.

### `api_credentials`

Keep the unified public/secret representation and non-null `profile_id`. Remove
`partner_id` and its index/FK.

The credential context becomes:

```ts
interface CredentialContext {
  credentialId: string;
  environment: "live" | "test";
  profileId: string;
  strength: "public" | "secret";
}
```

### `quote_tickets`

Keep profile ownership and `api_credential_id`. Rename `pricing_partner_id` to
`pricing_plan_id`. Remove the ownership `partner_id` column.

The quote snapshots the plan used at creation so later assignment changes do not alter
already quoted commercial terms. Its fee metadata remains the monetary execution record.

### `webhooks`

Remove `partner_id`. Require profile ownership for every new webhook. A global webhook
means all matching events owned by that one profile, never multiple profiles.

The production migration must verify that no active organization/partner-owned webhook
requires multi-profile behavior. The product owner has confirmed the feature is unused;
the database preflight remains necessary to catch unexpected rows.

### Observability

Stop using generic `partnerId` and `partnerName` event dimensions. Record only safe,
unambiguous identifiers relevant to the event:

- profile ID;
- credential ID and safe prefix;
- pricing plan ID/code for quote pricing;
- managed source for provisioning operations;
- quote/ramp ID.

Never log external subject IDs when they may contain PII, key values, emails, tax
references, or provider payloads.

## Pricing resolution

Use one pricing path for anonymous, self-service, and headless requests:

```text
request
    -> resolve effective profile (session or credential)
    -> reject session/credential profile mismatch
    -> load active, unexpired profile pricing assignment
    -> load active pricing plan rule for direction + corridor
    -> otherwise use active default plan rule
    -> persist pricing_plan_id on quote
```

Do not accept a pricing-plan, partner, or rate identifier from public quote bodies. An
administrator changes pricing through the profile-pricing assignment API, not by issuing
a different credential.

Consequences:

- every credential for one profile produces identical pricing;
- public key, secret key, and Supabase session produce identical pricing;
- managed-profile source never affects pricing implicitly;
- changing a profile's plan does not require credential rotation;
- disabling a pricing plan prevents new resolution but does not rewrite existing quotes;
- an expired assignment falls back to the default plan.

## Proposed internal API contracts

### Provision a headless profile

```http
POST /v1/admin/managed-profiles
Authorization: Bearer <ADMIN_SECRET>
Content-Type: application/json
```

Request:

```json
{
  "source": "monerium-import",
  "externalSubjectId": "corporate-profile-4821",
  "customerEntityId": "existing-customer-entity-uuid"
}
```

Response:

```json
{
  "managedProfile": {
    "id": "managed-profile-uuid",
    "profileId": "headless-profile-uuid",
    "source": "monerium-import",
    "externalSubjectId": "corporate-profile-4821",
    "customerEntityId": "existing-customer-entity-uuid",
    "created": true
  }
}
```

Idempotency behavior:

- the same normalized source, external subject ID, and entity returns the existing result;
- the same source/external ID with a different entity returns `409`;
- an inactive, blocked, missing, or already-owned entity is rejected;
- no email, subject type, pricing plan, or claim state is accepted.

### Assign profile pricing

Rename the internal admin route family to use pricing vocabulary. The create/replace
operation accepts:

```json
{
  "profileId": "profile-uuid",
  "pricingPlanCode": "enterprise-latam",
  "expiresAt": null
}
```

It locks the profile, deactivates any current assignment, validates an active plan, and
creates the new assignment in one transaction. This endpoint works identically for
self-service and headless profiles.

### Manage credentials for a headless profile

Replace partner-based admin routes with source-based managed-profile lookup. For example:

```http
POST /v1/admin/managed-profiles/:source/:externalSubjectId/api-credentials
GET /v1/admin/managed-profiles/:source/:externalSubjectId/api-credentials
DELETE /v1/admin/managed-profiles/:source/:externalSubjectId/api-credentials/:credentialId
```

Each route resolves:

```text
normalized source + external subject ID
    -> managed profile
    -> profile ID
    -> profile-owned credentials
```

These routes remain Vortex-admin-only. Do not add them to public OpenAPI unless product
later supports an external administrative contract.

## Service behavior

### Headless provisioning transaction

Implement one database transaction:

1. Validate and normalize source and external subject ID.
2. Lock/read the managed record by `(source, external_subject_id)`.
3. For an existing record, verify the attached entity and return it idempotently.
4. Lock the requested customer entity.
5. Require it to be active and currently unowned, or already owned by the idempotently
   resolved profile.
6. Generate a profile UUID locally.
7. Insert the null-email profile.
8. Attach the entity to the profile and set it as the profile's active entity.
9. Insert the managed-profile record.
10. Commit and return the result.

The service must not call Supabase, create Auth metadata, send email, create a blank
customer entity, select pricing, or perform provider onboarding.

### Customer-entity resolution

Centralize managed-profile eligibility in the customer-entity service:

- self-service profiles retain current create/select behavior;
- managed profiles use only their pre-attached active entity;
- a managed profile missing that entity fails explicitly;
- managed profiles never lazily create another entity.

Because technical managed profiles are removed, there is no technical-profile branch or
special error to remember.

### OTP authentication

Remove managed-profile claim handling from OTP verification. OTP continues upserting only
the Supabase-authenticated self-service profile. There is no merge or conversion behavior
between an email login and a headless profile.

### Credential validation and resource ownership

Public and secret validation resolve only the credential and profile. They do not load a
partner/pricing row.

- revocation and expiry disable both values atomically;
- when both values are present, they must resolve to the same credential ID;
- when a session and credential are present, they must resolve to the same profile;
- a public-key quote persists credential and profile IDs;
- secret registration of that quote requires the same credential ID;
- quote, ramp, limits, provider, and webhook authorization compare profile ownership;
- webhook queries never use pricing plans or managed sources as owners.

Remove `authenticatedPartner`, `enforcePartnerAuth`, partner branches in ownership
middleware, and partner-aware webhook ownership.

## Manual provider/KYB import boundary

The headless-profile API does not perform KYC/KYB onboarding. Manual import remains a
separate operational lifecycle.

A future Monerium import should materialize only the runtime records Vortex requires:

```text
customer_entities
    type = business
    profile_id = NULL until API access is provisioned

provider_customers
    provider = monerium
    rail = eur
    customer_type = business
    provider_customer_id = immutable Monerium corporate profile ID
    normalized status + original status_external

kyc_cases
    provider = monerium
    type = kyb
    provider profile/case reference
    submitted/approved/rejected timestamps when evidenced
```

Do not import OAuth access/refresh tokens, authorization codes, raw identity documents,
or complete provider payloads. Import immutable provider references, normalized state,
minimal company display data required by the product, and evidence timestamps.

Do not implement a production bulk importer until the actual Monerium source/export
contract and operator/audit requirements are provided. When available, use a
provider-specific offline script with:

- JSON manifest validation;
- dry-run/preflight mode;
- idempotency by `(provider, provider_customer_id)`;
- rejection of a provider profile already attached to another entity;
- one transaction per manifest or explicitly documented batch;
- no destructive update of an approved binding;
- an operator-reviewed reconciliation report containing IDs/counts, not PII;
- focused tests using synthetic company data.

The existing interactive Monerium OAuth endpoints remain Supabase-session-only. Manual
imports must not weaken state, PKCE, email-match, token-custody, or profile-selection
invariants.

## Scope

### In scope

- pricing-plan terminology and schema migration;
- one profile-pricing assignment path for all authenticated profiles;
- removal of credential/request-selected pricing;
- removal of partner principals from credentials, quotes, ownership, and webhooks;
- profile-only unified public/secret credential context;
- nullable profile email for headless profiles;
- simplified managed-profile source/external-ID association;
- attachment of one existing entity during headless provisioning;
- removal of Supabase provisioning, claiming, and technical managed profiles;
- migration/preflight changes required by the new identity and pricing models;
- focused migration, service, authorization, pricing, and integration tests;
- canonical architecture, security, API, skill, and operations documentation updates.

### Explicitly out of scope

- claimable managed identities or conversion to Supabase users;
- synthetic or placeholder login emails;
- partner/organization authentication, tenancy, billing, or permissions;
- partner-wide or cross-profile webhooks;
- machine credentials without a customer profile;
- credential-level or entity-level pricing overrides;
- public selection of pricing plans or rates;
- a public KYC/KYB submission API for headless subjects;
- changing interactive provider onboarding to accept headless credentials;
- rebinding credentials directly to customer entities;
- guessing the Monerium bulk-import format;
- storing Monerium OAuth credentials or raw KYB documents;
- a repository-wide rename of the legacy `User` model in the same change.

## Implementation sequence

### Phase 0: deployment and data gates

Determine which pricing and credential migrations have run in every durable environment.

- Existing deployed pricing tables require a forward rename/cleanup migration.
- If migrations 055-058 have not run outside disposable databases, revise them in place
  so partner-principal columns/tables are never introduced.
- If any have run durably, add forward migrations; do not rewrite applied history.
- Inventory active partner-owned webhooks and require zero multi-profile dependencies.
- Inventory null-email profiles, managed associations, legacy credentials, active pricing
  assignments, and pricing rows using immutable IDs.
- Never delete Supabase users automatically from a database migration.

**Gate:** the implementation PR documents deployed migration state and the chosen forward
or in-place strategy.

### Phase 1: rename and clean the pricing model

- Rename pricing tables, models, services, controllers, routes, and identifiers.
- Rename partner/config FKs to pricing-plan terminology.
- Remove redundant assignment columns and migrate active/history rows.
- Establish one explicit active default pricing plan.
- Change invitation-seeded discounts to create non-PII pricing-plan codes derived from an
  immutable invitation/profile ID, never an email.
- Rename quote pricing provenance to `pricing_plan_id`.
- Update fee calculation, discount state, payout distribution, admin configuration, and
  quote persistence without changing monetary behavior.

**Gate:** golden quote tests show identical amounts/fees before and after for default,
custom, corridor-specific, expired, and invitation-seeded pricing.

### Phase 2: make profiles the only access/resource principal

- Remove `partner_id` from `api_credentials` and credential context.
- Remove request-body partner selection and partner authentication middleware.
- Remove quote ownership `partner_id`; keep profile and credential ownership.
- Migrate webhooks to profile-only ownership and remove partner branches.
- Replace partner observability fields with explicit profile/credential/pricing fields.
- Enforce session/credential profile consistency.

**Gate:** authorization code has no pricing-plan or managed-source ownership branch, and
no profile can operate another profile's quote, ramp, or webhook.

### Phase 3: simplify the headless schema

- Make profile email nullable.
- Replace partner-managed records with source-based managed records.
- Remove claimed state and subject type.
- Require one existing entity for every managed profile.
- Add startup/schema assertions for orphan null-email profiles and invalid entity links.
- Keep existing RLS posture on customer and credential tables.

**Gate:** the database cannot represent a managed record without exactly one profile and
one matching attached customer entity, and startup rejects an inconsistent active entity.

### Phase 4: implement headless provisioning and admin credential routes

- Replace Supabase reconciliation with the single transaction above.
- Resolve managed subjects by source/external subject ID.
- Keep pricing assignment as an independent admin operation.
- Preserve five active credentials per profile and one-row public/secret lifecycle.
- Remove partner API-key route naming and arbitrary profile-UUID credential selection.

**Gate:** tests prove no Supabase call occurs, requests are idempotent/concurrency-safe,
and a source string grants no runtime permission.

### Phase 5: centralize entity eligibility

- Prevent managed profiles from lazy entity creation or selection changes.
- Require their attached active entity across provider, limits, recipient, and ramp paths.
- Keep self-service behavior unchanged.
- Remove technical-profile conditionals made obsolete by the model.

**Gate:** a malformed managed profile cannot enter a provider call, while an attached and
approved managed entity can complete the same ramp path as a self-service profile.

### Phase 6: migrate credentials and pricing assignments

- Backfill SHA-256 secret digests for every preserved secret using
  `backfill-api-key-digests.ts`; reissue any unavailable plaintext secret.
- Use an explicit immutable-ID manifest for legacy key pairs and profile ownership.
- Convert legacy key partner references into profile-pricing assignments, not credential
  ownership.
- If a profile has no active pricing assignment and all its selected legacy keys reference
  one pricing plan, create that assignment.
- If existing assignments and key references disagree, or selected keys reference several
  plans for one profile, stop for operator review.
- Provision/attach headless profiles before creating their unified credentials.
- Require zero active legacy keys and zero partner-owned credentials before startup.

**Gate:** one profile has one effective pricing plan regardless of credential, and every
credential/profile pair in the manifest is unambiguous.

### Phase 7: documentation and contract synchronization

When implementation is complete:

1. Replace this proposal with `adr-0002-headless-profiles-and-pricing-plans.md`.
2. Update `architecture-identity-model.md` with profile ownership, entity separation,
   source-based managed profiles, and pricing terminology.
3. Update `security-spec/01-auth/api-keys.md`, admin auth, webhook ownership, and API
   surface specifications to remove partner principals.
4. Update public quote/authentication docs to remove request-selected partner pricing.
5. Update the production credential rollout with pricing-assignment and webhook-zero
   preflight gates.
6. Update the Vortex integration skill so credentials are profile-linked and pricing is
   not described as credential/partner attribution.
7. Update `security-spec/05-integrations/monerium.md` only if an import path is actually
   implemented.
8. Update `docs/README.md` and remove this proposal.

**Gate:** no maintained document describes pricing plans as partners, managed profiles as
Supabase identities, or credentials/webhooks as partner-owned.

## Test plan

### Pricing migration and model tests

- Existing partner pricing rows migrate one-to-one to plans/rules.
- Corridor-specific rules still win over wildcard rules.
- The default plan is unique and required at startup.
- A profile has at most one active assignment.
- Expired assignments resolve to default pricing.
- Inactive plans/rules cannot price new quotes.
- Assignment rows contain no legacy names or buy/sell partner FKs.
- Invitation discounts create non-PII plan codes and preserve fee/subsidy behavior.

### Pricing resolution tests

- Supabase session, public key, and secret key resolve the same plan for one profile.
- Two credentials for one profile cannot produce different pricing.
- Managed source has no effect on pricing.
- Changing an assignment changes new quotes without rotating credentials.
- Existing quotes retain their stored plan and fee metadata after assignment changes.
- Anonymous and unassigned-profile quotes use the default plan.
- Public requests cannot submit a pricing-plan/partner override.

### Credential and ownership tests

- Credential rows/context contain no partner ID.
- Session plus credential for different profiles fails.
- Public and secret halves still resolve one credential ID.
- Mismatched public/secret values fail immediately.
- Quote and ramp operations are profile-scoped.
- Registration of a credential-origin quote requires the same credential ID.
- Webhooks are profile-owned and never deliver another profile's event.
- No partner-wide webhook registration or lookup path remains.

### Managed-profile tests

- Provisioning takes source, external subject ID, and existing entity only.
- It creates no Supabase user, email, blank entity, pricing row, or claim state.
- Repeating the exact request is idempotent.
- Repeating with a different entity returns conflict.
- Missing, inactive, blocked, or already-owned entities are rejected.
- Concurrent requests cannot create two profiles or attach one entity twice.
- Source normalization is deterministic; external IDs retain source-defined case.
- Every null-email profile has one managed record and attached entity.

### Entity and provider tests

- A managed profile resolves only its attached active entity.
- An imported Monerium company may exist with `profile_id = NULL` and approved
  provider/KYB records.
- Attaching that entity later preserves provider-customer and KYB record IDs.
- Interactive Monerium OAuth remains session-only.
- Ramp registration succeeds for an attached headless profile only when its existing
  provider/KYC state satisfies the corridor.

### Migration/preflight tests

- Legacy key pairs are selected only by immutable IDs.
- Key partner references backfill profile pricing, not credential ownership.
- Conflicting plan references for one profile fail preflight.
- Unmappable partner-owned webhooks fail preflight.
- Missing secret plaintext forces reissue; there is no bcrypt/runtime fallback.
- Startup rejects active legacy keys, partner credential columns, or incomplete schemas.

### Suggested verification commands

Run focused tests first, then repository checks appropriate to touched workspaces:

```bash
cd apps/api
bun test partner-resolution.test.ts
bun test partner-pricing.service.test.ts
bun test profilePartnerAssignments.controller.test.ts
bun test managed-profile.service.test.ts
bun test apiCredential.service.test.ts
bun test api-credential-migration.test.ts
bun test ownershipAuth.test.ts
bun test webhook.service.test.ts
bun test auth.invariants.test.ts
bun test http-surface.invariants.test.ts

cd ../..
bun verify
bun typecheck
```

Rename the focused commands alongside the implementation so the final PR uses pricing
terminology consistently.

## Rollout and recovery

1. Inventory pricing rows, assignments, credentials, headless candidates, entities,
   webhooks, and Supabase identities using immutable IDs.
2. Confirm no active webhook requires organization-wide delivery across profiles.
3. Migrate pricing terminology and validate golden quote outputs.
4. Backfill each profile's pricing assignment using the conflict rules above.
5. Materialize customer entities/provider records through reviewed manual processes.
6. Provision headless profiles and attach entities in a dry-run/reviewed batch.
7. Backfill secret digests or reissue unavailable secrets.
8. Run credential manifest preflight and require all zero-count gates.
9. Cut over during the credential maintenance window.
10. Smoke-test default/custom pricing through session/public/secret auth, one headless ramp,
    exact limits, sanitized ramp info, quote/credential ownership, profile webhook
    isolation, and atomic revocation.
11. Monitor safe profile, credential, pricing-plan, quote, and ramp IDs plus stable error
    codes. Never log secrets or identity/provider payloads.

Rollback must not reactivate legacy keys, restore partner-principal authorization, or
recreate claimable Supabase managed identities. Restore the previous application only
when its schema/auth behavior remains compatible; otherwise correct data and roll forward.

## Acceptance criteria

The change is complete when:

- `partners`, `partner_pricing_configs`, and `profile_partner_assignments` no longer name
  the pricing subsystem;
- pricing plans/rules/assignments are the only source of custom commercial terms;
- public, secret, and session requests for one profile always resolve the same plan;
- credentials have no partner/pricing/source ownership field;
- quotes and webhooks have no partner owner and are profile-scoped;
- no multi-profile webhook capability remains;
- managed-profile creation takes no partner, email, subject type, pricing plan, or claim
  state;
- every managed profile has one source/external ID, one null-email profile, and one
  attached existing customer entity;
- no entity-less technical managed profile can be created;
- manually imported entities may exist without profiles;
- self-service signup, OTP, entity selection, and credentials remain behaviorally intact;
- no interactive provider onboarding route was broadened for headless profiles;
- migration tooling rejects ambiguous pricing, credential ownership, or webhook data;
- canonical docs and the integration skill use the final vocabulary consistently.

## Inputs required before a bulk Monerium importer

The headless-profile and pricing work is not blocked by these inputs. A later importer
must not guess them:

- actual Monerium export/API source format;
- immutable corporate/profile deduplication key;
- authoritative provider-to-Vortex verification-status mapping;
- company display fields required at runtime;
- evidence timestamps and operator/audit identity;
- expected batch size and transaction/retry requirements;
- secure source-data location and retention policy.
