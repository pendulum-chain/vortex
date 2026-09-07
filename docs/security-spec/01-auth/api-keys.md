# API Credential Authentication

## What This Does

Vortex represents each public/secret key pair as one `api_credentials` row with one subject, environment, expiry, and revocation lifecycle.

- **Public key (`pk_live_*`, `pk_test_*`)**: browser-safe identification for quote attribution and explicitly approved low-sensitivity reads. Stored in plaintext.
- **Secret key (`sk_live_*`, `sk_test_*`)**: server-side authentication for sensitive or state-changing operations. Stored only as a SHA-256 digest plus a 16-character lookup prefix and compared in constant time.

Both values use `{pk|sk}_{live|test}_{32 alphanumeric characters}`. Validation of either value produces the same context, differing only in strength:

```ts
interface CredentialContext {
  credentialId: string;
  environment: "live" | "test";
  profileId: string;
  partnerId: string | null;
  strength: "public" | "secret";
}
```

Every credential has a non-null `profile_id`. A null `partner_id` is profile-managed; a non-null `partner_id` is partner-managed and partner-attributed while still acting for exactly one profile. Runtime authorization never reads the legacy `api_keys` table and never infers ownership or pairing from a display name.

### Capability Matrix

| Operation                                                               |               Public key | Secret key | Supabase session |
| ----------------------------------------------------------------------- | -----------------------: | ---------: | ---------------: |
| Create quote and apply attribution                                      |                      Yes |        Yes |              Yes |
| Create widget session                                                   |                      Yes |        Yes |              Yes |
| Read sanitized `GET /v1/ramp-info`                                      |                      Yes |        Yes |               No |
| Read exact used or remaining financial limits                           |                       No |        Yes |              Yes |
| Register, update, start, or read a ramp                                 |                       No |        Yes |              Yes |
| Read ramp history or diagnostic error logs                              |                       No |        Yes |              Yes |
| Manage fiat/provider accounts                                           |                       No |        Yes |              Yes |
| Read or manage an authorized managed child, subject to membership role  |                       No |        Yes |              Yes |
| Register, update, or start a selected child's ramp                      |                       No |        Yes |               No |
| Use a child-owned credential as the managed child                       | Public capabilities only |        Yes |              N/A |
| List child credentials through either active membership role            |                       No |        Yes |              Yes |
| Issue/revoke child credentials through any active `manager` membership  |                       No |        Yes |              Yes |
| Selected-child provider/KYC/KYB `credential_manage` mutations            |                       No |        Yes |               No |
| Membership/invitation administration (role-gated)                        |                       No |         No |              Yes |
| Manage webhooks                                                         |                       No |        Yes |               No |
| Create, list, or revoke profile-managed credentials                     |                       No |         No |              Yes |
| List or revoke partner-managed credentials of the session's own profile |                       No |         No |              Yes |
| Create partner-managed credentials, or manage another profile's         |                       No |         No |            Admin |

Possession of a public key never authorizes exact financial usage, provider identifiers, ramp history, diagnostics, or mutations. A corresponding secret key is stronger proof and may be accepted on public-key-capable routes.

### Credential Management

`POST`, `GET`, and `DELETE /v1/api-credentials` require a Supabase Bearer session and are owner-scoped to the session's profile: creation always mints profile-managed credentials, while listing and revocation cover every credential of that profile, partner-managed included. During admin impersonation, listing remains available but creation and revocation return `403 IMPERSONATION_NOT_ALLOWED`. Creation generates both values in one transaction, returns the secret once, defaults to one-year expiry, and rejects expiry beyond two years. Listing returns one object per credential and never returns the secret value.

A profile may have at most five non-revoked, non-expired credentials. Creation locks the profile row and performs the active count and insert in one transaction, preventing concurrent requests from exceeding the cap. `DELETE /v1/api-credentials/:credentialId` updates the one row's `revoked_at`, atomically disabling both values without a request body or second key ID.

Admin partner credential operations use the same lifecycle service and require an explicit existing `profile_id` subject. The legacy `POST /v1/admin/managed-profiles` flow provisions a genuine Supabase identity and Vortex profile from explicit `partnerId`, `externalUserId`, email, and `individual`, `business`, or `technical` subject type. The `(partner_id, external_user_id)` and `profile_id` associations are unique; an existing email is reconciled only when its immutable Supabase metadata matches the same association. Individual/business subjects receive the matching customer entity. OTP verification marks the identity claimed without duplicating it. Technical subjects receive no customer entity and are explicitly rejected from customer/ramp operations. The separate headless provisioning service atomically creates a null-login-email managed profile, its active customer entity, immutable provider contact email, and manager relationship. Any authenticated profile with an active `manager` membership for that child may issue/revoke its profile-managed credentials through the child-scoped credential routes, using its own Supabase session or profile-bound secret. The actor need not own the child or have personal manager configuration; the immutable owner's configuration, child relationship and entity layout must remain valid. Generic profile-managed and admin partner-managed credential creation reject managed subjects.

