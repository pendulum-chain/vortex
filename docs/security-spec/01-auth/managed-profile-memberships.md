# Organization Memberships

## What This Does

Organization memberships grant an authenticated profile inherited access to all present
and future headless children of one owning manager configuration, without changing child
or personal resource ownership. The immutable owner in
`managed_profiles.manager_profile_id` remains the policy, pricing, namespace, provisioning,
and deletion principal. Exactly one owning account/config defines exactly one organization:
the current **one-account-one-org approximation** under [ADR 0006](../../adr-0006-organization-wide-teams.md).
Every person has at most one active org affiliation; owners, including disabled owners,
cannot join another org. Personal resources are not shared. Multi-organization management,
organization kinds, owner transfer, and an organization switcher are unsupported. Adding
them requires explicitly revisiting the architectural model in a later ADR, not reinterpreting
membership. Existing internal membership table/class filenames remain unchanged.

There are exactly two roles:

| Role        | Child access                                                                                |
| ----------- | ------------------------------------------------------------------------------------------- |
| `manager`   | Reads and supported child mutations; may administer non-owner members and child credentials |
| `read_only` | Reads only; no child, credential, provider, ramp, or membership mutation                    |

The server classifies every delegated route as `read`, `manage`, `credential_manage`, or
`ramp`. Membership APIs use a Supabase bearer principal and reject API credentials and
impersonation. Selected-child provider/KYC/KYB and ramp mutations require an eligible
member-owned secret API credential. A direct child secret authenticates as the shared child
principal and does not depend on a human membership.

## Routes

`GET /v1/organization` returns `{ organization: { ownerProfileId, ownerEmail, membership:
{ role, isOwner } } | null }`, with nullable `ownerEmail`. Null means no live organization
membership, including a disabled owner configuration. Team routes derive that same owner
from the human actor, never a path/body owner selector, and are nested under `/v1/organization`:

| Route                                      | Minimum role | Purpose                                                 |
| ------------------------------------------ | ------------ | ------------------------------------------------------- |
| `GET /members`                             | `read_only`  | List active members, including immutable owner metadata |
| `PATCH /members/:memberProfileId`          | `manager`    | Change a non-owner member role                          |
| `DELETE /members/:memberProfileId`         | `manager`    | Revoke a non-owner member                               |
| `GET /member-invitations`                  | `read_only`  | List pending and terminal invitations                   |
| `POST /member-invitations`                 | `manager`    | Invite one normalized email with one role               |
| `DELETE /member-invitations/:invitationId` | `manager`    | Cancel a pending invitation                             |
| `GET /member-events`                       | `read_only`  | Read cursor-paginated access history                    |

All seven scoped Team operations above require the UUID query parameter
`expectedOwnerProfileId`, including item PATCH/DELETE. Missing or malformed input returns
`400 MANAGED_PROFILE_INVALID_INPUT`; an expected owner different from the actor's current
organization returns `409 ORGANIZATION_CONTEXT_CHANGED` in the structured service error body.
The value binds the displayed org, not authority: current org is still derived server-side and
live service authorization applies. Discovery and both invitee locator routes are exempt.

Invitee routes are bearer-authenticated and do not accept managed selection:

| Route                                                              | Purpose                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| `GET /v1/organization-member-invitations/:invitationId`         | Preview status only after exact verified-email authentication |
| `POST /v1/organization-member-invitations/:invitationId/accept` | Explicitly accept and create/reactivate membership            |

Preview returns `{ invitation, inviter: { email, profileId }, organization:
{ ownerProfileId, ownerEmail } }`. Acceptance returns `{ ownerProfileId, member }` with the
existing member projection. Invitation `ownerProfileId` replaces `managedProfileId`.
Member/event/body projections and pagination are unchanged. All ten organization/team/invitee
operations require human Supabase bearer authentication and reject any child selector,
API/public-key header (even alongside a bearer), and impersonation. Old per-child team paths
and invitee paths are removed without aliases. Active owner configuration is required for
team and invitee operations even if no children exist.

### Lifecycle Reads

List and detail responses include `actor: { profileId, canProvisionManagedProfiles,
hasMemberships }` plus child-specific membership and immutable-owner policy. Provisioning
capability reflects the actor's own active manager configuration. `hasMemberships` means
live organization membership with active owner configuration, even with zero children,
independently of page, status filter or detail target. Both enabled owners and invited members
can have `hasMemberships: true` in an empty org. Child eligibility separately requires an
active child relationship, managed subject, and exactly one active owned customer entity
selected by the child; invalid/deleted children do not remove the org affiliation.

