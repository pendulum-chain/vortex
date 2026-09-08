# ADR 0003: Managed Headless Profiles

Status: partially superseded by
[`ADR 0005`](adr-0005-managed-profile-memberships.md). Migration 063's headless child,
immutable owner, policy, pricing, namespace, and lifecycle decisions remain accepted;
ADR 0005 replaces the exactly-one-manager authorization decision;
[`ADR 0006`](adr-0006-organization-wide-teams.md) supersedes its child-scoped membership
decisions with organization-wide teams under the one-account-one-org approximation.

## Context

Approved Vortex profiles need to create and operate customer profiles without creating a
Supabase login for every customer. The design must preserve existing profile ownership,
customer entities, provider records, credentials, pricing, and ramp authorization rather
than introduce a parallel tenant or impersonation model.

## Decision

- A headless customer is a normal `profiles` row with immutable `kind = managed`, a null
  login email, no Supabase identity, exactly one active customer entity, and exactly one
  retained owner relationship.
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
- Nested management, owner transfer, generic impersonation, and durable differentiation
  between delegated-member and direct child-credential requests remain outside the
  accepted design. ADR 0005 introduces the capability matrix that this ADR originally
  excluded; ADR 0006 changes membership scope, not those capability restrictions.

## Consequences

Manager, relationship, corridor, and customer-type policy is re-evaluated for new
authorization decisions; a committed policy change does not cancel already-authorized
requests. Historical and status reads remain available where reconciliation requires them.
Sender-side recipient operations are delegated to the child's sender entity, with invite creation
constrained by current manager corridor policy and privileged invite discounts constrained by the
manager actor's role. Invite preview and acceptance remain bearer-invitee operations and reject
managed selection. Email-bound Mykobo and Monerium operations remain unsupported. Their legacy
routes ignore `X-Managed-Profile-Id` and remain scoped to the authenticated manager, so managed
clients must not send the selector to them.

The accepted Alfredpay cross-manager email-identity exception is tracked as RISK-019 in
the [security risk register](security-spec/RISK-REGISTER.md). Normative behavior is defined by
[API credential authentication](security-spec/01-auth/api-keys.md),
[API surface](security-spec/07-operations/api-surface.md), and the provider specifications.
