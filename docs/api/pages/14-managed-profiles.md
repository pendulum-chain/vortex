# Managed Profiles

Managed profiles let a platform onboard and operate Vortex accounts for its own customers without those customers ever touching a Vortex UI, login, or email flow. The platform's Vortex profile acts as the **manager**; each customer becomes a headless **managed child** profile that the manager creates, onboards through KYC/KYB, and ramps on behalf of.

Use managed profiles when interactive signup is unavailable or undesirable — a B2B platform embedding cross-border payouts, a fintech onboarding its verified user base, or an operations backend running ramps for corporate sub-accounts. Provision one genuine child per real individual or business; never share one child between customers.

This page is the integration walkthrough. The exact authorization contract — every check Vortex performs, edge-case semantics, and error codes — lives in [Authentication And API Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys) and is authoritative where the two overlap.

## Prerequisites

Manager status is granted by Vortex, not self-service. During partner onboarding, Vortex enables your profile as a managed-profile manager and assigns:

- **Allowed corridors** — the countries (`BR`, `AR`, `CO`, `MX`, `US`) your children may operate in.
- **Optional customer-type narrowing** — restrict children to `individual` or `business`; a null policy allows both wherever the corridor's canonical capability matrix does.

Delegated operations resolve the immutable owner's current policy, not the acting member's personal policy. Removing a corridor blocks new corridor-bound mutations and disallowed exact-limit reads; quote discovery and historical/status reads remain available. Already-started background ramps may continue, but this never grants a bearer permission to update or start a child ramp. EUR is not available for managed children because its flows are bound to a verified login email.

## Create A Managed Child

Authenticate with your manager profile's secret key (`X-API-Key`) or Supabase Bearer session. A public `pk_*` key is insufficient, and a child-owned credential can never manage other children.

```http
POST /v1/managed-profiles
X-API-Key: sk_live_...
Content-Type: application/json

{
  "externalSubjectId": "customer-4711",
  "customerType": "individual",
  "contactEmail": "customer-4711@platform.example"
}
```

- `externalSubjectId` is your immutable identifier for this subject, unique within your manager scope — it doubles as an idempotency key. Retrying an identical request returns `200` with the existing child instead of `201`.
- `customerType` is immutable (`individual` or `business`) and gates which corridor flows the child may use later.
- `contactEmail` is normalized, immutable, unique among your children, and used for provider customer creation. It never becomes a login identity — children have no Supabase account, OTP, or claiming lifecycle. Supply an address you are authorized to use.

```json
{
  "managedProfile": {
    "profileId": "00000000-0000-0000-0000-000000000002",
    "externalSubjectId": "customer-4711",
    "customerType": "individual",
    "contactEmail": "customer-4711@platform.example",
    "status": "active",
    "creationSource": "manager",
    "deletedAt": null,
    "createdAt": "2026-08-19T12:00:00.000Z",
    "updatedAt": "2026-08-19T12:00:00.000Z"
  }
}
```

`profileId` is the value you pass as `X-Managed-Profile-Id` in every delegated call. Persist the pair (`externalSubjectId`, `profileId`) in your system of record.

Lifecycle endpoints: `GET /v1/managed-profiles` defaults to eligible active memberships across all owners (`limit=1..100`, non-negative `offset`; defaults `50`, `0`). `status=deleted` and `status=all` both require the actor's own active manager configuration and are owner-scoped only, excluding children owned by others even if active. `GET /v1/managed-profiles/{profileId}` reads one eligible active child; retained deleted-child reads require the active immutable owner and no selector. List/read responses identify the actor and decorate each child with the actor's `manager` or `read_only` membership, `isOwner`, and owner policy. `DELETE` remains owner-only: an active non-owner member receives `403 MANAGED_PROFILE_OWNER_REQUIRED`. Deletion is idempotent while the owner configuration is active, revokes child credentials, blocks new activity, and preserves compliance and financial history. Deleted `externalSubjectId` and `contactEmail` values stay reserved.

For example, a non-owner member can bootstrap its selected child:

```http
GET /v1/managed-profiles/00000000-0000-0000-0000-000000000002
Authorization: Bearer <member_access_token>
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
```