The default `GET /v1/managed-profiles` returns `200` with an empty list even when both actor
flags are false. Both `status=deleted` and `status=all` require the actor's own active manager
configuration (`403 MANAGED_PROFILE_OWNER_REQUIRED` otherwise) and are owner-scoped only;
even active invited children owned by others are excluded from `all`. Retained results still
require valid membership and entity layout; they do not determine `hasMemberships`.

`GET /v1/managed-profiles/:profileId` with an exactly matching `X-Managed-Profile-Id` is explicit
bootstrap. Prior access requires an actor membership for the child's immutable owner whose
interval overlaps the child lifetime: `membership.createdAt <= (child.deletedAt ?? now)` and
(`membership.revokedAt IS NULL` or `membership.revokedAt > child.createdAt`) on the same row.
Historic org membership alone is insufficient. A child created after revocation or wholly
within a membership gap receives masked `404`, even with a matching selector. A retained
deleted child can be read only by its immutable owner with active configuration and valid
membership/entity layout **without a selector**. Invited members and ineligible ordinary
retained reads receive masked `404 MANAGED_PROFILE_NOT_FOUND`. These rules apply equally to
bearer and member-secret callers; direct child credentials cannot use lifecycle routes.

## Security Invariants

1. **Authorization MUST be live and organization-scoped** — every delegated request resolves the
   selected managed child, its active immutable owner configuration, and the actor's active
   membership for that owner. The role covers all present and future children of that owner,
   not a per-child grant. A selector, cached dashboard role, invitation UUID, or request email is not
   authority.
2. **Member and subject kinds MUST be enforced** — members are `authenticated` profiles;
   subjects are `managed` profiles with their required managed relationship and active
   customer entity.
3. **Ownership MUST remain immutable** — `managed_profiles.manager_profile_id` cannot
   change. The active owner membership must exist with role `manager` and cannot be revoked
   or downgraded, including when the owner is disabled or has no children. Migration 069
   backfills one self-membership per manager config; new config creation adds it and its
   event once. Child provisioning MUST NOT add grants or membership events.
4. **Roles MUST be an allowlist** — only `manager` and `read_only` are valid. Capability
   mappings are server-owned; unknown roles or unclassified routes fail closed.
5. **Read-only MUST remain read-only across authentication methods** — `read_only` cannot
   use `manage`, `credential_manage`, or `ramp`, including through its own profile secret
   credential.
6. **Lifecycle MUST remain owner-only** — membership does not authorize child provisioning,
   sibling creation, child deletion, owner-policy changes, pricing administration, or global
   profile-role changes. A non-owner with an active `manager` or `read_only` membership receives
   `403 MANAGED_PROFILE_OWNER_REQUIRED` on child deletion; non-owner outsiders receive masked
   `404`. Retained filters and direct retained reads MUST obey the owner-only rules above.
7. **Owner policy MUST govern every member** — corridor and customer-type authorization,
   pricing fallback, provider-contact namespace, and direct-child credential policy resolve
   from the immutable owner, never the acting member's personal manager configuration.
8. **Selected-child provider and ramp mutations MUST require a secret** — a Supabase bearer
   may use allowed read/manage operations but cannot use `credential_manage` or register,
   update, or start a child ramp. Provider denial retains the shipped code
   `MANAGED_PROFILE_REQUIRES_API_CREDENTIAL`; child credential and domestic fiat-account
   management are `manage`, not secret-only `credential_manage`. Ramp denial occurs before
   the global body parser and uses
   `MANAGED_PROFILE_RAMP_REQUIRES_API_CREDENTIAL`. There is no drain exception.
9. **Child credentials MUST remain independent company principals** — possession grants the
   credential's currently supported direct-child provider, fiat-account, quote, and ramp
   capabilities without a human membership. Member removal or downgrade affects delegated
   access to every child but does not revoke these credentials; child deletion does.
10. **All organization operations MUST reject non-human principals and selectors** — discovery,
    team reads/mutations, and invitee preview/acceptance require a current human Supabase bearer
    session and reject API/public keys, direct child credentials, any child selector, and
    admin impersonation. A matching or malformed selector is not an exception.
11. **Invitation creation MUST be non-enumerating and idempotent** — responses do not reveal
    whether the normalized email already has a profile. At most one pending invitation exists
    per `(owner_profile_id, email)` regardless of role; changing a pending role requires
    cancellation and a new invitation. Repeated identical creation does not send twice.
12. **Invitation acceptance MUST bind the current verified email** — preview and acceptance
    compare the normalized invitation email with the current Supabase principal's verified
    email, not request input or stale `profiles.email`. Mismatched callers receive no organization,
    inviter, role, or status details.
