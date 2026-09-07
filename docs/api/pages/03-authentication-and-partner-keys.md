# Authentication And API Keys

Vortex issues one API credential with two values for one profile subject:

- `pk_live_*` / `pk_test_*` is the public value. Send it as `X-Public-Key` for quote/widget attribution and approved low-sensitivity reads. It may be used in browser code.
- `sk_live_*` / `sk_test_*` is the secret value. Send it as `X-API-Key` for sensitive or state-changing operations. It must remain on a trusted server.

Both values share one immutable credential ID, subject profile, optional partner, environment, expiry, and revocation lifecycle. If a request sends both values, they must belong to the same credential or Vortex returns `403 CREDENTIAL_MISMATCH`.

## Capability Matrix

| Task | Public value | Secret value | Supabase Bearer |
|---|---:|---:|---:|
| Quote/widget attribution | Yes | Yes | Yes |
| Sanitized `GET /v1/ramp-info` | Yes | Yes | No |
| Exact limits and provider-account reads | No | Yes | Yes |
| Non-managed ramp register/update/start | No | Yes | Yes |
| Managed-child ramp register/update/start | No | Manager member or direct child | No |
| Managed-child reads, including quotes and ramp status/history/errors | No | Either member role or supported direct child | Either member role |
| Child credentials and domestic fiat-account mutations | No | Manager member | Manager member |
| Selected-child provider/KYC/KYB mutations, including BR token import | No | Manager member | No |
| Membership/invitation administration | No | No | Manager member; either role for lists |
| Membership invitation preview/acceptance | No | No | Exact verified-email invitee |
| Webhook management (non-managed subjects only) | No | Yes | No |
| Profile-managed credential lifecycle | No | No | Yes |

`GET /v1/ramp-info` requires `X-Public-Key` or `X-API-Key`; a Supabase Bearer session does not authorize this endpoint. It returns only per-corridor `kycStatus`, `canBuy`, and `canSell`. A `manager` or `read_only` member's secret may supply `X-Managed-Profile-Id`; public keys may not. It accepts no body/query profile or user selector and does not expose PII, provider identifiers, KYC failure reasons, account details, ramp history, or exact limits. Direct non-managed provider/KYC calls retain their existing secret-or-bearer authentication; selected-child restrictions do not remove that self-service alternative.

## Subject And Partner Binding

Every credential authenticates exactly one Vortex profile. A profile-managed credential has no partner and is managed by its signed-in subject. A partner-managed credential has an optional partner attribution but still authenticates only its bound profile.

Ramp registration requires a real profile subject in every corridor. KYC and provider identity are derived from the authenticated profile unless the request uses the authorized managed-child flow below. For BRL, a supplied `taxId` is only a deprecated cross-check and must match the effective profile. A technical profile can operate only on provider/customer resources it actually owns.

## Act For A Managed Child

Vortex may enable an authenticated profile to provision and own managed children, assigning its allowed corridors and optional customer-type narrowing. Each child has one immutable controlling owner and separate child-scoped memberships for authenticated profiles. An active `manager` or `read_only` member can select that child on supported operations, even without personal owner configuration:

```http
X-API-Key: sk_live_...
X-Managed-Profile-Id: 00000000-0000-0000-0000-000000000002
```

A Supabase Bearer session may replace the member-owned secret only for supported `read` and `manage` operations. A public `pk_*` value cannot authenticate delegation. Vortex verifies live membership and role, active controlling owner and child relationship, the child's single active customer entity, and applicable owner corridor/type policy. An omitted or null customer-type policy adds no restriction beyond the canonical corridor capability matrix; a configured list only narrows it. The member remains the actor; ownership, KYC/provider lookup, and ramp history resolve from the child. Pricing uses the child's active assignment, then the immutable owner's active assignment, then default Vortex pricing, identically for delegation and direct child credentials. The acting member's own manager policy or pricing does not replace the owner's.

### Delegated Capabilities

| Capability | Allowed membership | Selected-child authentication | Routes |
|---|---|---|---|
| `read` | `manager`, `read_only` | Member secret or supported bearer alternative | Quote creation/best quote; ramp status/history/errors; exact limits; onboarding status; BR account/status/document reads; domestic status, customer lookup and fiat-account lists; recipient lists/eligibility; child credential lists |
| `manage` | `manager` | Member secret or bearer | Child credential creation/revocation; domestic fiat-account creation/deletion; sender-side recipient mutations |
| `credential_manage` | `manager` | Member secret only | BR subaccount creation, selfie/upload artifacts, KYC submission/preflight/import, KYB document/UBO creation and submission; domestic customer creation, KYC/KYB redirect links/notifications, retries, information/files and submissions |
| `ramp` | `manager` | Member secret only | `POST /v1/ramp/register`, `/update`, `/start` |

