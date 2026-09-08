# ADR 0006: Organization-Wide Teams

Status: accepted. Supersedes ADR 0005's child-scoped membership, invitation, Team,
and owner-membership provisioning decisions. Preserves its immutable child ownership,
capability restrictions, credential independence, verified acceptance, audit/outbox, and
RLS invariants, as well as ADR 0003's headless identity and lifecycle decisions.

## Context

A team operates all customers of one owning manager account, not a separately assigned
roster for each customer. Child-scoped grants obscure that scope and prevent team setup
before the first customer exists. The prior per-profile feature has never been deployed;
its data is disposable and its API is unshipped.

## Decision

- Exactly one owning manager account/configuration defines exactly one organization.
  This is a **one-account-one-org approximation**, not a general organization entity model.
  Every person, including owners, invited managers, and read-only members, has at most one
  active organization affiliation. Owners, including owners of disabled configurations,
  cannot join another organization.
- Rewrite unshipped migration 069 directly. Keep the existing membership, invitation, and
  event table names and internal class filenames; replace their `managed_profile_id` scope
  with `owner_profile_id` referencing `managed_profile_managers.profile_id`. Enforce one
  active membership globally by `member_profile_id`, not by owner/member pair alone.
- Backfill one protected owner self-membership with role `manager` per manager configuration,
  including disabled configurations and configurations with no children. New manager
  configuration creation writes this membership and its event once. Child provisioning
  creates no membership grants or membership events.
  Config-created `createdByProfileId` and event `actorProfileId` are null/system-attributed:
  `ADMIN_SECRET` identifies no human actor; the owner remains the member subject.
- A live organization `manager` or `read_only` role applies to all present and future children
  of that owner. It does not share any human member's personal resources. Child DTOs retain
  effective `membership: { role, isOwner }`; global `profile_roles` remain separate.
- Managers administer non-owner team members and supported child resources/credentials.
  Only the owner provisions/deletes children, reads retained deleted children, and controls
  owner policy through existing configuration administration. Membership grants no policy,
  pricing, global-role, or lifecycle authority. Read-only grants no writes, even with a
  personal secret credential. Existing read/manage/credential_manage/ramp restrictions remain.
- Organization discovery, team, and invitee APIs require a human Supabase bearer session;
  reject any child selector, API/public-key header (even with a bearer), and impersonation.
  Replace the old per-child team paths without aliases. Team belongs in the main nonacting
  dashboard and works before the organization has children.
- Require UUID query `expectedOwnerProfileId` on the seven scoped Team operations, including
  item PATCH/DELETE; exempt discovery and invitee locator routes. This binds displayed-org
  intent, not authority or multi-org selection. The server derives the current org and keeps
  live service authorization; missing/malformed input is `400 MANAGED_PROFILE_INVALID_INPUT`,
  while a different expected/current owner is `409 ORGANIZATION_CONTEXT_CHANGED`. A stale
  dialog opened in A cannot silently operate in B after the actor's affiliation changes.
- Active owner configuration is required for organization/team operations and child access.
  Deactivation retains memberships but denies operations; it does not free an affiliation.
  `hasMemberships` means live organization membership even with zero children;
  `canProvisionManagedProfiles` remains owner-only. Neither depends on list pagination.
- Invitations are durable organization offers, not the inviter's continuing personal grant.
  Removing or downgrading the inviter does not cancel a pending offer. Exact current verified
  email, explicit acceptance, seven-day expiry, transactional events/outbox, idempotency,
  owner protection, and RLS remain required. Second-org acceptance returns
  `409 ORGANIZATION_MEMBERSHIP_CONFLICT`; concurrent accepts cannot bypass global uniqueness.
- Removing or downgrading a member changes delegated access to every child. It does not
  revoke child-owned shared API credentials. Explicit credential revocation remains necessary
  when a departing member possessed a secret. Keep the email discriminator
  `managed_profile_membership_invitation` and its existing internal producer/template names.

## Consequences

This is an intentional breaking replacement of an unshipped API, not a migration of shipped
per-child grants. No compatibility aliases, dual schema, or forward migration are required.
Local disposable databases must be recreated if they applied the old 069. The shared/SDK
typed surface is not expected to change; OpenAPI and its generated declarations do change.

Child ownership, compliance identity, provider records, credentials, quotes, ramps, recipients,
and financial history remain child-owned. Team roles express organization-wide authorization,
never ownership of a human's personal account or a transfer of a child's controlling owner.

Multi-organization management, organization kinds, owner transfer, and an organization switcher
are **not supported**. Adding any of them requires explicitly revisiting this architectural
model in a later ADR. They cannot be introduced by silently reinterpreting membership rows.

## Specifications

- [Identity architecture](architecture-identity-model.md)
- [Dashboard product behavior](product-dashboard.md)
- [Organization membership security](security-spec/01-auth/managed-profile-memberships.md)
- [Public organization and managed-profile API](api/pages/14-managed-profiles.md)
- [Email architecture](architecture-email-notifications.md)
- [Testing strategy](operations-testing.md)