```json
{
  "actor": {
    "profileId": "00000000-0000-0000-0000-000000000003",
    "canProvisionManagedProfiles": false,
    "hasMemberships": true
  },
  "managedProfile": {
    "profileId": "00000000-0000-0000-0000-000000000002",
    "externalSubjectId": "customer-4711",
    "customerType": "individual",
    "contactEmail": "customer-4711@platform.example",
    "status": "active",
    "creationSource": "manager",
    "deletedAt": null,
    "createdAt": "2026-08-19T12:00:00.000Z",
    "updatedAt": "2026-08-19T12:00:00.000Z",
    "membership": { "role": "manager", "isOwner": false },
    "policy": { "allowedCorridors": ["BR"], "allowedCustomerTypes": null }
  }
}
```

The list response uses the same actor and decorated child shape inside `managedProfiles`, adding `pagination: { limit, offset, total }`. `canProvisionManagedProfiles` reflects the actor's own active manager configuration. `hasMemberships` is based on an unpaginated eligible active-child count across all owners, independent of the page, status filter and detail target. Eligibility excludes revoked/invalid roles, deleted children, inactive owners and invalid entity layouts; a child must select its sole active owned customer entity. An empty page can therefore retain `hasMemberships: true`, while an owner reading retained records can have `hasMemberships: false`.

The default list returns `200` even for an actor with no owner configuration or eligible memberships:

```json
{
  "actor": {
    "profileId": "00000000-0000-0000-0000-000000000003",
    "canProvisionManagedProfiles": false,
    "hasMemberships": false
  },
  "managedProfiles": [],
  "pagination": { "limit": 50, "offset": 0, "total": 0 }
}
```

An enabled owner before provisioning instead receives flags `true`, `false`. Neither an empty page nor a `200` by itself proves managed access. There is no singular `manager` object; creation remains undecorated. Membership never transfers ownership or grants sibling provisioning, child deletion, policy/pricing administration, or global profile roles.

### Bootstrap And Retained Reads

Bootstrap means `GET` detail with `X-Managed-Profile-Id` **exactly matching** the path. The selector expresses intent, not prior access: stored membership history (active or revoked) is required before ineligibility returns `403 MANAGED_PROFILE_MEMBERSHIP_INVALID`. This covers revoked membership, deleted children, disabled owners and invalid entity layouts. Deleted children invalidate bootstrap even for their owner. Both bearer and member-secret callers use this rule; callers who were never members receive the same masked `404 MANAGED_PROFILE_NOT_FOUND` for an existing or unknown child, whether or not they send a matching selector. A mismatched selector is `403 MANAGED_PROFILE_ACCESS_DENIED`.

To inspect a retained deleted child, the immutable owner uses an ordinary detail read **without a selector**, with active owner configuration and valid membership/entity layout. Invited members and ineligible retained reads receive `404`. Ordinary reads never produce membership-invalid: missing membership is `404`, while an active member's active-child read with disabled owner or invalid layout is `403 MANAGED_PROFILE_ACCESS_DENIED`. Clear a dashboard selection on evidenced bootstrap membership-invalid, not on role/policy denial, generic `404` or transient failures.

## Two Ways To Act For A Child

**Delegation header (recommended).** Your member-owned secret credential plus a selector:

```http
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
```

You remain the authenticated actor; ownership, KYC/provider identity, and ramp history resolve from the child. Vortex verifies active membership and role, active controlling owner and relationship, valid child entity layout, and applicable owner policy. `read_only` permits supported reads, including quote creation; `manager` permits supported mutations. Provider/KYC/KYB mutations require a member-owned secret, including GET endpoints that create verification links or artifacts; the shipped bearer-denial code is `MANAGED_PROFILE_REQUIRES_API_CREDENTIAL`. Selected-child ramp register/update/start also require a secret: bearer-only calls are denied before body parsing, unconditionally and with no drain exception. Only explicit, historically evidenced detail bootstrap uses membership-invalid as described above; other delegated failures do not authorize clearing selection.

**Child-owned credentials.** Issue the child its own key pair when a subsystem should act as the child directly, without the header:

```http
POST /v1/managed-profiles/00000000-0000-0000-0000-000000000002/api-credentials
X-API-Key: sk_live_...
```

The response is the standard credential resource — the secret value is returned exactly once; store it immediately. `GET .../api-credentials` lists them without secrets for either role; creating or deleting requires a `manager` membership. A child credential authenticates as the child without any selector, but every use still requires the controlling relationship and manager to be active and applies the owner's current corridor/type policy — and it cannot select any other child.

