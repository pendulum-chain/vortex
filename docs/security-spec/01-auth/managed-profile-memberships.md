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
   profile-role changes.
7. **Owner policy MUST govern every member** — corridor and customer-type authorization,
   pricing fallback, provider-contact namespace, and direct-child credential policy resolve
   from the immutable owner, never the acting member's personal manager configuration.
8. **Selected-child provider and ramp mutations MUST require a secret** — a Supabase bearer
   may use allowed read/manage operations but cannot use `credential_manage` or register,
   update, or start a child ramp. Ramp denial occurs before the global body parser and uses
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
18. **Errors MUST not expand discovery** — generic probing receives
    `MANAGED_PROFILE_ACCESS_DENIED`. `MANAGED_PROFILE_MEMBERSHIP_INVALID` is reserved for an
    authenticated actor's previously selected child bootstrap and is the only error that may
    clear dashboard selection. Role and policy denial leave valid selection intact.
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
- [ ] Desktop and mobile tests cover role badges, read-only controls, Team, API keys, and
      blocked transfer entry points.