13. **Acceptance MUST be explicit and transactional** — OTP verification does not grant
    access. Acceptance locks and rechecks the invitation, expiry, active owner, and member;
    creates one active membership; marks acceptance; and writes `invitation_accepted` plus
    `member_added` events atomically. Replay creates no duplicate membership or event.
14. **Expiry and cancellation MUST be terminal** — invitations expire after seven days.
    Creation, preview, listing, and acceptance persist observed expiry exactly once. Accepted,
    cancelled, and expired invitations remain auditable and cannot be accepted.
15. **Mutations MUST use consistent owner-first locking** - organization configuration and
    owner authorization (including protected self-membership) precede target mutation.
    Acceptance locks existing owner/invitee configurations in stable order before the
    invitee profile and invitation/membership rows. Child resource mutations retain
    owner-first, child-aggregate, membership ordering. Role change, removal, cancellation,
    expiry, and acceptance recheck live authority under locks. Cross-org accept and manager
    configuration creation races MUST serialize on the person's affiliation and preserve
    global active membership uniqueness.
16. **Events MUST be append-only and atomic** — every post-migration invitation or membership
    state change writes its event in the same transaction. Event rows cannot be updated or
    deleted. Migration backfill is the only eventless membership creation. Config-created owner
    self-membership uses `createdByProfileId: null`, and its event uses `actorProfileId: null`
    (system attribution); the owner remains the member subject. `ADMIN_SECRET` identifies no
    human operator and MUST NOT falsely attribute this action to the owning account.
17. **Direct database access MUST be denied to clients** — membership, invitation, event,
    and related sequence objects have RLS enabled with no client policy and explicit
    `anon`/`authenticated` privilege revocation.
18. **Errors MUST not expand discovery** — detail bootstrap MUST require an exactly matching
    selector and at least one actor membership for the child's immutable owner satisfying
    `membership.createdAt <= (child.deletedAt ?? now)` and (`membership.revokedAt IS NULL` or
    `membership.revokedAt > child.createdAt`) on the same row before returning
    `403 MANAGED_PROFILE_MEMBERSHIP_INVALID` for ineligibility. Use now for an undeleted child.
    A child created after revocation or wholly within a membership gap MUST receive masked
    `404` even if the actor has historic org membership. Revocation, child deletion,
    owner deactivation and invalid entity layout invalidate evidenced bootstrap; a deleted
    child invalidates even its owner's bootstrap. Never-member callers receive the same masked
    `404 MANAGED_PROFILE_NOT_FOUND` for existing and unknown children, with or without a matching
    selector. A mismatched selector receives `403 MANAGED_PROFILE_ACCESS_DENIED`. Ordinary
    detail reads never return membership-invalid: missing membership is masked `404`; active
    members of active children with disabled owners or invalid layouts receive access denial.
    Other delegated and membership-administration probes retain their route-specific access
    denial. Only membership-invalid may clear dashboard selection in response to an API error;
    `404`, role/policy denial and transient failures leave it intact.
19. **Invitations MUST use the durable email queue** — creation writes one direct-recipient
    outbox row in the invitation transaction. Only the managed-profile invitation type may
    set `recipient_email`; existing retry, idempotency, non-production allowlist, escaping,
    and abandoned-send controls remain active.
20. **Secrets and invitation identity MUST not enter telemetry** — logs, client events, and
    event payloads omit API-key secrets, invitation URLs, bearer tokens, and unnecessary
    membership/email details.
21. **One active affiliation MUST be enforced globally** — rewritten unshipped migration 069
    uses `owner_profile_id` referencing `managed_profile_managers.profile_id` in the existing
    membership/invitation/event tables, with active membership uniqueness on `member_profile_id`.
    Owners (including disabled owners) cannot accept another org. Invited managers and
    read-only members cannot hold a second active org membership or become a separate owner.
    Second-org acceptance returns `409 ORGANIZATION_MEMBERSHIP_CONFLICT`; no event or grant
    may commit on conflict. No compatibility schema or forward migration is introduced.
22. **Deactivation MUST retain affiliation and deny operations** — organization/team and child
    operations require active owner config. Disabling it does not revoke membership, permit
    joining another org, or remove owner protection. Discovery returns null, not a live org.
23. **Pending invitations MUST remain durable org offers** — subsequent removal or downgrade
    of the inviter does not cancel an offer. Acceptance rechecks organization availability,
    verified invitee and global affiliation, not the inviter's continued membership.