Capability is not inferred from the HTTP method: quote creation is `read`; creating a selfie or hosted KYC/KYB link with `GET` is `credential_manage`. Child API-key management is `manage`, despite its name, and supports a real bearer session. `read_only` cannot mutate through its own secret key. `GET /v1/ramp-info` is the credential-only read exception.

Selected-child provider mutations with a bearer return `403 MANAGED_PROFILE_REQUIRES_API_CREDENTIAL`. Selected-child bearer-only ramp mutations are unconditionally denied before global body parsing, including already registered/in-flight ramps: an otherwise authorized manager receives `403 MANAGED_PROFILE_RAMP_REQUIRES_API_CREDENTIAL`. There is **no drain exception**. Invalid membership, read-only role and impersonation can fail earlier with their own denial codes. Background processing of an already-started ramp does not grant a bearer permission to call register, update or start.

Sender-side recipient operations accept a member-owned secret **only when `X-Managed-Profile-Id` is present**. They also accept bearer sessions. `GET /v1/recipients` and `GET /v1/recipients/:id/eligibility` are `read`; `POST /v1/recipients/invite`, `PATCH /v1/recipients/invitations/:id` (archive/unarchive), and `PATCH /v1/recipients/:id` are `manage`. Without a selector, sender routes remain bearer-only. Direct child credentials are rejected even without a selector. Recipient invite preview/acceptance remain invitee-scoped, bearer-authenticated, and reject managed selection; headless children cannot accept. Recipient invitations establish payment relationships, not managed-profile team membership.

Corridor removal blocks corridor-bound mutations and disallowed exact-limit/recipient eligibility requests, but not quote discovery or historical/status reads. Recipient lists also enforce owner customer-type narrowing. The EUR corridor's flows remain bound to a verified login email and do not support managed children.

`POST /v1/brl/kyc/import-token` is a deliberate exception to direct child credential access. An active `manager` member may call it with a member-owned secret and `X-Managed-Profile-Id`; a selected-child bearer is insufficient. A credential owned by the managed child is rejected with `403 MANAGED_PROFILE_ACCESS_DENIED`, even without the selector. Direct non-managed profiles may import for themselves with their own secret key or session. Public keys and ownerless credentials cannot import. The legacy `/v1/brla/kyc/import-token` path remains an equivalent migration alias.

Authentication, direct-child rejection, and managed authorization run before strict validation of `Idempotency-Key` and the request body. An unauthenticated caller therefore receives an authentication error rather than learning whether a bearer-like personal-data transfer token or attestation is well formed. The request has no profile, user, CPF, subaccount, applicant, entity, or provider-customer selector in its body or query; identity is derived only from the authenticated effective profile.

Webhook registration and deletion do not support managed children. `X-Managed-Profile-Id` returns `400 MANAGED_PROFILE_UNSUPPORTED`, and a direct child credential returns `403 MANAGED_PROFILE_ACCESS_DENIED`. Managed-child integrations must poll the child-scoped ramp status/history endpoints. A manager credential without the selector remains manager-owned and therefore cannot register a webhook for a child-owned quote.

`X-Managed-Profile-Id` is only a selector. On general delegated operations, missing membership or an invalid relationship/layout uses `403 MANAGED_PROFILE_ACCESS_DENIED`; role denial is `MANAGED_PROFILE_MANAGER_REQUIRED` and owner-policy denial is `MANAGED_PROFILE_POLICY_DENIED`. Detail bootstrap is explicitly `GET /v1/managed-profiles/:profileId` with an **exactly matching** selector. It returns `403 MANAGED_PROFILE_MEMBERSHIP_INVALID` only when stored membership history (active or revoked) proves prior access and that child is no longer eligible: revoked membership, deleted child, disabled owner or invalid entity layout. A deleted child invalidates even its owner's bootstrap. Bearer sessions and member-owned secrets follow the same checks; this is not a bearer-only error.

A caller who was never a member receives the same masked `404 MANAGED_PROFILE_NOT_FOUND` for existing and unknown children, with or without a matching selector. A mismatched detail selector receives `403 MANAGED_PROFILE_ACCESS_DENIED`. An ordinary detail read without a selector returns `404` for missing membership; an active member's ordinary read of an active child with disabled owner or invalid layout remains `403 MANAGED_PROFILE_ACCESS_DENIED`. A dashboard may clear selection on membership-invalid, not on `404`, role/policy denial or a transient error. Membership administration routes retain their generic `403` access denial.

### Manage Headless Profiles