### Public And Secret Consistency

When both `X-Public-Key` and `X-API-Key` are supplied, both values are resolved and their `credentialId` values must match. A mismatch returns `403 CREDENTIAL_MISMATCH`; the server must not combine the public value's attribution with the secret value's subject. A quote-body/query `apiKey` and `X-Public-Key` that differ also return `403 CREDENTIAL_MISMATCH`. With a matching pair, the secret context is authoritative.

### Sanitized Ramp Info

`GET /v1/ramp-info` accepts `X-Public-Key` or the corresponding `X-API-Key`. It derives the profile from `CredentialContext.profileId`, except that a `manager` or `read_only` member's secret may select one authorized child through `X-Managed-Profile-Id`. A public key cannot authorize that selector. Direct child credentials resolve their own child profile. The endpoint does not accept body/query user, profile, email, tax-ID, or customer-entity selectors, and Supabase sessions are not accepted.

Its response is an allowlisted per-corridor projection:

```json
{
  "corridors": {
    "BR": {
      "kycStatus": "approved",
      "canBuy": true,
      "canSell": true
    }
  }
}
```

`kycStatus` is one of `not_started`, `pending`, `approved`, or `rejected`. The response must not include names, email, tax identifiers, KYC failure reasons, provider/customer/subaccount IDs, customer-entity IDs, wallet or bank details, ramp history, transaction data, or exact financial limits/usage.

## Security Invariants

