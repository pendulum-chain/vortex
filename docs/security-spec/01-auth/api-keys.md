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

| Operation | Public key | Secret key | Supabase session |
|---|---:|---:|---:|
| Create quote and apply attribution | Yes | Yes | Yes |
| Create widget session | Yes | Yes | Yes |
| Read sanitized `GET /v1/ramp-info` | Yes | Yes | No |
| Read exact used or remaining financial limits | No | Yes | Yes |
| Register, update, start, or read a ramp | No | Yes | Yes |
| Read ramp history or diagnostic error logs | No | Yes | Yes |
| Manage fiat/provider accounts | No | Yes | Yes |
| Act for an authorized managed child | No | Yes | Yes |
| Use a child-owned credential as the managed child | Public capabilities only | Yes | N/A |
| Manage a directly owned child's credentials | No | Yes | Yes |
| Manage webhooks | No | Yes | No |
| Create, list, or revoke profile-managed credentials | No | No | Yes |
| List or revoke partner-managed credentials of the session's own profile | No | No | Yes |
| Create partner-managed credentials, or manage another profile's | No | No | Admin |

Possession of a public key never authorizes exact financial usage, provider identifiers, ramp history, diagnostics, or mutations. A corresponding secret key is stronger proof and may be accepted on public-key-capable routes.

### Credential Management

`POST`, `GET`, and `DELETE /v1/api-credentials` require a Supabase Bearer session and are owner-scoped to the session's profile: creation always mints profile-managed credentials, while listing and revocation cover every credential of that profile, partner-managed included. Creation generates both values in one transaction, returns the secret once, defaults to one-year expiry, and rejects expiry beyond two years. Listing returns one object per credential and never returns the secret value.

A profile may have at most five non-revoked, non-expired credentials. Creation locks the profile row and performs the active count and insert in one transaction, preventing concurrent requests from exceeding the cap. `DELETE /v1/api-credentials/:credentialId` updates the one row's `revoked_at`, atomically disabling both values without a request body or second key ID.

Admin partner credential operations use the same lifecycle service and require an explicit existing `profile_id` subject. The legacy `POST /v1/admin/managed-profiles` flow provisions a genuine Supabase identity and Vortex profile from explicit `partnerId`, `externalUserId`, email, and `individual`, `business`, or `technical` subject type. The `(partner_id, external_user_id)` and `profile_id` associations are unique; an existing email is reconciled only when its immutable Supabase metadata matches the same association. Individual/business subjects receive the matching customer entity. OTP verification marks the identity claimed without duplicating it. Technical subjects receive no customer entity and are explicitly rejected from customer/ramp operations. The separate headless provisioning service atomically creates a null-login-email managed profile, its active customer entity, immutable provider contact email, and manager relationship. A manager session or secret credential may issue profile-managed credentials for a directly owned active child only through the manager-scoped child-credential route; generic profile-managed and admin partner-managed credential creation reject managed subjects.

### Public And Secret Consistency

When both `X-Public-Key` and `X-API-Key` are supplied, both values are resolved and their `credentialId` values must match. A mismatch returns `403 CREDENTIAL_MISMATCH`; the server must not combine the public value's attribution with the secret value's subject. A quote-body/query `apiKey` and `X-Public-Key` that differ also return `403 CREDENTIAL_MISMATCH`. With a matching pair, the secret context is authoritative.

### Sanitized Ramp Info