This section is the authoritative contract; for a step-by-step walkthrough with examples, see [Managed Profiles](https://api-docs.vortexfinance.co/managed-profiles).

Lifecycle endpoints accept a Supabase session or profile-bound secret credential, with the authority below. Public keys and direct child credentials are rejected. Provisioning, deletion and child credential mutations reject impersonation.

| Endpoint | Purpose |
|---|---|
| `POST /v1/managed-profiles` | Enabled owner only: create an `individual` or `business` child from immutable `externalSubjectId` and provider `contactEmail` |
| `GET /v1/managed-profiles` | List eligible active memberships and actor flags, including an empty `200`; retained filters are owner-only |
| `GET /v1/managed-profiles/:profileId` | Either role for eligible active children; matching selector explicitly requests bootstrap; retained deleted reads are owner-only without selection |
| `DELETE /v1/managed-profiles/:profileId` | Logically delete an owned child and revoke its credentials |
| `POST /v1/managed-profiles/:profileId/api-credentials` | Manager member: issue a child-owned public/secret credential pair |
| `GET /v1/managed-profiles/:profileId/api-credentials` | Either role: list the child's credentials without secret values |
| `DELETE /v1/managed-profiles/:profileId/api-credentials/:credentialId` | Manager member: revoke one child credential |

Creation is not tied to one corridor and may create only an `individual` or `business` child. Every later corridor-bound operation checks the manager's current corridors, optional customer-type narrowing, and Vortex's canonical corridor/type support. Tightening policy blocks later authorization decisions but does not cancel a request already authorized or background processing for a ramp that already started. `POST` returns `201` for a new child and `200` for an identical retry. A deleted external subject remains reserved and cannot create a replacement child. Deletion is idempotent (`204`), preserves compliance and financial history, and blocks new child activity.

Lists accept `status=active|deleted|all`, `limit=1..100`, and a non-negative `offset`; defaults are `active`, `50`, `0`. Both list and detail responses include `actor: { profileId, canProvisionManagedProfiles, hasMemberships }`. `canProvisionManagedProfiles` reflects the actor's own active manager configuration, not its membership role. `hasMemberships` is true when the **unpaginated eligible active-child count** is greater than zero, across all owners and independent of the requested status filter or particular detail read. Eligibility requires an unrevoked allowed-role membership, active owner configuration and child relationship, a managed child, and exactly one active owned entity selected by that child. Deleted children, inactive owners and invalid entity layouts do not count. An empty page can still have `hasMemberships: true`; a retained record can be returned with `hasMemberships: false`.

The default active list returns `200` even without owner configuration or eligible memberships: `managedProfiles: []`, `pagination.total: 0`, and both flags false. An enabled owner with no children has `canProvisionManagedProfiles: true` and `hasMemberships: false`. Both `status=deleted` **and `status=all`** require the actor's own active manager configuration (`403 MANAGED_PROFILE_OWNER_REQUIRED` otherwise) and return **only children owned by that actor**. In particular, `all` is not a superset of the cross-owner active list: it excludes even active invited children owned by others. Retained results still require valid membership and entity layout.

An ordinary retained deleted-child detail read must omit `X-Managed-Profile-Id` and requires the immutable owner, active owner configuration and valid membership/entity layout. Invited members and ineligible retained reads receive masked `404`, identically with bearer or member-secret authentication. A matching selector requests bootstrap instead and cannot access retained records. Each listed/read child includes `membership: { role, isOwner }` and `policy: { allowedCorridors, allowedCustomerTypes }`; there is no singular `manager` field. Creation still returns only `{ managedProfile }` without actor/membership/policy decorations. Disabling an owner removes eligibility for its children, not memberships under other active owners.

The immutable owner membership is always `manager` and cannot be removed or changed. Other manager members may administer non-owner members, but cannot provision siblings for the owner, delete the child, change owner policy/pricing, or change global profile roles. Child secrets remain independent shared company principals: member removal/downgrade does not revoke them. Revoke any exposed child credentials separately; child deletion revokes them all.

Deleting a child as a non-owner with an active `manager` or `read_only` membership returns `403 MANAGED_PROFILE_OWNER_REQUIRED`. A non-owner without active membership receives masked `404`; the immutable owner with disabled configuration receives `403 MANAGED_PROFILE_ACCESS_DENIED`.

### Membership Invitations

All nine team-membership operations require a real Supabase bearer session and reject `X-API-Key`, `X-Public-Key` (even with a valid bearer), and impersonation. Child-path membership routes allow an optional selector only when it matches the path case-insensitively. Invitee preview/acceptance reject any managed selector. See [Managed Profiles](https://api-docs.vortexfinance.co/managed-profiles) for the complete route table, examples, pagination and conflicts.

Creation invites one trimmed/lowercased email to `manager` or `read_only` for seven days and queues one durable email. It does not reveal unrelated profile existence. Repeating an identical pending invite returns `200` without another delivery; a different role returns `409 INVITATION_ROLE_CONFLICT` and requires cancellation first. An already visible active member returns `409 MEMBERSHIP_ALREADY_EXISTS`.

The UUID is only a locator. Preview and explicit acceptance bind the **current verified Supabase email** (`email_confirmed_at` required), not request email or cached profile email. An unknown UUID or mismatched/unverified caller receives generic `403` without invitation details. OTP verification alone grants nothing. Acceptance atomically creates membership and audit events; replay succeeds only for the same accepter with an active membership still matching the invitation role. Cancellation and expiry are terminal; repeated cancellation returns `409`. Member removal does not consume or revoke shared child secrets.

The child contact email is normalized and immutable, is unique among the manager's children, is used for provider customer creation, and never becomes a Supabase login identity. A deleted child's contact email remains reserved for that manager. Partners must supply an email identity they are authorized to use; uniqueness is not global across managers. A child-owned credential authenticates directly as that child without `X-Managed-Profile-Id`. Every use dynamically requires the active manager relationship; corridor-bound mutations and exact-limit reads use the controlling manager's current corridor/type policy. A direct child credential cannot select another managed child. Logical deletion immediately invalidates and revokes both halves.

Provision one genuine managed profile per individual or business when interactive signup is unavailable. Managed profiles are headless: they have no Supabase login, OTP, or later claiming lifecycle. Do not share dummy profiles between customers or infer a subject from a credential display name.

## Secret Handling

Vortex stores only a SHA-256 digest and a safe lookup prefix for the secret value. The full secret is returned once when the credential is created. Store it immediately in a secret manager. Never place it in browser/mobile bundles, URLs, request bodies, screenshots, analytics, logs, support tickets, or source control.

## Provision A Profile-Managed Credential

### 1. Request And Verify An OTP

```http
POST /v1/auth/request-otp
Content-Type: application/json

{ "email": "user@example.com" }
```

```http
POST /v1/auth/verify-otp
Content-Type: application/json

{ "email": "user@example.com", "token": "123456" }
```

Verification returns `access_token`, `refresh_token`, and `user_id`, creating the profile on first sign-in. `POST /v1/auth/refresh` accepts the refresh token when needed.

### 2. Create One Credential

```http
POST /v1/api-credentials
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "production backend",
  "expiresAt": "2027-07-31T00:00:00.000Z"
}
```

Both fields are optional. Expiry defaults to one year, must be in the future, and cannot exceed two years. The response is one resource:

```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "name": "production backend",
  "profileId": "00000000-0000-0000-0000-000000000001",
  "partnerId": null,
  "environment": "live",
  "publicKey": "pk_live_...",
  "secretKey": "sk_live_...",
  "secretKeyPrefix": "16-character safe prefix",
  "publicLastUsedAt": null,
  "secretLastUsedAt": null,
  "expiresAt": "2027-07-31T00:00:00.000Z",
  "revokedAt": null,
  "createdAt": "2026-07-31T00:00:00.000Z",
  "updatedAt": "2026-07-31T00:00:00.000Z"
}
```

The profile may have at most five active, non-expired credentials. Exceeding the cap returns `409 CREDENTIAL_LIMIT_REACHED`. Sandbox issues `*_test_*`; production issues `*_live_*`.

### 3. Configure The SDK

```js
const sdk = new VortexSdk({
  apiBaseUrl: "https://api.vortexfinance.co",
  publicKey: process.env.VORTEX_PUBLIC_KEY,
  secretKey: process.env.VORTEX_SECRET_KEY
});
```

A secret may be configured without a public value when only authenticated operations are needed. A public-only SDK can call `getRampInfo()` and create attributed quotes but cannot register or operate a ramp.

## List And Revoke

- `GET /v1/api-credentials` returns one item per credential. It includes the public value and safe secret prefix, never the secret value.
- `DELETE /v1/api-credentials/{credentialId}` returns `204` and atomically revokes both values. It takes no request body and no second key ID.

Both self-profile endpoints require the subject's Supabase Bearer session. Secret API credentials cannot manage their own profile's credentials through `/v1/api-credentials`; eligible manager-member secrets can administer child credentials through the separate managed-profile routes above.

## Common Errors

| Code | Meaning |
|---|---|
| `INVALID_PUBLIC_KEY` | Public value is unknown, expired, or revoked. |
| `INVALID_SECRET_KEY` / `INVALID_API_KEY` | Secret value is malformed, unknown, expired, or revoked. |
| `CREDENTIAL_MISMATCH` | Presented public/body/header and secret values do not identify one credential. |
| `CREDENTIAL_LIMIT_REACHED` | The profile already has five active non-expired credentials. |
| `CREDENTIAL_NOT_FOUND` | Credential is missing, already revoked, or outside the authenticated manager's scope. |
| `CREDENTIAL_SUBJECT_REQUIRED` | A valid profile subject was not supplied for partner-managed issuance. |

## Webhook Signing Key

`GET /v1/public-key` returns the RSA-PSS public key used to verify webhook signatures. It is unrelated to a `pk_*` API credential value.

---
