# Proposal: Managed Headless Profiles

Status: proposed. This document records the agreed product shape and the smallest likely
implementation. Exact API contracts and provider-specific KYC/KYB work remain design
decisions. Last updated: 2026-08-06.

Related decisions and specifications:

- [`ADR 0001: User-Gated Ramp Registration`](adr-0001-user-gated-ramp-registration.md)
- [`Identity, Customer, and Partner Model`](architecture-identity-model.md)
- [`API Credential Authentication`](security-spec/01-auth/api-keys.md)
- [`Admin Authentication`](security-spec/01-auth/admin-auth.md)
- [`Monerium Integration`](security-spec/05-integrations/monerium.md)
- [`API Credential Production Rollout`](operations-api-credential-rollout.md)
- [PR #1298](https://github.com/pendulum-chain/vortex/pull/1298)

## Objective

Allow an approved Vortex profile, called a **manager**, to create and control headless
customer profiles without Vortex approving each customer.

Vortex enables the manager and chooses the corridors in which it may operate. After that,
the manager may create customers, run supported KYC/KYB, manage credentials, and operate
ramps on demand within those corridors.

Vortex may also create a headless profile for a manager and deliver control of it to that
manager. Both creation paths produce the same records and capabilities.

The parallel design objective is minimum change: reuse profiles, customer entities, API
credentials, provider integrations, and ramp ownership. Add only the relationship and
authorization needed for delegated control.

## Core model

```text
manager profile
    -> manager enablement and allowed corridors
    -> managed_profiles relationship
        -> headless profile (profiles.kind = managed, profiles.email = NULL)
            -> its customer_entity (individual or business)
                -> provider_customers
                -> kyc_cases
            -> child-owned quotes, ramps, and webhooks
```

A headless profile is a normal `profiles` row with `kind = managed` and `email = NULL`.
The explicit kind prevents email nullability from becoming an authorization or lifecycle
signal. It has no Supabase Auth identity, email login, OTP flow, or claiming lifecycle.
Its unique `managed_profiles` row identifies its manager. No second headless-user model
is needed.

The child has its own `customer_entities` row. Customer type, provider accounts, KYC/KYB
cases, and provider status belong to that child entity, never to the manager's entity.

## Decisions and invariants

### Identity and ownership

- A manager and child are separate profiles.
- One manager may control many headless profiles.
- One headless profile has exactly one manager.
- Every managed headless profile has `profiles.kind = managed`; authenticated profiles
  cannot be attached as managed children.
- A profile cannot manage itself, and nested management is not supported.
- The child profile remains the owner of its customer entity, credentials, quotes, ramps,
  provider records, and webhooks.
- The manager is the actor for delegated operations; it does not become the owner of the
  child's runtime records.
- Headless profiles cannot log in or later be converted into Supabase users.

### Authentication and delegated authorization

A manager authenticates as itself through a supported API-key path. No dedicated manager
credential is required: any credential whose subject is the manager may be used when its
key strength is sufficient for the requested operation, whether it is profile-managed and
self-created or partner-managed. A delegated request also identifies the managed child
that is the subject of the operation:

```text
authenticated profile = manager
operation profile     = managed headless child
operation entity      = child's active customer entity
```

Authorization must verify all of the following:

1. The manager is enabled.
2. The child is active and directly linked to that manager.
3. The requested corridor is enabled for the manager when the operation is corridor-bound.
4. The requested operation is part of the explicit control list below.

One central delegated-authorization function performs these checks and returns a request
context containing both `actorProfileId` and `subjectProfileId`. Downstream services use
the subject for ownership and provider resolution while retaining the actor for audit.

The minimum safe implementation reuses the existing child-oriented services with two
separate request-context values:

```text
authenticatedManagerProfileId = managerId
effectiveUserId                = childId
```

Authorization uses the authenticated manager and its direct relationship to the child.
Existing ownership and provider resolution use the effective child. Both values remain
available for audit attribution; the effective child must never erase the manager actor.
The implementation must not replace the authenticated manager ID globally or introduce
a generic impersonation mode.

Manager sessions are not required for the first implementation. Supporting existing API
credentials keeps the delegated surface smaller; session support can be added if a manager
dashboard becomes a real requirement.

### Manager control

An enabled manager may perform these operations for its directly managed children:

- create, list, and read headless profiles;
- logically delete a headless profile;
- create provider customers and fiat accounts through supported integrations;
- start, submit, update, and read customer-level KYC/KYB operations;
- upload KYC/KYB documents through supported provider flows;
- create quotes and register, update, start, and read ramps;
- read the child's ramp history and operational errors.

KYC/KYB control means the operations normally available to that customer. It does not
allow a manager to approve KYC, override provider decisions, edit normalized compliance
state directly, or use Vortex-admin import and reconciliation operations.

A manager cannot access another manager's child, transfer a child to another manager, or
perform an operation outside its enabled corridors.

### Credentials in the first iteration

The first iteration uses existing API credentials whose subject is the manager; it does not
introduce a special manager credential type. Profile-managed credentials, including ones
self-created by the manager, and partner-managed credentials are both eligible. The
credential's public or secret strength must still satisfy the existing requirement for the
requested operation. The manager selects an authorized child through delegated request
context. Managers do not create child API credentials in this iteration. This keeps one
authorization path while the delegated model is introduced.

Child-owned credentials may be added when a concrete integration needs per-child key
isolation. Before that feature ships, each child credential must be linked to the managed
relationship, denied whenever the manager, relationship, or corridor is inactive, and
revoked when the child is logically deleted. It must not provide a second path around
manager authorization.

### Corridor authorization

Vortex enables a manager for an explicit set of corridors, for example BRL only. The
permission is checked when starting KYC/KYB, creating provider or fiat accounts, and
creating or mutating ramps.

Profile listing, credential revocation, logical deletion, and historical reads are not
blocked by corridor removal. Removing a corridor must:

- block new KYC/KYB and provider-account mutations in that corridor;
- block new ramp registration and start operations in that corridor;
- allow already-started ramps to finish through background processing;
- preserve read access needed for support and reconciliation.

Quote creation may remain available for rate discovery. A delegated quote associated
with a child resolves ownership and pricing from that child. Ramp registration and start
always re-check the active manager, relationship, child, and corridor rather than treating
the quote as authorization evidence.

### Deletion

Deleting a headless profile is a logical lifecycle operation, not physical erasure. It
must:

- atomically mark the managed relationship and child profile unavailable for new
  operations before any concurrent mutation can begin;
- revoke any active child API credentials, including credentials created before this
  proposal or added by a future iteration;
- reject future manager and child mutations;
- preserve customer, provider, KYC/KYB, ramp, and audit records;
- allow already-started ramps to finish;
- allow trusted provider callbacks and background reconciliation to update retained
  records;
- avoid automatically deleting provider-side customer records.

Physical deletion requires separate legal-retention and provider-deletion requirements
and is not part of this proposal.

### Pricing

Pricing remains independent from management:

- manager and child may have different profile pricing assignments;
- a manager credential does not select the child's pricing;
- delegated quotes resolve pricing from the child operation profile;
- the quote stores the resolved price and fee breakdown for its validity window;
- no pricing-plan identifier is accepted from the delegated request.

The broader cleanup that renames the overloaded partner pricing subsystem may proceed
separately. It is not required to establish managed-profile control.

## Minimum schema

### `profiles`

Add an explicit profile kind and make `profiles.email` nullable:

```text
profiles
    kind    authenticated | managed
```

Existing profiles are `authenticated`. A managed profile must have `email = NULL` and
exactly one `managed_profiles` row. Provisioning creates the profile and relationship in
one transaction, and migrations or startup validation must reject orphan managed
profiles. Email nullability alone does not grant managed capabilities.

### Manager enablement

Add one small manager configuration table:

```text
managed_profile_managers
    profile_id          PK, FK -> profiles.id
    allowed_corridors   corridor[]
    is_active
    created_at
    updated_at
```

This capability is not a profile role and is not inferred from customer type, pricing, or
credential possession. Vortex alone creates and updates manager enablement.

An array is the minimum representation while every allowed corridor grants the same
control set. Introduce normalized per-corridor permission rows only if different corridors
need different capabilities.

### `managed_profiles`

Create `managed_profiles`, or reshape the existing `partner_managed_profiles` table when
deployment history permits:

```text
managed_profiles
    id
    manager_profile_id  FK -> managed_profile_managers.profile_id
    profile_id          FK -> profiles.id
    external_subject_id NOT NULL
    status              active | deleted
    creation_source     manager | vortex
    created_at
    updated_at
    deleted_at
```

Required constraints:

```text
UNIQUE (profile_id)
UNIQUE (manager_profile_id, external_subject_id)
CHECK (manager_profile_id <> profile_id)
```

The manager and external subject ID provide ownership provenance and idempotency. A
separate free-form source namespace is unnecessary for manager-created profiles. If a
future provider import needs additional provenance, add it only to that import contract.

Do not duplicate `customer_entity_id` on `managed_profiles`. The child profile and its
active `customer_entities` relationship already identify the compliance subject.

## Lifecycles

### Manager-initiated creation

Prerequisite: Vortex has enabled the manager and configured its allowed corridors.

```text
manager authenticates through a supported API-key path
    -> requests a child using its external subject ID and customer type
    -> Vortex verifies manager enablement and requested corridor
    -> one transaction creates:
        profiles row with kind = managed and email = NULL
        customer_entities row owned by the child profile
        profiles.active_customer_entity_id link
        managed_profiles row with creation_source = manager
    -> manager starts supported KYC/KYB for an allowed corridor
    -> after approval, manager creates and operates child ramps
```

The same `(manager_profile_id, external_subject_id)` request is idempotent. Reuse by a
different manager is a separate namespace; reuse by the same manager with conflicting
customer data returns a conflict.

### Vortex-initiated creation and delivery

Vortex may create a new child or associate reviewed imported customer/provider records
with a new headless profile:

```text
Vortex selects an enabled manager
    -> Vortex creates or imports the customer's compliance records
    -> the same provisioning service creates the null-email profile, child entity links,
       and managed_profiles row with creation_source = vortex
    -> the association delivers control to the manager
    -> the child appears in the manager's profile list
    -> the manager continues KYC/KYB and ramp operations within its corridors
```

Delivery is the committed `managed_profiles` association, not transfer of a Supabase
account or a shared Vortex-admin credential. No claiming or email flow occurs.

### Delegated operation

```text
manager API credential authenticates manager
    -> request identifies child
    -> authorization verifies direct relationship and active manager
    -> corridor-bound operations verify manager corridor permission
    -> service resolves the child's active customer entity
    -> operation executes and persists resources under the child profile
    -> audit records manager actor and child subject
```

### Logical deletion

```text
manager requests deletion of its child
    -> authorization verifies direct relationship
    -> reject or explicitly handle ramps not yet started
    -> transactionally mark managed profile deleted and revoke any child credentials
    -> block new KYC/KYB and ramp mutations
    -> retain records and allow already-started ramp processing
```

## Minimum implementation changes

1. Add the two tables above, add the profile kind, and make profile email nullable.
2. Replace the current partner-managed-profile association with the manager-to-child
   relationship without adding another user model.
3. Add one provisioning service used by both Vortex-admin and manager-initiated creation.
4. Add narrow delegated authorization that returns manager actor and child subject IDs.
5. Add manager-facing profile lifecycle endpoints.
6. Allow delegated authorization on the existing provider/KYC, fiat-account, quote, and
   ramp operations included in the control list.
7. Enforce manager state and corridor permission for manager credentials.
8. Implement serialized logical deletion and revocation of any existing child credentials
   without deleting financial or compliance history.
9. Add focused tests for cross-manager isolation, corridor denial, idempotent provisioning,
   deletion races, actor/subject ownership, and child pricing resolution.
10. Update the API contract and relevant authentication, provider, ramp, and audit-facing
    security specifications with the final routes and invariants.

Avoid a general tenant system, organization memberships, permission matrices, arbitrary
impersonation, credential scopes, or a second headless identity model until a concrete
requirement needs one.

## Follow-up capabilities

The following are intentionally outside the first iteration and should be introduced only
when a concrete integration requires them:

- child-owned API credential issuance and its relationship-bound revocation rules;
- normalized per-corridor grant rows or operation-specific permissions;
- manager credential scopes or separate management and runtime credentials;
- manager dashboard sessions;
- suspended, quarantined, or transferable managed-profile states;
- broader pricing subsystem renaming or assignment administration.

## Acceptance criteria

- Vortex can enable a manager for selected corridors.
- An enabled manager can create headless profiles without per-customer Vortex approval.
- Vortex can create a headless profile and deliver it to an enabled manager.
- Every headless profile has `kind = managed`, a null email, one manager, and one child
  customer entity.
- Manager credentials can perform only the defined child operations and corridors.
- Managers cannot access each other's children.
- KYC/KYB and provider records belong to the child's customer entity.
- Quotes and ramps remain owned by the child profile and use the child's pricing.
- Logical deletion blocks concurrent new activity, revokes any existing child credentials,
  preserves required compliance and financial history, and does not block trusted
  callbacks for in-flight work.