`GET /v1/ramp-info` accepts `X-Public-Key` or the corresponding `X-API-Key`. It derives the profile from `CredentialContext.profileId`, except that a manager secret may select one authorized child through `X-Managed-Profile-Id`. A public key cannot authorize that selector. Direct child credentials resolve their own child profile. The endpoint does not accept body/query user, profile, email, tax-ID, or customer-entity selectors, and Supabase sessions are not accepted.

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
14. **Revocation MUST disable both values atomically**: one owner-scoped update sets `revoked_at` on the credential row.
15. **Usage timestamps MUST be independent and best-effort**: public and secret validation update their respective last-used timestamps without making auth success depend on the telemetry write.
16. **Ramp registration MUST resolve a real profile**: secret credentials and sessions act only for their bound profile; public keys cannot register ramps or select a profile.
17. **Managed partner subjects MUST be first-class identities**: each real individual, business, or technical subject gets a genuine unique profile and immutable partner/external-user association; individual/business subjects get the matching customer entity, while technical subjects get none and cannot perform customer or ramp operations. No shared dummy profile is allowed.
18. **There MUST be no legacy request-path fallback**: runtime validation reads only `api_credentials`; it does not read `api_keys`, bcrypt hashes, old prefixes, unpaired halves, or name-based relationships.
19. **Startup MUST fail closed**: after migrations and before listening, the API verifies required `api_credentials` columns, nullability, indexes, constraints, and zero active `api_keys` rows. Any failure prevents serving traffic.
20. **`ramp-info` MUST be subject-derived and sanitized**: it accepts no user selector and returns only the documented KYC state and buy/sell booleans.
21. **Managed-profile selection MUST be authorization-derived**: `X-Managed-Profile-Id` is accepted only on delegated routes after a Supabase session or secret credential establishes the manager actor. Secret-key middleware explicitly records the authenticated credential profile; delegated authorization MUST NOT infer authentication by inspecting `CredentialContext.strength`. Authorization requires an active manager, a direct active relationship, a managed child with exactly one customer entity matching its active entity, and every required corridor for corridor-bound operations. The verified child becomes the effective operation subject without replacing the authenticated actor. A direct child credential cannot present the selector to act for another child.
22. **Managed-profile lifecycle MUST remain manager-scoped and logically deleted**: `POST/GET/DELETE /v1/managed-profiles` accepts only a Supabase session or secret credential whose subject is an active configured manager. Creation derives the manager from authentication, requires immutable `externalSubjectId`, `contactEmail`, and customer type values, accepts no corridor grant, is idempotent by `(manager_profile_id, external_subject_id)`, and rejects reuse of a normalized `(manager_profile_id, contact_email)` by another child. Listing defaults to active children; direct reads may return retained deleted children. Foreign children return `404`. Deletion locks the child profile and relationship, atomically marks the relationship deleted and revokes all active child credentials, preserves customer/provider/KYC/ramp records, and returns `204` on repeated requests. Deleted external subject IDs and contact emails remain permanently reserved within that manager.
23. **Child credentials MUST remain relationship-controlled**: `POST/GET/DELETE /v1/managed-profiles/:profileId/api-credentials` requires the active controlling manager, scopes every operation by both manager and child, and is the only credential-issuance path that accepts a managed subject. It issues only `partner_id = NULL` credentials under the child's shared five-active-credential cap. Credential creation locks the child profile and relationship in the same order as logical deletion. Public and secret validation of a managed child's credential dynamically requires the unique relationship and manager to remain active. Corridor-bound routes apply the manager's current grants, and deletion revokes both halves. Direct child credentials cannot manage webhooks or manager lifecycle resources. Manager deactivation, relationship deletion, and corridor changes block authorization decisions that begin after the policy change commits; they do not cancel requests already authorized and in flight. The retained relationship provides manager-level attribution; durable distinction between delegated-manager and direct-child-credential requests is not required unless credential-level attribution becomes a product requirement.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| Secret exposed in browser or telemetry | Public capability exists for browser use; secret values are server-only, returned once, and forbidden from logs/events. |
| Database read leaks usable secret | Only a high-entropy secret's SHA-256 digest and non-secret lookup prefix are stored. |
| Public key escalates to financial access | Route-level capability matrix rejects public keys from sensitive reads and mutations. |
| Caller supplies another manager's child ID | Delegated middleware scopes the active relationship by both authenticated manager and child profile before deriving an effective subject. |
| Public key from one credential is combined with another secret | Resolve both and return `403 CREDENTIAL_MISMATCH` before business logic. |
| Concurrent creation exceeds the cap | Lock the profile, count active non-expired credentials, and insert in one transaction. |
| Revocation leaves one half active | One row and one `revoked_at` update disable both values. |
| Partner deactivation leaves one half active | Public and secret validation both require the credential's partner to be active. |
| Legacy or ambiguous rows remain reachable | No legacy runtime lookup; startup refuses active legacy rows. Production migration uses explicit immutable-ID mappings, never names. |
| Shared managed identity crosses customer ownership | Require one genuine managed profile per subject and immutable partner/external-user association. |
| Public eligibility read leaks PII or exact limits | `ramp-info` uses an explicit projection, accepts no body/query subject selector, and permits the managed-child header only with a manager secret. |
| Deleted or deactivated child credential remains usable | Both credential halves dynamically require the active relationship and manager; logical deletion also revokes every child credential. |

## Audit Checklist

- [x] `api_credentials` stores one public value and one secret digest/prefix with non-null `profile_id`.
- [x] Public and secret validators return the documented `CredentialContext` and reject revoked/expired rows.
- [x] Secret digest comparison is constant-time and lookup is bounded by the indexed 16-character prefix.
- [x] Creation locks the profile and caps active non-expired credentials at five.
- [x] Self-service and admin adapters call the same create/list/revoke service.
- [x] Revocation performs one owner-scoped credential update and takes no paired-key body.
- [x] Public/body/header and public/secret mismatches return `403 CREDENTIAL_MISMATCH`.
- [x] Startup validates the credential schema and refuses any active legacy `api_keys` row.
- [ ] Verify deployment data has zero active legacy, unpaired, or ownerless credentials before cutover; source code cannot prove production data state.
- [x] Managed-profile provisioning is admin-authenticated, idempotent by immutable partner/external-user IDs, unique by profile, rejects conflicting email/association reuse, creates the correct individual/business entity, leaves technical subjects entity-less, and records claims after verified OTP.
- [ ] Add route-level public/secret authentication and cross-user tests for `GET /v1/ramp-info`; the route and sanitized service/controller projection exist, but current tests do not exercise the complete HTTP middleware chain.
- [ ] Verify every capability-matrix row has an HTTP integration test; current middleware and SDK tests cover the core key validation and mismatch behavior, not every row.
