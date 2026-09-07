# Managed-Profile Memberships

## What This Does

Managed-profile memberships grant an authenticated profile access to one headless managed
child without changing that child's owner or resource ownership. The immutable owner in
`managed_profiles.manager_profile_id` remains the policy, pricing, namespace, provisioning,
and deletion principal. Membership is a separate child-scoped authorization edge.

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

Manager/member routes are nested under `/v1/managed-profiles/:profileId`:

| Route                                      | Minimum role | Purpose                                                 |
| ------------------------------------------ | ------------ | ------------------------------------------------------- |
| `GET /members`                             | `read_only`  | List active members, including immutable owner metadata |
| `PATCH /members/:memberProfileId`          | `manager`    | Change a non-owner member role                          |
| `DELETE /members/:memberProfileId`         | `manager`    | Revoke a non-owner member                               |
| `GET /member-invitations`                  | `read_only`  | List pending and terminal invitations                   |
| `POST /member-invitations`                 | `manager`    | Invite one normalized email with one role               |
| `DELETE /member-invitations/:invitationId` | `manager`    | Cancel a pending invitation                             |
| `GET /member-events`                       | `read_only`  | Read cursor-paginated access history                    |

Invitee routes are bearer-authenticated and do not accept managed selection:

| Route                                                              | Purpose                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| `GET /v1/managed-profile-member-invitations/:invitationId`         | Preview status only after exact verified-email authentication |
| `POST /v1/managed-profile-member-invitations/:invitationId/accept` | Explicitly accept and create/reactivate membership            |

### Lifecycle Reads

List and detail responses include `actor: { profileId, canProvisionManagedProfiles,
hasMemberships }` plus child-specific membership and immutable-owner policy. Provisioning
capability reflects the actor's own active manager configuration. `hasMemberships` derives
from the unpaginated eligible **active-child** count across owners, independently of the
requested page, status filter or detail target. Eligibility requires an unrevoked allowed-role
membership, active owner configuration, active child relationship, managed subject, and exactly
one active owned customer entity selected by the child. Deleted children, inactive owners and
invalid entity layouts do not count.

The default `GET /v1/managed-profiles` returns `200` with an empty list even when both actor
flags are false. Both `status=deleted` and `status=all` require the actor's own active manager
configuration (`403 MANAGED_PROFILE_OWNER_REQUIRED` otherwise) and are owner-scoped only;
even active invited children owned by others are excluded from `all`. Retained results still
require valid membership and entity layout and never contribute to `hasMemberships`.

`GET /v1/managed-profiles/:profileId` with an exactly matching `X-Managed-Profile-Id` is explicit
bootstrap. Stored membership history, not the selector itself, proves prior access. A retained
deleted child can be read only by its immutable owner with active configuration and valid
membership/entity layout **without a selector**. Invited members and ineligible ordinary
retained reads receive masked `404 MANAGED_PROFILE_NOT_FOUND`. These rules apply equally to
bearer and member-secret callers; direct child credentials cannot use lifecycle routes.

## Security Invariants

1. **Authorization MUST be live and child-scoped** — every delegated request resolves the
   selected managed child, its active immutable owner configuration, and the actor's active
   membership. A selector, cached dashboard role, invitation UUID, or request email is not
   authority.
2. **Member and subject kinds MUST be enforced** — members are `authenticated` profiles;
   subjects are `managed` profiles with their required managed relationship and active
   customer entity.
3. **Ownership MUST remain immutable** — `managed_profiles.manager_profile_id` cannot
   change. The active owner membership must exist with role `manager` and cannot be revoked
   or downgraded while the child is active.
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
   capabilities without a human membership. Member removal does not revoke these credentials;
   child deletion does.
10. **Membership administration MUST reject non-human principals** — membership and
    invitation mutations require a current Supabase bearer session and reject API credentials,
    direct child credentials, and admin impersonation.
11. **Invitation creation MUST be non-enumerating and idempotent** — responses do not reveal
    whether the normalized email already has a profile. At most one pending invitation exists
    per `(managed_profile_id, email)` regardless of role; changing a pending role requires
    cancellation and a new invitation. Repeated identical creation does not send twice.
12. **Invitation acceptance MUST bind the current verified email** — preview and acceptance
    compare the normalized invitation email with the current Supabase principal's verified
    email, not request input or stale `profiles.email`. Mismatched callers receive no child,
    inviter, role, or status details.