1. **One credential MUST be one row**: `api_credentials` contains exactly one public value and one secret representation with one profile, optional partner, environment, expiry, and revocation timestamp.
2. **Every credential MUST have a real profile subject**: `profile_id` is non-null and foreign-keyed to `profiles`; ownerless credentials cannot be created or migrated.
3. **Secret keys MUST use only `X-API-Key`**: secret values are never accepted in request bodies, query parameters, or URLs.
4. **Public keys MUST use `X-Public-Key` for new APIs**: the legacy quote/session `apiKey` field is attribution-only compatibility input and must agree with the header when both are present.
5. **Secret material MUST NOT be persisted**: only a SHA-256 digest and indexed 16-character lookup prefix are stored; comparison uses `crypto.timingSafeEqual`.
6. **Format validation MUST precede lookup**: malformed or wrong-type keys are rejected before querying credentials.
7. **Revoked, expired, and partner-deactivated credentials MUST fail both halves**: credential usability requires `revoked_at IS NULL AND expires_at > NOW()`; partner-managed credential usability additionally requires the referenced partner to have `is_active = true`.
8. **Validation MUST return `CredentialContext`**: business code receives credential ID, environment, profile ID, partner ID, and strength rather than interpreting key-row null combinations.
9. **Public capability MUST remain allowlisted**: public possession grants only quote/widget attribution and sanitized `ramp-info`; sensitive reads and all ramp/provider/webhook mutations require secret or session capability as listed above.
10. **Two presented halves MUST match**: different credential IDs return `403 CREDENTIAL_MISMATCH`; no mixed context may continue downstream.
11. **Partner resolution MUST use immutable IDs**: `partner_id` is authoritative. Partner display names are labels and route lookup inputs, never credential-pairing, migration, or authorization evidence.
12. **Credential lifecycle MUST require a session scoped to the subject profile**: `/v1/api-credentials` binds every operation to `req.userId` as `profile_id`. Creation additionally forces `partner_id IS NULL`; list and revoke cover all credentials whose `profile_id` matches the session, including partner-managed ones — the subject a credential acts for may always see and revoke it.
13. **Creation MUST enforce five active credentials atomically**: expired and revoked rows do not count; profile locking serializes concurrent creation.
14. **Revocation MUST disable both values atomically and record when it happened**: one owner-scoped update sets `revoked_at` on the credential row, matching only rows where `revoked_at IS NULL` so a repeated revoke cannot rewrite the time the credential actually stopped being valid. The manager-scoped child-credential path stays idempotent — repeating it still succeeds — but only the first call writes the timestamp.
15. **Usage timestamps MUST be independent and best-effort**: public and secret validation update their respective last-used timestamps without making auth success depend on the telemetry write.
16. **Ramp registration MUST resolve a real profile**: secret credentials and sessions act only for their bound profile; public keys cannot register ramps or select a profile.
17. **Managed partner subjects MUST be first-class identities**: each real individual, business, or technical subject gets a genuine unique profile and immutable partner/external-user association; individual/business subjects get the matching customer entity, while technical subjects get none and cannot perform customer or ramp operations. No shared dummy profile is allowed.
18. **There MUST be no legacy request-path fallback**: runtime validation reads only `api_credentials`; it does not read `api_keys`, bcrypt hashes, old prefixes, unpaired halves, or name-based relationships.
19. **Startup MUST fail closed**: after migrations and before listening, the API verifies required `api_credentials` columns, nullability, indexes, constraints, and that the legacy `api_keys` table is absent. Any failure prevents serving traffic.
20. **`ramp-info` MUST be subject-derived and sanitized**: it accepts no user selector and returns only the documented KYC state and buy/sell booleans.
21. **Managed-profile selection MUST be authorization-derived**: `X-Managed-Profile-Id` is accepted only on delegated routes after a Supabase session or secret credential establishes an authenticated member actor. Secret-key middleware explicitly records the authenticated credential profile; delegated authorization MUST NOT infer authentication by inspecting `CredentialContext.strength`. Authorization requires the actor's active `managed_profile_memberships` row, an active immutable controlling manager, a direct active relationship, a managed child with exactly one customer entity matching its active entity, and, for policy-bound operations, every required corridor, canonical corridor/type support, and inclusion under any non-null owner customer-type narrowing. `read_only` membership permits only explicitly read-classified routes; `manager` membership permits read and management. Provider/KYC/KYB `credential_manage` and ramp capabilities additionally require the manager member's secret credential. Null customer types add no restriction beyond the canonical matrix. The verified child becomes the effective operation subject without replacing the authenticated actor. A direct child credential does not require a member row and cannot present the selector to act for another child.
22. **Managed-profile lifecycle mutations MUST remain owner-scoped and logically deleted**: `POST /v1/managed-profiles` and `DELETE /v1/managed-profiles/:profileId` derive the owner from authentication and do not delegate through membership. A non-owner active member's child deletion returns `403 MANAGED_PROFILE_OWNER_REQUIRED`; outsiders receive masked `404`. During admin impersonation, list/read operations remain available but creation and deletion return `403 IMPERSONATION_NOT_ALLOWED`. Creation requires immutable `externalSubjectId`, `contactEmail`, and customer type values, rejects a customer type outside the owner's non-null `allowedCustomerTypes` narrowing, accepts no corridor grant, is idempotent by `(manager_profile_id, external_subject_id)`, and rejects reuse of a normalized `(manager_profile_id, contact_email)` by another child. List/detail return actor identity, independent provisioning/membership flags, each membership role and immutable owner policy. Default active lists return `200` even when empty; `hasMemberships` counts unpaginated eligible active children, excluding deleted children, inactive owners and invalid entity layouts. Both `status=deleted` and `status=all` require the actor's own active manager configuration and return only its owned children. Retained deleted-child detail reads require the active immutable owner, valid membership/entity layout and no selector; invited members and ineligible retained reads receive masked `404`. Explicit matching-selector bootstrap additionally requires stored membership history before ineligibility returns `MANAGED_PROFILE_MEMBERSHIP_INVALID`; even the owner's deleted-child bootstrap is invalid. Never-member existing and unknown children are masked identically. Bearer and member-secret callers follow the same read rules; see [Managed-Profile Memberships](managed-profile-memberships.md#lifecycle-reads). Deletion locks owner configuration before the child profile and relationship, atomically marks deletion and revokes child credentials, retains compliance/financial records, and returns `204` on retries while owner configuration remains active. Deleted external subject IDs and contact emails remain reserved; database triggers enforce their immutability and ownership.
23. **Child credentials MUST remain membership- and relationship-controlled**: `GET /v1/managed-profiles/:profileId/api-credentials` requires an active `manager` or `read_only` membership; `POST` and `DELETE` require any active `manager` membership, not child ownership or the actor's personal manager configuration. Member-owned secrets and Supabase sessions are supported (`manage` capability). Every operation is scoped to the path child, and this is the only credential-issuance path that accepts a managed subject. A mismatched selector/path is denied. Impersonation permits listing but rejects creation/revocation with `403 IMPERSONATION_NOT_ALLOWED`. Issuance forces `partner_id = NULL` under the child's shared five-active-credential cap. Creation and revocation recheck live actor membership, owner configuration and child entity under the owner-first, child-aggregate, membership lock order, so removal/downgrade before service mutation returns `CREDENTIAL_ACCESS_DENIED`. Public/secret validation of a child credential independently requires the active controlling relationship and owner; member removal does not revoke these shared company credentials. Corridor-bound routes apply the owner's current policy and canonical capability matrix. Child deletion revokes both halves. Direct child credentials cannot administer credentials, membership, webhooks or manager lifecycle resources.
24. **Selected-child ramp execution MUST require a member-owned secret credential before body buffering**: Supabase bearer sessions may perform non-ramp operations allowed by their membership role, but `POST /v1/ramp/register`, `/update`, and `/start` with `X-Managed-Profile-Id` return `403 MANAGED_PROFILE_RAMP_REQUIRES_API_CREDENTIAL`. The guard authenticates the bearer, rejects impersonation first, verifies membership/role, and responds before the global JSON parser or body-derived corridor resolver. Manager-member secret credentials continue through full corridor and ownership authorization. A direct child secret credential remains supported without a selector.
25. **Membership persistence MUST preserve ownership and audit history**: every retained relationship has an active owner `manager` membership; new provisioning atomically creates the profile, customer entity, relationship, owner membership, and append-only `member_added` event. The database permits only authenticated members, one active membership per child/member, and valid `manager|read_only` roles; it prevents changing the immutable owner or downgrading/removing the active owner's membership. Membership and invitation mutations write append-only events atomically. Human membership administration is bearer-only and cannot be performed by either a member-owned or child-owned API credential.

Selected-child provider/KYC/KYB mutations retain the shipped bearer-denial code
`MANAGED_PROFILE_REQUIRES_API_CREDENTIAL`. This secret-only `credential_manage` capability
must not be confused with child credential or domestic fiat-account `manage` operations.

## Threat Vectors & Mitigations

| Threat                                                         | Mitigation                                                                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Secret exposed in browser or telemetry                         | Public capability exists for browser use; secret values are server-only, returned once, and forbidden from logs/events.                                                                                |
| Database read leaks usable secret                              | Only a high-entropy secret's SHA-256 digest and non-secret lookup prefix are stored.                                                                                                                   |
| Public key escalates to financial access                       | Route-level capability matrix rejects public keys from sensitive reads and mutations.                                                                                                                  |
| Caller supplies another owner's child ID                       | Delegated middleware requires the actor's live membership for that exact child and the immutable owner's active relationship before deriving the subject.                                               |
| Public key from one credential is combined with another secret | Resolve both and return `403 CREDENTIAL_MISMATCH` before business logic.                                                                                                                               |
| Concurrent creation exceeds the cap                            | Lock the profile, count active non-expired credentials, and insert in one transaction.                                                                                                                 |
| Revocation leaves one half active                              | One row and one `revoked_at` update disable both values.                                                                                                                                               |
| Partner deactivation leaves one half active                    | Public and secret validation both require the credential's partner to be active.                                                                                                                       |
| Legacy or ambiguous rows remain reachable                      | No legacy runtime lookup; migration 061 rejects active legacy rows and removes the table, and startup requires it to be absent. Production migration uses explicit immutable-ID mappings, never names. |
| Shared managed identity crosses customer ownership             | Require one genuine managed profile per subject and immutable partner/external-user association.                                                                                                       |
| Public eligibility read leaks PII or exact limits              | `ramp-info` uses an explicit projection, accepts no body/query subject selector, and permits the managed-child header only with an eligible member's secret.                                             |
| Deleted or deactivated child credential remains usable         | Both credential halves dynamically require the active relationship and manager; logical deletion also revokes every child credential.                                                                  |

## Audit Checklist

- [x] `api_credentials` stores one public value and one secret digest/prefix with non-null `profile_id`.
- [x] Public and secret validators return the documented `CredentialContext` and reject revoked/expired rows.
- [x] Secret digest comparison is constant-time and lookup is bounded by the indexed 16-character prefix.
- [x] Creation locks the profile and caps active non-expired credentials at five.
- [x] Self-service and admin adapters call the same create/list/revoke service.
- [x] Revocation performs one owner-scoped credential update and takes no paired-key body.
- [x] Public/body/header and public/secret mismatches return `403 CREDENTIAL_MISMATCH`.
- [x] Startup validates the credential schema and requires the legacy `api_keys` table to be absent.
- [ ] Verify deployment data has zero active legacy, unpaired, or ownerless credentials before cutover; source code cannot prove production data state.
- [x] Managed-profile provisioning is admin-authenticated, idempotent by immutable partner/external-user IDs, unique by profile, rejects conflicting email/association reuse, creates the correct individual/business entity, leaves technical subjects entity-less, and records claims after verified OTP.
- [ ] Add route-level public/secret authentication and cross-user tests for `GET /v1/ramp-info`; the route and sanitized service/controller projection exist, but current tests do not exercise the complete HTTP middleware chain.
- [ ] Verify every capability-matrix row has an HTTP integration test; current middleware and SDK tests cover the core key validation and mismatch behavior, not every row.
