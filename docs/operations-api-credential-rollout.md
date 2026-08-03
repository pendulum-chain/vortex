# API Credential Production Rollout

Status: current for the credential implementation in PR #1298. The managed-profile
steps describe the claimable Supabase workflow currently implemented on that branch and
must be revised before rollout if
[`proposal-headless-partner-managed-profiles.md`](proposal-headless-partner-managed-profiles.md)
is implemented.

## Purpose

Cut production from legacy `api_keys` halves to one `api_credentials` row per public/secret credential without runtime fallback, ambiguous pairing, or ownerless subjects.

## Non-Negotiable Rules

- Do not infer a pair, owner, partner, or profile from a display name, `(Public)`/`(Secret)` suffix, prefix similarity, creation time, or list position.
- Use immutable legacy row IDs, partner IDs, profile IDs, and external user IDs in every migration decision.
- Do not export secret plaintext from the database; it is not stored there.
- Do not deploy until active legacy, unpaired, ambiguous, and ownerless counts are all zero.
- Keep credential creation disabled during the final inventory, copy, verification, and cutover window.

## 1. Inventory And Freeze

1. Disable self-service and admin credential creation for the migration window.
2. Export an inventory of active legacy rows containing immutable row ID, key type, partner ID, profile ID, environment, expiry, digest/hash form, and safe prefix only.
3. Record every intended production credential in an explicit reviewed manifest. Each entry must name exactly one public-row ID, one secret-row ID, one profile ID, and optional partner ID.
4. Reject duplicate row IDs, missing halves, environment/expiry disagreement, ambiguous candidates, inactive partners, missing profiles, or one row assigned to multiple manifest entries.

The repository migration accepts an array whose entries have exactly this shape:

```json
{
  "publicKeyId": "immutable-public-row-uuid",
  "secretKeyId": "immutable-secret-row-uuid",
  "profileId": "immutable-profile-uuid",
  "partnerId": null,
  "name": "production backend",
  "expiresAt": "2027-07-31T00:00:00.000Z"
}
```

Display names may be included for operator readability but must never drive matching.

## 2. Backfill Secret Digests First

For credentials whose existing secret value must be preserved, run `bun backfill:api-key-digests` from `apps/api` with the original plaintext supplied from the partner's secret manager. Verify that each selected secret has a valid SHA-256 digest and 16-character lookup prefix before constructing unified rows.

If plaintext is unavailable, the credential cannot be safely preserved. Exclude it from the migration manifest, reissue a unified credential after its subject is ready, distribute the new secret through the approved secure channel, and explicitly revoke both old rows before preflight. Never add a bcrypt, broad scan, old-prefix, or old-table runtime fallback.

Digest backfill establishes secret verifiability only. It does not establish which public half, subject, or partner belongs to that secret; the reviewed immutable-ID manifest is authoritative for those relationships.

## 3. Provision Managed Profiles

Before migrating partner-managed credentials, ensure every manifest entry has a genuine Supabase identity and Vortex profile for the real individual, business, or technical subject.

- Provision idempotently by immutable `(partner_id, external_user_id)`.
- Create or select the subject's customer entity and preserve provider/KYC ownership.
- Isolate associations between partners.
- Support later identity claiming without duplicate profiles, entities, or provider accounts.
- Never directly insert fake profiles or reuse a shared dummy profile across customers.
- Do not issue a ramp-capable credential until the profile owns the required eligible entity/provider account.

Entries without an unambiguous valid subject remain blocked; they are not migrated as ownerless credentials.

## 4. Materialize Unified Credentials

1. Run `bun credentials:preflight --manifest <manifest.json>` from `apps/api`. It must prove every active legacy row is explicitly mapped exactly once or already revoked, every immutable profile/partner exists, each pair has the correct types/ownership/environment, and every secret has a SHA-256 digest.
2. Run `bun credentials:migrate --manifest <manifest.json>`. In one database transaction it creates each unified row from the explicit pair and revokes exactly those mapped legacy rows.
3. Verify the transaction result and record each new immutable credential ID in the deployment record.
4. Do not synthesize relationships from names if the manifest is incomplete; stop and correct or reissue the entry.

## 5. Cutover Gates

All gates must be recorded as zero before deployment:

- Active legacy `api_keys` rows: zero.
- Active legacy public or secret halves not represented by exactly one reviewed manifest entry: zero.
- Active unpaired or ambiguous credentials: zero.
- Active credentials without a valid profile: zero.
- Active partner-managed credentials without a valid partner: zero.
- Duplicate public values or secret digests: zero.
- Invalid/missing secret digests or non-16-character lookup prefixes: zero.
- Manifest entries inferred from display names rather than immutable IDs: zero.

Also verify every `api_credentials` row has matching environment/expiry for both capabilities by construction, a non-null profile, and either a null partner (profile-managed) or valid partner FK (partner-managed).

## 6. Deploy And Verify

1. Deploy migrations and the credential-aware API with no legacy request-path reader.
2. Confirm startup passes the schema/index/constraint checks and the active-legacy-row assertion before the listener starts.
3. Smoke-test a public quote, public sanitized `GET /v1/ramp-info`, secret ramp registration, secret webhook management, secret-only operation with no public key, matching public+secret pair, and `403 CREDENTIAL_MISMATCH` for different pairs.
4. Revoke a test credential by credential ID and confirm both public and secret values fail immediately.
5. Confirm list responses never expose secret values and active creation cannot exceed five credentials per profile.
6. Re-enable credential creation only after smoke tests and telemetry review pass.

## 7. Monitor And Roll Back Safely

Monitor safe credential IDs/prefixes for invalid-key failures, mismatches, missing subjects, public attempts on secret-only routes, and startup assertion failures. Never emit full key values.

Rollback may restore the previous application release only if it does not reactivate or depend on migrated legacy rows. Do not bypass startup checks or revive old-table runtime auth to recover traffic. Correct the manifest/data or reissue affected credentials, then redeploy.