13. **Acceptance MUST be explicit and transactional** — OTP verification does not grant
    access. Acceptance locks and rechecks the invitation, expiry, owner, child, and member;
    creates one active membership; marks acceptance; and writes `invitation_accepted` plus
    `member_added` events atomically. Replay creates no duplicate membership or event.
14. **Expiry and cancellation MUST be terminal** — invitations expire after seven days.
    Creation, preview, listing, and acceptance persist observed expiry exactly once. Accepted,
    cancelled, and expired invitations remain auditable and cannot be accepted.
15. **Mutations MUST use one lock order** — owner configuration/profile first, child
    profile/aggregate second, then invitation or membership rows. Role change, removal,
    cancellation, expiry, and acceptance recheck active authority while holding those locks.
16. **Events MUST be append-only and atomic** — every post-migration invitation or membership
    state change writes its event in the same transaction. Event rows cannot be updated or
    deleted. Migration backfill is the only eventless membership creation.
17. **Direct database access MUST be denied to clients** — membership, invitation, event,
    and related sequence objects have RLS enabled with no client policy and explicit
    `anon`/`authenticated` privilege revocation.
18. **Errors MUST not expand discovery** — detail bootstrap MUST require an exactly matching
    selector and stored membership history (active or revoked) before returning
    `403 MANAGED_PROFILE_MEMBERSHIP_INVALID` for ineligibility. Revocation, child deletion,
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

## Threat Vectors & Mitigations

| Threat                                 | Attack scenario                                                       | Mitigation                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Cross-child access                     | A member changes `X-Managed-Profile-Id` to a sibling or foreign child | Active membership is resolved for the exact selected child on every request                              |
| Owner lockout                          | A manager removes or downgrades the immutable owner                   | Database invariant plus transactional owner check rejects the mutation                                   |
| Read-only escalation                   | A read-only member presents a personal secret key                     | Role is checked independently from credential strength                                                   |
| Invitation interception                | A UUID leaks through browser history                                  | UUID is only a locator; exact current verified-email authentication and explicit acceptance are required |
| Email enumeration                      | Inviter probes whether an address already uses Vortex                 | Creation response and delivery behavior expose no profile-existence distinction                          |
| Acceptance race                        | Two sessions accept the same invite concurrently                      | Invitation and child locks plus uniqueness and terminal-state checks create one membership/events set    |
| Stale dashboard authority              | Cached manager role remains after downgrade                           | Server checks live membership; bootstrap refresh removes controls without treating cache as authority    |
| Shared credential survives offboarding | Removed member retained a child API secret                            | Child credentials are explicit shared principals; UI warns managers and revocation is the response       |
| Impersonation creates standing access  | Admin session invites a new member or mints a child key               | Membership/invitation and credential mutations reject impersonation                                      |

## Audit Checklist

- [ ] Migration backfills exactly one owner-manager membership for every retained child.
- [ ] Database constraints enforce profile kinds, active uniqueness, immutable ownership,
      owner protection, valid roles, invitation terminal states, and append-only events.
- [ ] RLS flags and deployed grants deny `anon` and `authenticated` direct access.
- [ ] Every delegated route declares exactly one capability and unknown roles fail closed.
- [ ] Supabase selected-child ramp register/update/start fails before body buffering.
- [ ] Manager and read-only personal secrets are distinguished by live membership role.
- [ ] Direct child secrets cannot select another child or administer membership.
- [ ] All membership mutations reject impersonation and API credentials.
- [ ] Invitation create, preview, and accept normalize email identically.
- [ ] Preview and accept require `email_confirmed_at` and the exact current Supabase email.
- [ ] Acceptance, replay, cancellation, expiry, role changes, removals, and owner races have
      transactional tests.
- [ ] Every state change writes one immutable event with the correct actor and subject.
- [ ] Direct-recipient email is accepted only for the membership-invitation type.
- [ ] Dashboard clears selection only after bootstrap returns membership-invalid.
- [ ] Actor flags remain independent of pagination/status; empty default lists return `200`,
      and deleted/inactive-owner/invalid-entity records do not count toward `hasMemberships`.
- [ ] Both retained list filters are owner-scoped; bearer and member-secret retained reads
      require the active immutable owner without a selector.
- [ ] Bootstrap requires matching selector plus membership history; deleted owner bootstrap
      invalidates, and never-member existing/unknown probes are indistinguishable `404`s.
- [ ] Desktop and mobile tests cover role badges, read-only controls, Team, API keys, and
      blocked transfer entry points.