Child credential creation/revocation supports a member bearer session as well as a member-owned secret (`manage` capability); it is not a secret-only provider mutation (`credential_manage`). Impersonation is rejected for credential mutations. Child secrets are independent shared company principals: removing or downgrading a member does **not** revoke them. Revoke any child secrets the departing member possessed separately.

One deliberate exception: `POST /v1/brl/kyc/import-token` (the Sumsub share-token import) rejects direct child credentials with `403`. An active `manager` member must import with its own secret and the delegation header; a selected-child bearer cannot import.

## Invite And Manage Members

Members are authenticated human profiles; the child remains headless. There are exactly two roles: `manager` can perform supported child mutations and administer non-owner members; `read_only` can only read, even when using a secret key. The immutable owner is always an active `manager` member and cannot be changed or revoked.

All nine endpoints below require `Authorization: Bearer <access_token>`. Do not attach API-key headers, even alongside a bearer. API credentials, direct child credentials, and impersonation are rejected. On child-path routes, an optional `X-Managed-Profile-Id` must match the path UUID case-insensitively. On invitee routes it is forbidden.

| Endpoint | Authority | Success |
|---|---|---|
| `GET /v1/managed-profiles/{profileId}/members` | Either role | `200 { members, pagination }` |
| `PATCH /v1/managed-profiles/{profileId}/members/{memberProfileId}` | Manager member | `200 { member }` |
| `DELETE /v1/managed-profiles/{profileId}/members/{memberProfileId}` | Manager member | `204`, no body |
| `GET /v1/managed-profiles/{profileId}/member-invitations` | Either role | `200 { invitations, pagination }` |
| `POST /v1/managed-profiles/{profileId}/member-invitations` | Manager member | `201 { invitation }`, or `200` for identical pending retry |
| `DELETE /v1/managed-profiles/{profileId}/member-invitations/{invitationId}` | Manager member | `204`, no body |
| `GET /v1/managed-profiles/{profileId}/member-events` | Either role | `200 { events, pagination }` |
| `GET /v1/managed-profile-member-invitations/{invitationId}` | Exact verified-email invitee | `200 { invitation, inviter, managedProfile }` |
| `POST /v1/managed-profile-member-invitations/{invitationId}/accept` | Exact verified-email invitee | `200 { managedProfileId, member }` |

### 1. Create An Invitation

```http
POST /v1/managed-profiles/00000000-0000-0000-0000-000000000002/member-invitations
Authorization: Bearer <manager_member_access_token>
Content-Type: application/json

{ "email": "operator@example.com", "role": "manager" }
```

```json
{
  "invitation": {
    "id": "00000000-0000-0000-0000-000000000004",
    "managedProfileId": "00000000-0000-0000-0000-000000000002",
    "invitedByProfileId": "00000000-0000-0000-0000-000000000001",
    "email": "operator@example.com",
    "role": "manager",
    "status": "pending",
    "createdAt": "2026-09-07T12:00:00.000Z",
    "expiresAt": "2026-09-14T12:00:00.000Z",
    "acceptedAt": null,
    "cancelledAt": null,
    "expiredAt": null
  }
}
```

Email is trimmed/lowercased and validated (maximum 254 normalized characters). The invitation expires after seven days and its email is queued transactionally. Creation does not reveal whether an unrelated profile exists. Only one pending invitation per child/email is allowed regardless of role. Identical retries return the same invitation without another email; changing the pending role requires cancellation and a new invite. A visible active member yields `409 MEMBERSHIP_ALREADY_EXISTS`. No secret acceptance token or URL is returned.

### 2. Sign In, Preview, Then Accept

The invitee signs in using the invited email and obtains a Supabase session. The invitation UUID is only a locator, not a bearer secret. Preview and acceptance compare the normalized invitation email with the **current Supabase principal's verified email**, requiring `email_confirmed_at`. Request-body email and cached `profiles.email` are not authority. OTP verification alone does not grant child access.

```http
GET /v1/managed-profile-member-invitations/00000000-0000-0000-0000-000000000004
Authorization: Bearer <operator_access_token>
```

Authorized preview returns the invitation above, `inviter: { profileId, email }` (nullable inviter email), and `managedProfile: { profileId, externalSubjectId }`. It can return `pending`, `accepted`, `cancelled`, or `expired`. An unknown UUID or mismatched/unverified email returns generic `403 MANAGED_PROFILE_ACCESS_DENIED` without child, inviter, role, or status details.

After showing the child and role to the invitee, explicitly accept with **no request body and no managed selector**:

