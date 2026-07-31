# API Credential Unification Plan

**Status:** Implemented; production cutover pending

**Rollout boundary:** runtime, dashboard, SDK, managed-profile provisioning, immutable-ID migration tooling, `ramp-info`, and fail-closed startup checks are implemented. Production still requires the operator-reviewed inventory, digest backfill or reissue, managed-profile provisioning, explicit manifest migration, and zero-count gates in the runbook.

**Related PR:** [#1298 — Add limits and api key handling to dashboard](https://github.com/pendulum-chain/vortex/pull/1298)

**Last updated:** 2026-07-31

## Summary

Vortex should represent a public key and secret key as one API credential with one owner, user subject, environment, expiry, and revocation lifecycle. Public and secret keys remain distinct values because they provide different authorization strengths:

- A public `pk_*` key is safe to embed in browser applications. It identifies the credential for quote attribution and explicitly approved low-sensitivity reads such as `ramp-info`.
- A secret `sk_*` key stays server-side. It authenticates ramp operations, financial details, provider-account operations, and webhook management.

Self-service and delegated credentials should not be separate credential types or implementations. Both are created and validated through the same service. The only ownership difference is whether the credential is managed by its subject profile or by a partner.

```text
one API credential
├── public key: identification and low-sensitivity reads
├── secret key: authenticated operations
├── profile: user the credential acts for
└── optional partner: manages and attributes a delegated credential
```

The shared and SDK contracts include public-key-capable `GET /v1/ramp-info`; the backend route and sanitized projection remain an implementation boundary.

## Goals

- Store a public/secret pair as one database record.
- Give both values one atomic creation, expiry, and revocation lifecycle.
- Require every credential to act for one Vortex profile.
- Support users who did not sign up interactively through first-class managed profiles, not shared dummy identities.
- Use the public key for a small, documented set of low-sensitivity operations.
- Require the secret key for sensitive or state-changing operations.
- Produce one request credential context regardless of which key value was presented.
- Remove legacy pairing heuristics and per-key-half management from the runtime.
- Cut production over without a bcrypt or old-table fallback.

## Non-goals

- Public keys are not authentication for sensitive data merely because they are random.
- This work does not introduce general configurable API scopes. Route-level public/secret policy is sufficient until a concrete custom-scope requirement exists.
- This work does not permit a caller to select an arbitrary user with a public key.
- This work does not put secret values in the database, logs, URLs, analytics, or client bundles.

## Core invariants

1. One credential has exactly one public key and one secret key.
2. Every credential has exactly one subject profile.
3. A credential with no partner is managed by its subject profile.
4. A credential with a partner is managed by that partner and acts for its subject profile.
5. The public and secret values of one credential always have the same environment, expiry, and revocation status.
6. Revoking a credential disables both values atomically.
7. A public key identifies only the profile already bound to its credential; public endpoints never accept another user identifier.
8. A secret key is stored only as a SHA-256 digest and 16-character lookup prefix.
9. A public key is stored in plaintext because it is intentionally non-secret and retrievable.
10. When both key values are supplied, they must resolve to the same credential.
11. All ramp registration resolves a real user subject from the secret credential or a Supabase session.
12. Production startup fails closed if an active legacy or incomplete credential remains.

## Target data model

Replace the two-row `api_keys` representation with one `api_credentials` row:

| Column | Constraints and meaning |
| --- | --- |
| `id` | UUID primary key. |
| `name` | One user-facing credential name; no `(Public)` or `(Secret)` suffix. |
| `profile_id` | Non-null FK to the profile the credential acts for. |
| `partner_id` | Nullable FK. Null means profile-managed; non-null means partner-managed and partner-attributed. |
| `environment` | `live` or `test`; both generated values must match it. |
| `public_key_value` | Non-null and unique. Stored in plaintext. |
| `public_last_used_at` | Independent usage timestamp for the public value. |
| `secret_key_prefix` | Non-null 16-character indexed lookup prefix. |
| `secret_key_digest` | Non-null unique SHA-256 digest. |
| `secret_last_used_at` | Independent usage timestamp for the secret value. |
| `expires_at` | Non-null. One-year default and two-year maximum. |
| `revoked_at` | Nullable. Null means not revoked. |
| `created_at`, `updated_at` | Standard audit timestamps. |

An additional `is_active` flag is unnecessary. A credential is usable when `revoked_at IS NULL` and `expires_at > NOW()`.

The current cap of ten active key rows is equivalent to five pairs. Preserve that behavior as `MAX_ACTIVE_CREDENTIALS_PER_PROFILE = 5` unless product explicitly chooses a higher cap.

### Credential forms

| Use case | `profile_id` | `partner_id` | Manager | Runtime subject |
| --- | --- | --- | --- | --- |
| Self-service | Signed-in profile | null | Profile | Same profile |
| Delegated integration | End-user profile | Partner | Partner/admin | End-user profile |
| Partner operational credential | Managed technical profile | Partner | Partner/admin | Technical profile |

The last form may manage partner-wide webhooks, but cannot register a ramp unless its profile owns an eligible customer entity and provider account. Reject an ineligible technical profile at the authorization boundary instead of failing deep inside a provider call.

## Managed profiles

Some existing partners or end users have not completed interactive Vortex signup. Do not solve that with a shared profile or by directly inserting a fake `profiles` row. `profiles.id` is a Supabase Auth identity and provider/KYC ownership is derived through that identity.

Introduce an idempotent managed-profile workflow:

```ts
provisionManagedProfile({
  partnerId,
  externalUserId,
  email
});
```

It must:

- Create or reuse a genuine Supabase identity and Vortex profile.
- Create or select the corresponding customer entity.
- Enforce uniqueness for `(partner_id, external_user_id)`.
- Create one profile per real individual, business, or technical subject; never share a profile across customers.
- Record that the profile was partner-managed.
- Allow the person to claim the same identity later without creating a duplicate profile or customer entity.

Suggested metadata, either on `profiles` or a small partner/profile association:

```text
managed_by_partner_id
external_user_id
provisioning_origin = self_service | partner_managed
claimed_at
```

## Credential context

Public and secret validation should produce the same request context with a different strength:

```ts
interface CredentialContext {
  credentialId: string;
  environment: "live" | "test";
  profileId: string;
  partnerId: string | null;
  strength: "public" | "secret";
}
```

This context replaces business-code dependence on combinations of:

- `req.validatedPublicKey`
- `req.apiKeyUserId`
- `req.authenticatedPartner`
- `partner_name`
- `key_type`

Expose three explicit middleware entry points backed by one credential resolver:

```ts
optionalPublicCredential();
requirePublicCredential();
requireSecretCredential();
```

`requirePublicCredential()` may accept a corresponding secret key as stronger proof. A secret-only route must always reject a public key.

## Capability matrix

| Operation | Public key | Secret key | Supabase session |
| --- | ---: | ---: | ---: |
| Create quote and apply attribution | Yes | Yes | Yes |
| Create widget session | Yes | Yes | Yes |
| Read sanitized `ramp-info` | Yes | Yes | Yes |
| Read exact used or remaining financial limits | No by default | Yes | Yes |
| Register, update, or start a ramp | No | Yes | Yes |
| Read ramp history or diagnostic error logs | No | Yes | Yes |
| Manage fiat accounts | No | Yes | Yes |
| Manage webhooks | No | Yes | No |
| Create, list, or revoke credentials | No | No | Yes or admin |

Keep this table in the security specification and cover each row with an integration test.

## `ramp-info` contract

Add a credential-bound read endpoint:

```http
GET /v1/ramp-info
X-Public-Key: pk_live_...
```

Also accept the corresponding secret through `X-API-Key`.

The endpoint must not accept `userId`, `profileId`, email, tax ID, or customer entity ID. It derives the subject only from the credential:

```ts
const profileId = req.credential.profileId;
```

Return an explicit low-sensitivity projection, for example:

```json
{
  "corridors": {
    "BR": {
      "kycStatus": "approved",
      "canBuy": true,
      "canSell": true
    },
    "MX": {
      "kycStatus": "not_started",
      "canBuy": false,
      "canSell": false
    }
  }
}
```

Do not return through a public-key route:

- Email, names, or tax identifiers.
- Provider customer or subaccount identifiers.
- Wallet or bank-account details.
- KYC failure reasons.
- Ramp or transaction history.
- Exact financial usage unless product and privacy owners explicitly classify it as public.

The unified `/limits` endpoint should remain secret/session-only because it returns exact `max` and `used` amounts. `ramp-info` can reuse the same underlying provider resolution while returning a separate allowlisted projection.

Apply per-credential and per-IP rate limits to public reads.

## Public and secret consistency

When a request contains both values:

1. Resolve both values.
2. Require the same credential ID.
3. Reject a mismatch with `403 CREDENTIAL_MISMATCH`.
4. Use the secret context as authoritative.

When only a secret is present, derive the profile and partner from the secret credential; a public key is not mandatory for an authenticated request.

For a public-only quote, persist its originating credential ID. Registration using a secret must resolve to the same credential. This creates a direct ownership chain:

```text
public quote -> credential ID -> matching secret registration
```

## API behavior

### Creation

- Generate both values in one transaction.
- Return the secret only in the creation response.
- Keep the public value retrievable.
- Use one name, expiry, owner, and subject.
- Enforce the credential cap under a profile row lock.
- Use identical validation and expiry rules for user and admin creation.

### Listing

Return one object per credential:

```json
{
  "id": "credential-uuid",
  "name": "production backend",
  "publicKey": "pk_live_...",
  "secretKeyPrefix": "sk_live_AbCdEf12",
  "publicLastUsedAt": null,
  "secretLastUsedAt": null,
  "expiresAt": "2027-07-31T00:00:00.000Z",
  "revokedAt": null
}
```

Never return the secret value after creation.

### Revocation

```http
DELETE /v1/api-credentials/:credentialId
```

Revocation updates one record and therefore disables both values atomically. The client must not send a second key ID in the request body.

## Implementation phases

### Phase 1: lock contracts and invariants

- Add the capability matrix and lifecycle invariants to the API-key security specification.
- Define the exact `ramp-info` response allowlist.
- Decide explicitly whether any exact limit information is public. Default: no.
- Define stable errors:
  - `INVALID_PUBLIC_KEY`
  - `INVALID_SECRET_KEY`
  - `CREDENTIAL_MISMATCH`
  - `CREDENTIAL_SUBJECT_REQUIRED`
  - `CREDENTIAL_REVOKED`
  - `CREDENTIAL_EXPIRED`
- Add contract tests before changing storage.

**Gate:** the team agrees on exactly what possession of a public key permits.

### Phase 2: introduce the credential schema

Because migration `055-add-credential-id-to-api-keys` has not been deployed, replace its pairing-oriented design rather than adding another abstraction on top of it.

- Add `api_credentials` and its FK/check/index constraints.
- Add a unique public-key index.
- Add an indexed secret lookup prefix and unique digest.
- Store independent public and secret usage timestamps.
- Remove the proposed `credential_id` addition to `api_keys`.
- Add migration preflight checks for incomplete or ambiguous active pairs.

**Gate:** database tests prove an incomplete pair or ownerless active credential cannot be represented.

### Phase 3: build one credential service

Create one service responsible for:

```ts
createCredential();
listCredentials();
revokeCredential();
validatePublicKey();
validateSecretKey();
```

The self-service and admin controllers become thin authorization adapters. Key generation, hashing, validation, expiry, cap enforcement, and revocation must not be duplicated between them.

**Gate:** no lifecycle rule is implemented independently by both controllers.

### Phase 4: replace request identity plumbing

- Attach `CredentialContext` from public and secret middleware.
- Resolve the effective profile from either a Supabase session or the credential context.
- Update quote partner resolution.
- Update quote/ramp ownership checks.
- Update webhook ownership.
- Update limits and provider-account endpoints.
- Record credential ID, strength, safe prefix, and endpoint in observability without logging key values.

**Gate:** business controllers no longer interpret API-key null combinations.

### Phase 5: implement `ramp-info`

- Add the route and an explicit response schema.
- Resolve the subject exclusively from the credential context.
- Reuse provider/KYC resolution behind a sanitized projection.
- Apply credential/IP rate limiting.
- Add negative tests for cross-user access and PII leakage.

**Gate:** a public key cannot select another profile or call any secret-only operation.

### Phase 6: update dashboard and SDK

Dashboard:

- Display one row per credential.
- Show one name, public key, expiry, status, and separate usage timestamps.
- Show the secret only in the creation confirmation.
- Revoke by credential ID with no DELETE body.
- Mark partner-managed credentials clearly in admin views.

SDK:

- Keep `publicKey` and `secretKey` configuration.
- Send the public value through `X-Public-Key` for the new endpoint.
- Keep the secret in `X-API-Key`.
- Add `getRampInfo()`.
- Verify matching credentials when both values are configured.
- Do not require a public key when a valid secret alone is sufficient.

Retain the quote-body `apiKey` field temporarily only if external-client compatibility requires it. Prefer one canonical public-key transport for new endpoints.

### Phase 7: provision managed profiles

Add an admin/partner-only workflow:

```text
external partner user
-> find or create managed Supabase profile
-> create or select customer entity
-> issue credential bound to that profile
```

Test idempotency, duplicate email, external-ID collision, profile claiming, and partner isolation.

**Gate:** every production credential selected for migration has one valid, unique subject profile.

## Production migration runbook

1. Inventory active public and secret rows without exporting secret values from the database.
2. Identify the intended pair and profile for every active credential.
3. Provision managed profiles for users who never completed interactive signup.
4. Run `apps/api/scripts/backfill-api-key-digests.ts` with every available plaintext secret.
5. Revoke and reissue any secret whose plaintext is unavailable.
6. Reject ambiguous or incomplete pairs; do not infer production lifecycle relationships from key names.
7. Temporarily disable credential creation during data migration.
8. Copy verified pairs into `api_credentials`.
9. Verify:
   - Active bcrypt/8-character-prefix secrets: zero.
   - Active unpaired keys: zero.
   - Active credentials without profiles: zero.
   - Duplicate public values or secret digests: zero.
10. Deploy the credential-aware API.
11. Smoke-test public `ramp-info`, public quote, secret ramp registration, secret webhook creation, and atomic revocation.
12. Remove the old-table read path immediately.
13. Drop the legacy table and compatibility code after the rollback window.

If "no legacy keys" means new key values as well as a new storage format, issue entirely new credentials and revoke every old row. Digest backfill is only required when preserving existing secret values.

## Test plan

### Model and migration

- One row contains exactly one public and one secret representation.
- Public value and secret digest are unique.
- Secret prefix lookup remains O(1).
- Expired and revoked credentials fail both validation paths.
- Incomplete, ownerless, and ambiguous active credentials fail migration preflight.

### Authorization

- Public key succeeds on public `ramp-info` and quote endpoints.
- Public key fails every secret-only endpoint.
- Secret key succeeds for the same profile and partner.
- Public and secret values from different credentials fail immediately.
- Public `ramp-info` cannot accept or infer another profile.
- Partner-managed credentials cannot cross partner or profile ownership boundaries.

### Lifecycle

- Creation returns the secret once.
- Listing never returns a secret value.
- Revocation disables both values atomically.
- Expired credentials do not count toward the active cap.
- Concurrent creation cannot exceed the credential cap.
- Public and secret last-used timestamps update independently.

### Managed profiles

- Provisioning is idempotent per partner/external user.
- Two partners cannot claim the same association.
- One technical profile cannot become the subject of unrelated end users.
- Claiming a managed profile does not duplicate customer entities or provider accounts.

### Dashboard and SDK

- Dashboard renders one row per credential.
- Dashboard creates, copies, and revokes a credential.
- SDK supports public-only `getRampInfo()`.
- SDK supports secret-only authenticated operations.
- SDK rejects or surfaces a mismatched configured pair.

## Rollout observability

Monitor by credential ID and safe prefix:

- Public and secret validation failures.
- Credential mismatch responses.
- Public attempts against secret-only routes.
- Missing profile/customer subject failures.
- Legacy migration assertion failures.
- Public `ramp-info` rate-limit events.
- Credential creation and revocation counts.

Never emit full public or secret values in application logs. Although public keys are non-secret, logging only a safe prefix avoids unnecessary long-lived identifiers in centralized telemetry.

## Acceptance criteria

The implementation is complete when:

- One database row represents one public/secret credential.
- Every active credential has one profile subject.
- Self-service and delegated creation use one lifecycle service.
- Public and secret validation produce the same context with different strength.
- `ramp-info` derives its profile solely from that context.
- Public keys cannot perform sensitive operations.
- Mismatched public and secret values fail immediately.
- Revocation and expiry affect both values.
- No active legacy or unpaired API-key rows remain.
- Dashboard, SDK, OpenAPI, security documentation, and integration guidance describe the same model.
- Production startup fails closed when migration invariants are violated.