24. **Team requests MUST bind the displayed organization** - all seven scoped Team operations
    require query `expectedOwnerProfileId` as a UUID; absent/malformed values return
    `400 MANAGED_PROFILE_INVALID_INPUT`. Derive the actor's current organization server-side;
    mismatch returns `409 ORGANIZATION_CONTEXT_CHANGED`, never an operation against a newly
    joined org. Live service authorization still gates access. The precondition does not grant
    authority, select an org, or introduce multi-org management. Discovery and invitee locator
    routes are exempt. A client MUST retain the displayed owner with each request/dialog and
    require a new user decision after context refresh, not silently replay stale intent.

## Threat Vectors & Mitigations

| Threat                                 | Attack scenario                                                       | Mitigation                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Cross-org access                       | A member changes `X-Managed-Profile-Id` to a foreign child | Resolve membership for the child's immutable owner; siblings inherit access, foreign orgs do not |
| Owner lockout                          | A manager removes or downgrades the immutable owner                   | Database invariant plus transactional owner check rejects the mutation                                   |
| Read-only escalation                   | A read-only member presents a personal secret key                     | Role is checked independently from credential strength                                                   |
| Invitation interception                | A UUID leaks through browser history                                  | UUID is only a locator; exact current verified-email authentication and explicit acceptance are required |
| Email enumeration                      | Inviter probes whether an address already uses Vortex                 | Creation response and delivery behavior expose no profile-existence distinction                          |
| Acceptance race                        | Two sessions accept invitations to different orgs concurrently | Person-level affiliation serialization plus global active uniqueness permits only one org |
| Stale dashboard authority              | Cached manager role remains after downgrade                           | Server checks live membership; bootstrap refresh removes controls without treating cache as authority    |
| Historic affiliation leaks a child | Actor probes a child created after revocation or wholly inside a membership gap | Require owner-matching membership interval overlap with child lifetime; otherwise masked `404` |
| Stale org dialog mutates a new org | Actor opens an invite in A, is removed, accepts B elsewhere, then submits the old dialog | Required expected-owner query precondition fails `409 ORGANIZATION_CONTEXT_CHANGED`; live org is never selected by the parameter |
| Shared credential survives offboarding | Removed member retained a child API secret                            | Child credentials are explicit shared principals; UI warns managers and revocation is the response       |
| Impersonation creates standing access  | Admin session invites a new member or mints a child key               | Membership/invitation and credential mutations reject impersonation                                      |

## Audit Checklist

- [ ] Migration backfills one protected owner-manager membership per config, including disabled
      owners and empty orgs; new config creation emits one event and child creation adds no grants.
- [ ] Database constraints enforce profile kinds, active uniqueness, immutable ownership,
      owner protection, valid roles, invitation terminal states, and append-only events.
- [ ] RLS flags and deployed grants deny `anon` and `authenticated` direct access.
- [ ] Every delegated route declares exactly one capability and unknown roles fail closed.
- [ ] Supabase selected-child ramp register/update/start fails before body buffering.
- [ ] Manager and read-only personal secrets are distinguished by live membership role.
- [ ] Direct child secrets cannot select another child or administer membership.
- [ ] All ten organization/team/invitee operations reject impersonation, any child selector,
      and API/public keys, including key-plus-bearer combinations; old paths have no aliases.
- [ ] All seven scoped Team operations require the expected-owner UUID query precondition,
      reject malformed/missing input with `400`, and mismatched context with typed `409`;
      discovery/invitee routes remain exempt and stale A dialogs cannot mutate B.
- [ ] Invitation create, preview, and accept normalize email identically.
- [ ] Preview and accept require `email_confirmed_at` and the exact current Supabase email.
- [ ] Acceptance, replay, cancellation, expiry, role changes, removals, and owner races have
      transactional tests.
- [ ] Every state change writes one immutable event with the correct actor and subject.
- [ ] Direct-recipient email is accepted only for the membership-invitation type.
- [ ] Dashboard clears selection only after bootstrap returns membership-invalid.
- [ ] Actor flags remain independent of pagination/status; empty default lists return `200`;
      live org membership counts even with zero eligible children and disabled owners do not.
- [ ] Second-org acceptance and owner enablement races preserve global uniqueness; disabled
      owners cannot join another org, and deactivation retains memberships while denying access.
- [ ] Pending offers survive inviter removal/downgrade; acceptance still checks expiry and owner.
- [ ] Removal/downgrade changes access to all present/future children without revoking shared keys.
- [ ] Both retained list filters are owner-scoped; bearer and member-secret retained reads
      require the active immutable owner without a selector.
- [ ] Bootstrap requires matching selector and owner-matching membership interval overlap;
      deleted owner bootstrap invalidates, and children created after revocation or wholly in a
      membership gap remain masked `404` like never-member existing/unknown probes.
- [ ] Desktop and mobile tests cover main nonacting Team for empty orgs, role badges, read-only controls, API keys, and
      blocked transfer entry points.