```http
POST /v1/managed-profile-member-invitations/00000000-0000-0000-0000-000000000004/accept
Authorization: Bearer <operator_access_token>
```

```json
{
  "managedProfileId": "00000000-0000-0000-0000-000000000002",
  "member": {
    "id": "00000000-0000-0000-0000-000000000005",
    "memberProfileId": "00000000-0000-0000-0000-000000000003",
    "role": "manager",
    "isOwner": false,
    "createdAt": "2026-09-07T12:05:00.000Z",
    "updatedAt": "2026-09-07T12:05:00.000Z"
  }
}
```

Acceptance transactionally creates one active membership and `invitation_accepted`/`member_added` events. A previously revoked member receives a new membership row. Replay returns `200` only if the same accepter still has an active membership matching the invitation role; it does not restore access after removal/downgrade or duplicate events. Otherwise an accepted invitation returns `409 INVITATION_ACCEPTED`. Cancelled/expired invitations cannot be accepted.

### 3. Change Access And Audit

Use the **member profile UUID**, not `member.id`, in member mutation paths:

```http
PATCH /v1/managed-profiles/00000000-0000-0000-0000-000000000002/members/00000000-0000-0000-0000-000000000003
Authorization: Bearer <manager_member_access_token>
Content-Type: application/json

{ "role": "read_only" }
```

This returns `{ member }` in the acceptance member shape, with updated role/timestamp and no email. Repeating an unchanged non-owner role writes no new event. `DELETE` on the same path revokes membership; a same-actor retry returns `204` only while that actor retains manager authority. Non-owner managers can downgrade/remove themselves. Owner changes, including a same-role patch, return `409 MANAGED_PROFILE_OWNER_MEMBERSHIP_REQUIRED`.

Member and invitation lists use `limit=1..100` and non-negative `offset` (defaults `50`, `0`), returning `{ limit, offset, total }`. Members are active-only, oldest first by creation time/UUID, and add nullable `email` to each member. Invitations include pending and terminal records, newest first by creation time/UUID. There is no invitation status filter. Creation, preview, listing, acceptance and cancellation persist observed expiry once.

Events use `?limit=50&cursor=<event_uuid>`, newest first by creation time/UUID, returning `pagination: { limit, nextCursor }`. The cursor must belong to this child; `null` means there are no older events. `offset` is validated if supplied but ignored. Each event contains `id`, `action`, `createdAt`, and nullable `actorProfileId`, `memberProfileId`, `invitationId`, `previousRole`, `role`. Actions are `invited`, `invitation_accepted`, `invitation_cancelled`, `invitation_expired`, `member_added`, `role_changed`, `member_removed`. Events omit email, invitation URLs and secrets.

Membership routes share a per-actor limit of 120 requests/minute (`429` text response with standard rate-limit headers). Authentication errors use `{ "error": "..." }`: `401` for missing/invalid sessions and `503` for transient authentication unavailability. Service errors use `{ "error": { "code", "message", "status" } }`.

Unlike token import and selected-child bearer ramp rejection, membership routes run after the global body parser. Malformed JSON returns `400`; bodies exceeding 20 MB return `413`, before membership authentication. Parser errors use `{ code, message, statusCode, type }`, not the service error wrapper.

| Status/code | Meaning |
|---|---|
| `400 MANAGED_PROFILE_INVALID_INPUT` | Path IDs must be UUIDs. |
| `400 INVALID_PAGINATION` | Invalid page size/offset or event cursor, including a cursor outside the child. |
| `400 INVALID_MEMBERSHIP_ROLE` / `INVALID_INVITATION_EMAIL` | Invalid role or creation email. |
| `403 MANAGED_PROFILE_ACCESS_DENIED` | Missing child authority, forbidden API-key headers, mismatched selector, or unauthorized invitee. |
| `403 IMPERSONATION_NOT_ALLOWED` | All membership operations reject impersonation. |
| `404 MEMBER_NOT_FOUND` / `INVITATION_NOT_FOUND` | The authorized child's mutation target is absent. Invitee probing uses `403`, not `404`. |
| `409 INVITATION_ROLE_CONFLICT` | Cancel the pending invite before changing its role. |
| `409 MEMBERSHIP_ALREADY_EXISTS` | An active child membership already exists. |
| `409 INVITATION_ACCEPTED` / `INVITATION_CANCELLED` / `INVITATION_EXPIRED` | Terminal invitation; repeated cancellation also conflicts. |
| `500 INTERNAL_SERVER_ERROR` | Membership request could not be processed. |

