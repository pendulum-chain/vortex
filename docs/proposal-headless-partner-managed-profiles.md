# Proposal: Headless Partner-Managed Profiles

Status: proposed. High-level direction accepted; exact migration and API contract remain
to be reviewed during implementation. Last updated: 2026-08-03.

Related decisions and specifications:

- [`ADR 0001: User-Gated Ramp Registration`](adr-0001-user-gated-ramp-registration.md)
- [`Identity, Customer, and Partner Model`](architecture-identity-model.md)
- [`API Credential Authentication`](security-spec/01-auth/api-keys.md)
- [`Monerium Integration`](security-spec/05-integrations/monerium.md)
- [`API Credential Production Rollout`](operations-api-credential-rollout.md)
- [PR #1298](https://github.com/pendulum-chain/vortex/pull/1298)

## Decision sought

Approve the minimal implementation described here:

1. A partner-managed profile is a permanently headless, local Vortex profile. It is not
   a Supabase identity, has no login email, and cannot be claimed through OTP.
2. `customer_entities` remains the legal/KYC/KYB subject. A manually onboarded entity may
   exist without a profile and receive provider-customer and verification records first.
3. A headless profile is provisioned only when API access is needed, then attached to one
   existing eligible customer entity. Technical profiles remain entity-less.
4. API credentials remain bound to `profile_id` in this change. Rebinding all credentials
   directly to customer entities is explicitly deferred as a broader identity refactor.
5. Interactive Avenia, Alfredpay, Mykobo, and Monerium onboarding routes are not expanded
   to support headless credentials. Provider onboarding and KYB import remain manual
   operational processes.
6. Partner-managed credential creation must be database- and service-constrained to the
   profile association owned by that same partner.

When this proposal is implemented, replace it with an accepted ADR, update the current
architecture and security specifications, and remove this proposal. Git history is the
implementation record.

## Context

PR #1298 unifies public and secret API values into one credential that acts for exactly
one profile. It also introduces `partner_managed_profiles` for legacy or delegated
customers who never completed Vortex signup.

The first implementation treated a managed profile as a Supabase user created by an
administrator:

```text
partner + external user ID + email
    -> Supabase Auth user
    -> profiles row
    -> customer entity
    -> partner-managed credential
    -> possible OTP claim later
```

That lifecycle carries requirements Vortex does not need:

- a correct or synthetic email at provisioning time;
- an external Supabase mutation outside the database transaction;
- email collision and reconciliation rules;
- OTP claiming and `claimed_at` state;
- the possibility of partner management changing after a claim;
- provider onboarding APIs that impersonate an interactive user.

The actual use cases are narrower:

- legacy partner customers were manually KYC/KYB-onboarded and linked by Vortex;
- future corporate customers may be imported from Monerium after manual KYB;
- these legal entities must exist in Vortex without an email or login;
- some of them later need a public/secret credential so a partner can operate ramps;
- Vortex does not need to offer an interactive KYC/KYB flow for those headless subjects.

The existing identity model already separates the relevant concepts. A profile is the
request principal, while a customer entity owns provider accounts and KYC/KYB cases.
`customer_entities.profile_id` is nullable, so compliance records can exist before or
without an API/login principal.

## Design sacrifice

This proposal deliberately gives up later account claiming. That reduces the managed
identity path from four simultaneous concepts (`🤯`) to two (`🧠`):

```text
legal/compliance identity         API access identity
customer_entity                   headless profile
provider_customer                 partner association
kyc_case                          api_credential
```

If an interactive conversion is needed in the future, it must be introduced as a new,
explicit migration workflow. The current system must not preserve dormant Supabase,
email, or claiming behavior for that hypothetical case.

## Target model

### Self-service subject

```text
Supabase Auth user
    -> profiles(id = Supabase UUID, email = login email)
    -> customer_entities(profile_id = profile ID)
    -> provider_customers / kyc_cases
    -> api_credentials(profile_id = profile ID, partner_id = NULL)
```

Self-service OTP, profile creation, provider onboarding, and dashboard credential
management remain unchanged.

### Manually imported legal entity

```text
customer_entities(profile_id = NULL, type = business)
    -> provider_customers(provider = monerium, provider_customer_id = corporate profile ID)
    -> kyc_cases(type = kyb, normalized status and provider evidence)
```

This is a complete compliance identity. It does not require a profile or credential.

### Headless API subject

When a partner needs API access for an existing entity:

```text
partner + external user ID
    -> local profiles row(email = NULL)
    -> partner_managed_profiles
    -> attach existing customer_entity and make it active
    -> api_credentials(profile_id = headless profile, partner_id = same partner)
```

The profile is an access principal only. It does not replace the customer entity as the
legal identity or create a second provider customer.

### Technical subject

A technical managed profile may exist without a customer entity for partner-operational
capabilities that do not act for a KYC/KYB customer. It must remain ineligible for customer
creation, provider operations, exact customer limits, and ramp registration.

## Proposed database changes

### `profiles`

Change `email` from non-null to nullable. PostgreSQL's unique email index may remain:
multiple null values do not conflict.

Do not add a second `profile_kind` discriminator in this minimal change. The presence of
one unique `partner_managed_profiles` association is the source of truth that a profile is
headless and partner-managed. Self-service creation paths continue requiring an email.

Required invariant checks:

- every `profiles.email IS NULL` row has exactly one managed-profile association;
- no managed profile has a non-null email;
- every self-service OTP/session profile has a non-null email;
- no API or admin path can create an unassociated null-email profile.

Update the misleading model comment that every profile ID is a Supabase UUID. Self-service
IDs remain Supabase UUIDs; headless IDs are generated by the API.

### `partner_managed_profiles`

Keep:

- `id`;
- `partner_id`;
- `profile_id`;
- `external_user_id`;
- `subject_type` (`individual`, `business`, or `technical`);
- timestamps;
- unique `(partner_id, external_user_id)`;
- unique `profile_id`.

Remove `claimed_at`. There is no claim lifecycle.

Normalize `external_user_id` by trimming before lookup and storage, enforce the existing
255-character database bound at the request boundary, and never use email or a display
name for idempotency.

### Customer-entity attachment

For `individual` and `business` managed profiles, provisioning requires an existing
`customerEntityId`:

- the entity exists and is active;
- the entity type matches `subjectType`;
- `profile_id` is null, or it already belongs to the same idempotently resolved profile;
- the entity is not already owned by a different profile;
- the profile's `active_customer_entity_id` is set to that entity;
- no new provider customer or KYC/KYB case is created.

For a `technical` managed profile, `customerEntityId` must be absent and the profile must
remain without an active or owned customer entity.

### Credential-to-partner integrity

Keep `api_credentials.profile_id` and `api_credentials.partner_id` for the minimal change,
but prevent them from disagreeing with the managed association.

Preferred database constraint:

1. Add a unique key on `partner_managed_profiles(profile_id, partner_id)`.
2. Add a nullable composite foreign key from
   `api_credentials(profile_id, partner_id)` to that key.
3. Use `ON DELETE RESTRICT`; credentials must be revoked/retired before removing the
   association.

Because a composite foreign key is not checked when `partner_id` is null, self-service
credentials remain valid without a managed association. A non-null partner credential
can only reference the partner that manages that profile.

If the deployed PostgreSQL/Sequelize combination cannot express the composite foreign key
reliably, retain the unique association and enforce the same relationship transactionally
at creation plus on every credential validation. Do not fall back to checking only that
the profile and partner independently exist.

## Proposed internal API contract

### Provision a headless profile

Keep the admin-only endpoint but change its request:

```http
POST /v1/admin/managed-profiles
Authorization: Bearer <ADMIN_SECRET>
Content-Type: application/json
```

Individual/business request:

```json
{
  "partnerId": "partner-uuid",
  "externalUserId": "partner-customer-4821",
  "subjectType": "business",
  "customerEntityId": "existing-customer-entity-uuid"
}
```

Technical request:

```json
{
  "partnerId": "partner-uuid",
  "externalUserId": "treasury-service",
  "subjectType": "technical"
}
```

Response:

```json
{
  "managedProfile": {
    "id": "association-uuid",
    "profileId": "headless-profile-uuid",
    "partnerId": "partner-uuid",
    "externalUserId": "partner-customer-4821",
    "subjectType": "business",
    "customerEntityId": "existing-customer-entity-uuid",
    "created": true
  }
}
```

Remove `email` and `claimedAt` from request and response.

Idempotency behavior:

- same partner, normalized external ID, subject type, and entity returns `200` with the
  existing association;
- changing subject type or entity for an existing association returns `409`;
- attaching an entity owned by another profile returns `409`;
- an inactive or missing partner is rejected;
- a technical request with an entity, or a customer request without one, returns `400`.

### Manage partner credentials

Do not accept an arbitrary profile UUID as sufficient authorization evidence. Change the
new, unreleased admin credential endpoints to identify the managed subject using the
partner route plus `externalUserId`, then resolve `profileId` server-side.

For example, retain the current route family while replacing `userId` with
`externalUserId` in create/list/revoke inputs. Every operation must resolve:

```text
partner route name
    -> active partner ID
    -> partner_managed_profiles(partner ID, normalized external user ID)
    -> profile ID
    -> api_credentials(profile ID, same partner ID)
```

This removes operator UUID copying and makes cross-partner issuance fail before credential
creation. These routes remain internal and are not added to public OpenAPI unless product
explicitly turns them into a partner-facing contract.

## Service behavior

### Headless provisioning transaction

Implement one transaction in the managed-profile service:

1. Validate and normalize request values.
2. Load the partner with `isActive = true`.
3. Lock/read the association by `(partner_id, external_user_id)`.
4. For an existing association, verify the immutable subject type and entity and return it.
5. For a customer subject, lock the requested customer entity and validate status, type,
   and current ownership.
6. Generate a profile UUID locally.
7. Insert the null-email profile.
8. Attach the entity to the profile and set it as the profile's active entity.
9. Insert the partner-managed association.
10. Commit and return the association. Any failure rolls back all database changes.

The service must not call Supabase, list Auth users, create Auth metadata, send email, or
attempt a compensating external rollback.

### Customer-entity resolution

Centralize managed-profile eligibility in the customer-entity service:

- self-service profiles retain the existing create/select behavior;
- managed customer profiles must use their already attached active entity and must not
  lazily create a blank individual entity;
- technical profiles return a stable `403 TECHNICAL_PROFILE_NOT_CUSTOMER_ELIGIBLE`;
- a managed customer profile missing its provisioned entity fails explicitly instead of
  silently creating one.

The ramp service may retain its technical check as defense in depth, but the central
customer-entity guard must protect provider/KYC, recipient, limits, and other paths that
do not pass through ramp registration.

### OTP authentication

Remove `markManagedProfileClaimed()` and the OTP controller call to it. OTP verification
continues upserting only the Supabase-authenticated self-service profile. There is no
conversion or merge behavior between an email login and a headless profile.

### Credential validation

For a non-null credential partner:

- require the partner to exist and be active for both public and secret validation;
- require the managed association to match credential `profile_id` and `partner_id`;
- return no credential context when the association is missing or inconsistent;
- preserve public/secret credential-ID mismatch checks and atomic revocation.

This applies consistently to public reads, secret operations, quote ownership, and ramp
registration.

## Manual provider/KYB import boundary

The headless-profile API does not perform KYC/KYB onboarding. Manual import is a separate
operational responsibility with a separate lifecycle.

A future Monerium import should materialize only the records required by Vortex runtime:

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
or complete provider payloads. Import only immutable provider references, normalized
state, minimal company display data needed by the product, and evidence timestamps.

Do not implement a production bulk importer until the actual Monerium source/export
contract and operator identity/audit requirements are provided. When those inputs exist,
use a provider-specific offline script with:

- JSON manifest schema validation;
- dry-run/preflight mode;
- idempotency by `(provider, provider_customer_id)`;
- rejection of a provider profile already attached to another entity;
- one transaction per manifest or explicitly documented batch;
- no destructive update of an existing approved binding;
- an operator-reviewed reconciliation report containing IDs and counts, not PII;
- focused tests using fixtures with synthetic company data.

The existing interactive Monerium OAuth endpoints remain Supabase-session-only. Manual
imports must not weaken their state, PKCE, email-match, token-custody, or profile-selection
invariants.

## Scope

### In scope for the implementation session

- nullable profile email for managed headless profiles;
- headless managed-profile schema/model/service/controller changes;
- removal of Supabase provisioning and claiming behavior;
- attachment of one existing entity during customer-profile provisioning;
- technical-profile eligibility enforcement in the customer-entity service;
- partner/profile relationship enforcement for credential management and validation;
- migration/preflight updates required by the changed profile model;
- focused API/model/service/integration tests;
- canonical architecture, security, API, skill, and operations documentation updates.

### Explicitly out of scope

- claimable managed identities or conversion to Supabase users;
- synthetic or placeholder login emails;
- a public or partner-facing KYC/KYB submission API for headless subjects;
- changing existing interactive provider onboarding routes to accept headless credentials;
- rebinding all credentials directly to customer entities;
- supporting one headless profile under multiple partners;
- automatically moving a provider customer between legal entities;
- guessing the Monerium bulk-import format;
- persisting Monerium OAuth credentials or raw KYB documents;
- renaming the repository-wide `User` model in the same change.

## Implementation sequence

### Phase 0: deployment and data gate

Before editing migrations, determine whether migrations 055, 057, or 058 have run in any
shared or production environment.

- If 057 has never run outside disposable development databases, revise it in place to
  create the final headless association and nullable-email shape.
- If 057 has run in a durable environment, do not rewrite history. Add a forward migration
  after 058 that removes `claimed_at`, makes profile email nullable, and introduces the
  relationship constraints after an explicit data preflight.
- Never delete Supabase users automatically from a database migration. If early managed
  identities exist, inventory them and handle Auth cleanup separately after proving they
  have no legitimate sessions or ownership.

**Gate:** the implementation PR states which branch of this migration strategy it used and
why.

### Phase 1: schema and models

- Update the profile email column and Sequelize type to nullable.
- Remove `claimed_at` from the managed-profile migration and model.
- Add the managed association/credential composite integrity constraint.
- Update startup/schema assertions to detect orphan null-email profiles and invalid
  partner credential bindings.
- Keep the existing RLS posture on all customer/credential tables.

**Gate:** database tests prove that a partner credential cannot reference an unrelated
profile and a self-service credential with null partner remains representable.

### Phase 2: headless provisioning service

- Replace the Supabase reconciliation service with the single database transaction above.
- Require an existing entity for individual/business subjects.
- Preserve idempotency and concurrency safety for partner/external-ID creation.
- Return no email or claim state.
- Remove claim handling from OTP verification.

**Gate:** tests prove no Supabase admin method is called and no partial profile/entity
attachment survives a failed transaction.

### Phase 3: central entity eligibility

- Update customer-entity resolution to distinguish self-service, managed customer, and
  technical profiles.
- Prevent lazy entity creation for managed profiles.
- Use stable public errors for technical or incompletely provisioned managed subjects.
- Retain ramp-level technical rejection as defense in depth.

**Gate:** representative Avenia, Alfredpay, Monerium/status, limits, recipient, and ramp
tests cannot create or select a customer entity for a technical profile.

### Phase 4: partner credential isolation

- Resolve managed subjects by partner and external ID in admin credential routes.
- Require active partners during creation and public/secret validation.
- Enforce the association at both database and service boundaries.
- Keep the five-active-credentials-per-profile limit and one-row public/secret lifecycle.

**Gate:** Partner B cannot create, list, revoke, validate, quote, or register with a
credential for Partner A's managed profile.

### Phase 5: migration tooling and production runbook

- Change credential migration preflight so every non-null partner/profile pair has the
  matching managed association.
- Provision/attach headless profiles before materializing partner credentials.
- Require manual inventory for legacy profiles and existing customer entities; never
  infer them from email, names, or provider display fields.
- Update the production cutover sequence and smoke tests.

**Gate:** the production manifest cannot migrate an ownerless, cross-partner, or
entity-less customer credential.

### Phase 6: documentation and contract synchronization

When implementation is complete:

1. Replace this proposal with `adr-0002-headless-partner-managed-profiles.md` containing
   the lasting decision and consequences.
2. Update `architecture-identity-model.md` to describe profiles as access principals,
   nullable profile/entity attachment, and the self-service/headless distinction.
3. Update `security-spec/01-auth/api-keys.md` and
   `security-spec/07-operations/api-surface.md` with the final invariants.
4. Update `security-spec/05-integrations/monerium.md` only if an import path is actually
   implemented; otherwise state no new Monerium behavior.
5. Update partner-facing authentication/quick-start docs to remove claimable-profile and
   mandatory managed-email claims.
6. Update the Vortex integration skill so it describes profile-linked headless
   credentials and does not direct operators through OTP for managed subjects.
7. Keep internal admin routes out of public OpenAPI unless they become a supported
   partner contract.
8. Update `docs/README.md` links and remove this proposal.

**Gate:** no canonical document still says managed profiles are Supabase identities or can
be claimed.

## Test plan

### Migration and model tests

- Multiple managed profiles may have null email; non-null email uniqueness remains.
- Null-email profiles without an association fail the schema/startup invariant.
- `claimed_at` is absent.
- `(partner_id, external_user_id)` and `profile_id` remain unique.
- A non-null credential partner/profile pair requires the matching association.
- Existing self-service credential rows remain valid.

### Managed-profile service tests

- Individual and business provisioning attaches the requested existing entity.
- Entity type mismatch, inactive/blocked entity, missing entity, and entity owned by
  another profile are rejected.
- Technical provisioning succeeds only without an entity.
- Repeating the exact request is idempotent.
- Repeating with a different entity or subject type returns conflict.
- Concurrent requests cannot create two profiles or attach one entity twice.
- Partner lookup requires `isActive = true`.
- No Supabase user, Auth metadata, email, or claim state is involved.

### Authentication and credential tests

- Self-service session credential creation remains unchanged.
- Admin credential creation resolves the managed profile from partner/external ID.
- Cross-partner creation/list/revocation is rejected.
- Inactive-partner public and secret keys both fail.
- Public and secret halves still resolve one credential ID and mismatch checks remain.
- Revocation and expiry still disable both values atomically.

### Entity and provider tests

- A managed customer profile resolves only its attached active entity.
- A technical profile cannot lazily acquire an entity through any provider/customer path.
- An entity-only imported Monerium company can exist with `profile_id = NULL` and approved
  provider/KYB records.
- Attaching that entity later preserves provider-customer and KYB record IDs.
- Interactive Monerium OAuth tests remain unchanged and session-only.
- Ramp registration succeeds for a nontechnical headless profile only after it owns the
  approved provider entity required by the corridor.

### Suggested verification commands

Run focused tests first, then repository checks appropriate to the touched workspaces:

```bash
cd apps/api
bun test managed-profile.service.test.ts
bun test apiCredential.service.test.ts
bun test api-credential-migration.test.ts
bun test auth.invariants.test.ts
bun test http-surface.invariants.test.ts

cd ../..
bun verify
bun typecheck
```

Add or update the exact focused commands if test files are renamed during implementation.

## Rollout and recovery

1. Inventory current managed associations, attached entities, provider records, Supabase
   identities, and credentials using immutable IDs only.
2. Resolve every legacy partner subject to an existing customer entity before issuing or
   migrating a ramp-capable credential.
3. Provision headless profiles and attach entities in a dry-run/reviewed batch.
4. Run credential migration preflight with the new association checks.
5. Backfill secret digests or reissue unavailable secrets as described in the credential
   rollout document.
6. Cut over during the documented credential maintenance window.
7. Smoke-test one self-service credential, one headless managed credential, sanitized
   ramp info, exact limits, quote ownership, ramp registration, partner isolation, and
   atomic revocation.
8. Monitor safe credential/profile IDs and error codes; never log key values, emails, tax
   references, or raw provider payloads.

Rollback must not recreate claimable Supabase managed identities or reactivate legacy key
halves. Correct data associations or roll forward with a repaired release.

## Acceptance criteria

The change is complete when:

- managed-profile creation takes no email and performs no Supabase operation;
- managed profiles cannot be claimed or authenticated by OTP;
- every null-email profile has one immutable partner-managed association;
- manually imported customer entities may exist without profiles;
- customer headless profiles attach to an existing matching entity without duplicating
  provider customers or KYC/KYB cases;
- technical profiles cannot acquire customer entities or register ramps;
- every non-null partner credential is constrained to the same partner/profile association;
- partner credential management resolves the subject from partner plus external ID rather
  than trusting an arbitrary profile UUID;
- self-service signup, OTP, entity selection, and credentials remain behaviorally intact;
- no interactive provider onboarding route was broadened for headless credentials;
- migration tooling and the production runbook reject ambiguous or cross-partner data;
- tests cover the security and idempotency invariants above;
- the proposal is replaced by an ADR and all canonical docs describe the implemented
  model consistently.

## Inputs required before a bulk Monerium importer

The headless profile work is not blocked by these inputs. A later importer must not be
implemented by guessing them:

- the actual Monerium export/API source format;
- which Monerium corporate/profile ID is the immutable deduplication key;
- the authoritative mapping from provider state to Vortex verification status;
- which company display fields Vortex needs at runtime;
- evidence timestamps and the operator/audit identity to record;
- expected batch size and transaction/retry requirements;
- the secure location and retention policy for the source data.
