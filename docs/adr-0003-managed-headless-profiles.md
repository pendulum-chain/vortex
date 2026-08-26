# ADR 0003: Managed Headless Profiles

Status: accepted. Implemented by migration 063 and the managed-profile API and
authorization services.

## Context

Approved Vortex profiles need to create and operate customer profiles without creating a
Supabase login for every customer. The design must preserve existing profile ownership,
customer entities, provider records, credentials, pricing, and ramp authorization rather
than introduce a parallel tenant or impersonation model.

## Decision

- A headless customer is a normal `profiles` row with immutable `kind = managed`, a null
  login email, no Supabase identity, exactly one active customer entity, and exactly one
  retained manager relationship.
- The child owns its customer entity, provider records, credentials, quotes, and ramps.
  The manager is the authenticated actor for delegated requests and never becomes the
  resource owner.
- A manager authenticates with its existing Supabase session or profile-bound secret API
  credential. `X-Managed-Profile-Id` is only a route-authorized selector; it never replaces
  the authenticated actor. A child credential authenticates directly as its child.
- Vortex configures each manager's active state and allowed corridors. Nullable
  `allowedCustomerTypes` is an optional narrowing: null permits every customer type that
  the canonical corridor capability matrix supports; a non-null value permits only its
  non-empty subset. It never expands the canonical matrix.
- Provisioning creates an `individual` or `business` child, active entity, immutable
  external subject ID, normalized provider contact email, and relationship atomically.
  A managed child defaults to its controlling manager profile's pricing assignment. The
  child may have its own profile pricing assignment, administered like any regular
  profile assignment, which takes precedence over the manager assignment.
- Deletion is logical and idempotent. It revokes child credentials and blocks new child
  activity while retaining provider, compliance, quote, ramp, callback, and attribution
  records needed for in-flight processing and reconciliation.
- Nested management, manager transfer, generic impersonation, operation-specific
  permission matrices, and durable differentiation between delegated-manager and direct
  child-credential requests are outside the accepted design.

## Consequences

Manager, relationship, corridor, and customer-type policy is re-evaluated for new
authorization decisions; a committed policy change does not cancel already-authorized
requests. Historical and status reads remain available where reconciliation requires
them. Email-bound Mykobo operations, Monerium OAuth KYC/KYB onboarding, and recipient
invitations are not delegated. Future Monerium import handling is outside this decision. A
non-technical child may use the direct-API Monerium onramp only after its provider binding and
Polygon EOA/IBAN have been provisioned through a separate trusted process.

The accepted Alfredpay cross-manager email-identity exception is tracked as RISK-019 in
the [security risk register](security-spec/RISK-REGISTER.md). Normative behavior is defined by
[API credential authentication](security-spec/01-auth/api-keys.md),
[API surface](security-spec/07-operations/api-surface.md), and the provider specifications.
