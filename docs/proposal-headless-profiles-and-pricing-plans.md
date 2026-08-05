# Proposal: Managed Headless Profiles

Status: proposed. This document records the agreed product shape and the smallest likely
implementation. Exact API contracts and provider-specific KYC/KYB work remain design
decisions. Last updated: 2026-08-05.

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
        -> headless profile (profiles.email = NULL)
            -> its customer_entity (individual or business)
                -> provider_customers
                -> kyc_cases
            -> optional child API credentials
            -> child-owned quotes, ramps, and webhooks
```

A headless profile is a normal `profiles` row with `email = NULL`. It has no Supabase Auth
identity, email login, OTP flow, or claiming lifecycle. Its unique `managed_profiles` row
identifies its manager and completes the definition of a managed headless profile. No
second headless-user model is needed.

The child has its own `customer_entities` row. Customer type, provider accounts, KYC/KYB
cases, and provider status belong to that child entity, never to the manager's entity.

## Decisions and invariants

### Identity and ownership

- A manager and child are separate profiles.
- One manager may control many headless profiles.
- One headless profile has exactly one manager.
- A profile cannot manage itself, and nested management is not supported.
- The child profile remains the owner of its customer entity, credentials, quotes, ramps,
  provider records, and webhooks.
- The manager is the actor for delegated operations; it does not become the owner of the
  child's runtime records.
- Headless profiles cannot log in or later be converted into Supabase users.

### Authentication and delegated authorization

A manager authenticates as itself with a secret API credential. A delegated request also
identifies the managed child that is the subject of the operation:

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

The operation executes for the child, so existing services may need to treat the child as
the effective profile for ownership and provider resolution. The manager must still be
preserved as the authenticated actor used to authorize and audit the delegated operation.

The minimum safe implementation reuses the existing child-oriented services with two
separate request-context values:

```text
authenticatedManagerProfileId = managerId
effectiveUserId                = childId
```

Authorization uses the authenticated manager and its direct relationship to the child.
Existing ownership and provider resolution use the effective child. Both values remain
available for audit attribution; the effective child must never erase the manager actor.

Manager sessions are not required for the first implementation. Supporting only secret
API credentials keeps the delegated surface smaller; session support can be added if a
manager dashboard becomes a real requirement.

### Manager control

An enabled manager may perform these operations for its directly managed children:

- create, list, and read headless profiles;
- logically delete a headless profile;
- create, list, and revoke child API credentials;
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

### Child API credentials

The manager may optionally create credentials owned by a child profile. Such a credential
authenticates directly as the child; it is not a manager credential and cannot operate
another child.

Managed-child corridor restrictions apply even when a child credential is used directly.
Otherwise a manager could create a child credential and use it to bypass its own corridor
permissions.

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

Whether quote creation is blocked or remains available for rate discovery is still an
API-product decision. Registration and execution must always enforce the corridor.

### Deletion

Deleting a headless profile is a logical lifecycle operation, not physical erasure. It
must:

- mark the managed relationship and child profile unavailable for new operations;
- revoke active child API credentials;
- reject future manager and child mutations;
- preserve customer, provider, KYC/KYB, ramp, and audit records;
- allow already-started ramps to finish;
- avoid automatically deleting provider-side customer records.

Physical deletion requires separate legal-retention and provider-deletion requirements
and is not part of this proposal.

### Pricing

Pricing remains independent from management:

- manager and child may have different profile pricing assignments;
- a manager credential does not select the child's pricing;
- delegated quotes resolve pricing from the child operation profile;
- no pricing-plan identifier is accepted from the delegated request.

The broader cleanup that renames the overloaded partner pricing subsystem may proceed
separately. It is not required to establish managed-profile control.

## Minimum schema

### `profiles`

Make `profiles.email` nullable. A null-email profile must have exactly one
`managed_profiles` row; no route may create an orphan null-email profile.

Do not add a profile-kind column. The null email plus managed relationship is the headless
profile discriminator.

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
    external_subject_id
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
manager authenticates with secret API credential
    -> requests a child using its external subject ID and customer type
    -> Vortex verifies manager enablement and requested corridor
    -> one transaction creates:
        profiles row with email = NULL
        customer_entities row owned by the child profile
        profiles.active_customer_entity_id link
        managed_profiles row with creation_source = manager
    -> optional child API credential is created and returned once
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
    -> Vortex or the manager optionally creates a child API credential
    -> the manager continues KYC/KYB, credential, and ramp operations within its corridors
```

Delivery is the committed `managed_profiles` association, not transfer of a Supabase
account or a shared Vortex-admin credential. No claiming or email flow occurs.

### Delegated operation

```text
manager secret credential authenticates manager
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
    -> mark managed profile deleted
    -> revoke child credentials
    -> block new KYC/KYB and ramp mutations
    -> retain records and allow already-started ramp processing
```

## Minimum implementation changes

1. Add the two tables above and make profile email nullable.
2. Replace the current partner-managed-profile association with the manager-to-child
   relationship without adding another user model.
3. Add one provisioning service used by both Vortex-admin and manager-initiated creation.
4. Add narrow delegated authorization that returns manager actor and child subject IDs.
5. Add manager-facing profile and child-credential lifecycle endpoints.
6. Allow delegated authorization on the existing provider/KYC, fiat-account, quote, and
   ramp operations included in the control list.
7. Enforce manager state and corridor permission for manager credentials and direct child
   credentials.
8. Implement logical deletion and child credential revocation without deleting financial
   or compliance history.
9. Add focused tests for cross-manager isolation, corridor denial, child-key bypass,
   idempotent provisioning, deletion, and actor/subject ownership.
10. Update the API contract and relevant authentication, provider, ramp, and audit-facing
    security specifications with the final routes and invariants.

Avoid a general tenant system, organization memberships, permission matrices, arbitrary
impersonation, credential scopes, or a second headless identity model until a concrete
requirement needs one.

## Acceptance criteria

- Vortex can enable a manager for selected corridors.
- An enabled manager can create headless profiles without per-customer Vortex approval.
- Vortex can create a headless profile and deliver it to an enabled manager.
- Every headless profile is a null-email profile with one manager and one child customer
  entity.
- Manager credentials can perform only the defined child operations and corridors.
- Optional child credentials cannot bypass manager or corridor restrictions.
- Managers cannot access each other's children.
- KYC/KYB and provider records belong to the child's customer entity.
- Quotes and ramps remain owned by the child profile and use the child's pricing.
- Logical deletion blocks new activity, revokes child credentials, and preserves required
  compliance and financial history.
