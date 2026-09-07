# ADR 0005: Managed-Profile Memberships

Status: accepted. Partially supersedes ADR 0003's exactly-one-manager authorization
model and its exclusion of operation-specific permissions. It preserves ADR 0003's
headless child, immutable owner, policy, pricing, namespace, and lifecycle decisions.

## Context

A managed profile represents one company or customer identity that may need access from
more than one authenticated person. The original model stores exactly one
`managed_profiles.manager_profile_id`; treating that field as a mutable team member or
copying a child for every operator would break pricing provenance, provider identity,
credential ownership, and retained financial history.

Global `profile_roles` are also the wrong scope. `vortex_admin` and
`discount_manager` describe platform-wide capabilities, while access to a managed child
must be granted independently for each child.

## Decision

- Keep `managed_profiles.manager_profile_id` immutable and reinterpret it as the child's
  owner and policy principal. The owner continues to supply corridor/customer-type
  policy, pricing fallback, provider-contact namespace, provisioning authority, and
  logical deletion authority.
- Add active, revocable memberships from authenticated profiles to one managed child.
  Membership roles are exactly `manager` and `read_only`; they are not stored in
  `profile_roles`.
- Backfill every retained managed-profile relationship with an active owner `manager`
  membership. New provisioning creates that membership and an append-only
  `member_added` event in the provisioning transaction.
- Protect the owner membership from downgrade or removal. Any active manager may invite,
  change, or remove a non-owner member, but only the owner may create sibling children or
  delete the child.
- Authorize delegated routes by a server-owned capability classification rather than HTTP
  method: `read`, `manage`, `credential_manage`, or `ramp`. Unknown roles and unclassified
  routes fail closed.
- Allow both roles to read the documented child surfaces. Allow `manager` to mutate child
  resources; deny every mutation to `read_only`, including when it presents its own secret
  credential.
- Require a secret API credential for selected-child provider/KYC/KYB mutations and ramp
  register/update/start. Supabase dashboard bearer sessions are denied immediately, with
  no grandfathered ramp exception. Child-owned credentials remain independent shared
  company principals with their existing supported capabilities.
- Use email invitations with a seven-day lifetime and explicit acceptance. The invitation
  UUID is a locator, not authentication. Preview and acceptance require the exact current,
  verified, normalized Supabase email; OTP verification alone does not accept an invite.
- Record invitation and membership state changes in an append-only event table in the same
  transaction. Serialize lifecycle mutations with the common owner-then-child lock order.
- Permit direct-recipient email only for the managed-profile invitation notification type.
  All existing notification types remain profile-addressed and preference-gated.

## Consequences

The child stays the owner of provider records, credentials, quotes, ramps, recipients, and
financial history. Membership changes alter future authorization decisions but do not
rewrite child ownership or revoke child-owned credentials. Managers must explicitly revoke
shared child credentials when their distribution is no longer trusted.

The dashboard gains child-scoped Team and API-key surfaces. It removes all selected-child
transfer initiation because browser sessions cannot satisfy the credential requirement.
KYC/KYB remains read-only in child dashboard mode.

Membership and invitation storage is hidden from PostgREST through RLS and privilege
revocation. Application APIs expose only scoped projections and stable error codes.

No generic organization/workspace abstraction, nested child management, owner transfer,
custom roles, per-member corridor grants, or automatic OTP-time acceptance is introduced.

## Specifications

- [Identity architecture](architecture-identity-model.md)
- [Dashboard product behavior](product-dashboard.md)
- [Managed-profile membership security](security-spec/01-auth/managed-profile-memberships.md)
- [API credential security](security-spec/01-auth/api-keys.md)
- [Public managed-profile API](api/pages/14-managed-profiles.md)