## Onboard A Child

Onboarding is corridor-specific. Discover the flow with `GET /v1/onboarding/requirements?country=<XX>&customerType=<type>` and follow the behavioral rules in [Fiat Corridors](https://api-docs.vortexfinance.co/fiat-corridors); every referenced operation accepts the delegation header, subject to your corridor policy. Track progress with `GET /v1/onboarding/status` under the same header.

Worked example — Brazilian individual via Sumsub share-token import, the fastest path when your platform already verifies users with Sumsub:

```http
POST /v1/brl/createSubaccount
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
Content-Type: application/json

{ "accountType": "INDIVIDUAL", "name": "Ana Maria Silva", "taxId": "12345678901" }
```

```http
POST /v1/brl/kyc/import-token
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
Idempotency-Key: kyc-import-customer-4711-01
Content-Type: application/json

{ "importToken": "<opaque-sumsub-share-token>", "consentAttested": true }
```

Then poll `GET /v1/onboarding/status` (with the header) until the corridor reports approval. Order matters: **import the token before any KYC status read for that child** — the first status read on a fresh account permanently selects the standard verification method, after which token import returns `409`. The token itself must be generated for the provider's configured Sumsub recipient; see the import section of [Fiat Corridors](https://api-docs.vortexfinance.co/fiat-corridors) for the full retry, consent, and secret-handling rules.

## Ramp On Behalf Of A Child

Once the child's KYC/KYB is approved, the entire ramp lifecycle accepts the delegation header — quote creation; ramp register, update, start, status, history, and errors; exact limits and sanitized ramp info:

```http
POST /v1/quotes
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
Content-Type: application/json

{
  "rampType": "BUY",
  "from": "pix",
  "to": "polygon",
  "inputAmount": "150",
  "inputCurrency": "BRL",
  "outputCurrency": "USDC"
}
```

Register, sign, and start exactly as described in [Ramp Lifecycle](https://api-docs.vortexfinance.co/ramp-lifecycle) — your backend holds the ephemeral keys and adds the header to each call. The child's payment identity (for BRL, the CPF of its provider account) is derived from the child; do not send identity selectors in the request.

Two things behave differently for managed children:

- **Pricing** is resolved as: the child's own partner-pricing assignment if one exists, otherwise **the immutable owner's active assignment**, otherwise default Vortex pricing, identically for delegated calls and direct child credentials. A non-owner member's personal pricing does not override the owner.
- **Webhooks are not supported for managed subjects** — registration returns `400 MANAGED_PROFILE_UNSUPPORTED` with the header and `403` with a child credential. Poll the child-scoped ramp status and history endpoints instead.

## Common Errors

| Response | Meaning |
|---|---|
| `403 MANAGED_PROFILE_ACCESS_DENIED` | The relationship, controlling manager, selector, child credential, or entity layout is invalid or inactive. |
| `403 MANAGED_PROFILE_MEMBERSHIP_INVALID` | Matching-selector detail bootstrap has membership history but is no longer eligible, including deleted child or disabled owner; applies to bearer and member-secret callers. |
| `403 MANAGED_PROFILE_OWNER_REQUIRED` | Retained list filters require the actor's own active owner configuration; active non-owner members cannot delete the child. |
| `403 MANAGED_PROFILE_MANAGER_REQUIRED` | The operation requires a `manager` membership; `read_only` is insufficient. |
| `403 MANAGED_PROFILE_RAMP_REQUIRES_API_CREDENTIAL` | A selected-child ramp mutation requires your member-owned secret credential, not a bearer session. |
| `403 MANAGED_PROFILE_REQUIRES_API_CREDENTIAL` | A selected-child provider/KYC/KYB mutation requires your member-owned secret, not a bearer session. |
| `403 MANAGED_PROFILE_POLICY_DENIED` | The controlling owner's current corridor or customer-type policy does not allow the operation. |
| `400 MANAGED_PROFILE_UNSUPPORTED` | The endpoint does not support delegation, including webhook management and invitee preview/acceptance. |
| `404 MANAGED_PROFILE_NOT_FOUND` on path-child routes | Unknown/never-member child, missing membership on an ordinary detail read, or ineligible/invited-member retained read. Unknown and never-member existing children are masked identically. |
| `200` instead of `201` on create | Idempotent retry — the identical child already exists. |
| `409 CREDENTIAL_LIMIT_REACHED` | The child already has five active, non-expired credentials. |

---
