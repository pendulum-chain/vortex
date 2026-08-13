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
  Pricing is resolved from the child and remains independent of management.
- Deletion is logical and idempotent. It revokes child credentials and blocks new child
  activity while retaining provider, compliance, quote, ramp, callback, and attribution
  records needed for in-flight processing and reconciliation.
- Nested management, manager transfer, generic impersonation, operation-specific
  permission matrices, and durable differentiation between delegated-manager and direct
  child-credential requests are outside the accepted design.

## Consequences

Manager, relationship, corridor, and customer-type policy is re-evaluated for new
authorization decisions; a committed policy change does not cancel already-authorized
requests. Historical and status reads remain available where reconciliation requires them.
Sender-side recipient operations are delegated to the child's sender entity, with invite creation
constrained by current manager corridor policy and privileged invite discounts constrained by the
manager actor's role. Invite preview and acceptance remain bearer-invitee operations and reject
managed selection. Email-bound Mykobo and Monerium operations remain unsupported.

The accepted Alfredpay cross-manager email-identity exception is tracked as RISK-019 in
the [security risk register](security-spec/RISK-REGISTER.md). Normative behavior is defined by
[API credential authentication](security-spec/01-auth/api-keys.md),
[API surface](security-spec/07-operations/api-surface.md), and the provider specifications.
