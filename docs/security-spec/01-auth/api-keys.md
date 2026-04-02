# API Key Authentication

## What This Does

The API key system provides authentication for partner integrations (SDK users, third-party platforms). It uses a dual-key architecture:

- **Public keys (`pk_live_*`, `pk_test_*`)** — Included in client-side code (SDK, frontend). Used for tracking which partner initiated a request. Stored in plaintext in the database. Validated via direct DB lookup.
- **Secret keys (`sk_live_*`, `sk_test_*`)** — Server-side only. Used for authenticated operations (creating ramps, managing partner resources). Stored as bcrypt hashes in the database. Validated via prefix lookup + bcrypt comparison.

Key format: `{pk|sk}_{live|test}_{32 alphanumeric characters}` (generated from 32 bytes of `crypto.randomBytes`).

Three middleware components:
- **`apiKeyAuth(options)`** — Factory that returns middleware. Reads `X-API-Key` header. Validates secret keys (sk\_). Optionally validates partner match.
- **`validatePublicKey()`** — Validates public keys from query params or body. For tracking only, not authentication.
- **`enforcePartnerAuth()`** — When `partnerId` is in the request body, enforces that the request is authenticated and the partner matches.

## Security Invariants

1. **Secret keys MUST be transmitted via the `X-API-Key` header only** — Never in query parameters, request body, or URL path. The middleware reads exclusively from `req.headers["x-api-key"]`.
2. **Secret keys MUST be stored as bcrypt hashes** — The raw secret key is never persisted. Only the `keyPrefix` (first 8 chars) and `keyHash` (bcrypt) are stored.
3. **Public keys MUST NOT grant authentication** — The `validateApiKey()` function returns `null` for public keys, explicitly denying authentication. Public keys are for tracking/identification only.
4. **Key format validation MUST precede database lookup** — Both `isValidSecretKeyFormat()` and `isValidApiKeyFormat()` use regex to reject malformed keys before any DB query, preventing injection and unnecessary load.
5. **Partner matching MUST compare names, not IDs** — When `validatePartnerMatch` is enabled, the middleware compares partner names (since one API key can work for multiple partner records with the same name). Both UUID and string name formats for `partnerId` are supported.
6. **Expired keys MUST be rejected** — Both public and secret key validation check `expiresAt` against the current time. Expired keys are treated as invalid.
7. **Key lookup MUST use prefix indexing** — Secret key validation first narrows by `keyPrefix` (first 8 chars), then iterates with bcrypt comparison. This bounds the cost of bcrypt comparisons.
8. **`enforcePartnerAuth` MUST block unauthenticated requests when `partnerId` is present** — If a request includes `partnerId` but has no authenticated partner, it MUST be rejected with 403.
9. **`lastUsedAt` updates MUST be fire-and-forget** — The `keyRecord.update({ lastUsedAt })` call is intentionally not awaited, with errors caught and logged. This MUST NOT block or fail the auth flow.
10. **Key generation MUST use cryptographically secure randomness** — `crypto.randomBytes(32)` is the source. Base64 encoding with character stripping is used to produce the 32-char alphanumeric portion.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Secret key exposure in client code** | Partner accidentally ships sk\_ key in frontend bundle | Middleware rejects pk\_ keys for authentication; documentation emphasizes server-only usage for sk\_ keys |
| **Brute force secret key** | Attacker iterates over possible sk\_ values | 32 chars of alphanumeric = ~190 bits entropy; bcrypt cost factor 10 for comparison; rate limiting on API |
| **Timing attack on key validation** | Attacker measures response time to distinguish "key not found" from "bcrypt mismatch" | Prefix lookup returns all matching keys → bcrypt runs for each → timing varies by key count, not by correctness |
| **Partner impersonation** | Attacker uses one partner's API key with another partner's `partnerId` | `enforcePartnerAuth` compares authenticated partner name against requested partner name; rejects mismatches with 403 |
| **Stale/revoked key usage** | Partner's key is deactivated but still being used | `isActive` flag checked on every validation; expired keys rejected by `expiresAt` check |
| **Key hash enumeration** | Attacker with DB read access tries to use key hashes | bcrypt hashes are one-way; raw keys cannot be recovered from hashes |

## Audit Checklist

- [ ] All endpoints requiring partner auth use `apiKeyAuth({ required: true })` or `enforcePartnerAuth()`
- [ ] Secret key validation (`validateSecretApiKey`) always uses bcrypt comparison, never plaintext comparison
- [ ] Public key validation (`validatePublicApiKey`) stores keys in plaintext (by design for lookup) but never returns auth credentials
- [ ] `getKeyType()` correctly identifies `pk_` as public, `sk_` as secret, and anything else as `null`
- [ ] Regex patterns in `isValidApiKeyFormat` and `isValidSecretKeyFormat` match the documented format exactly: `^(pk|sk)_(live|test)_[a-zA-Z0-9]{32}$`
- [ ] `generateApiKey()` uses `crypto.randomBytes(32)` — not `Math.random()` or other weak sources
- [ ] `hashApiKey()` uses bcrypt with salt rounds ≥ 10
- [ ] Expiration check (`expiresAt`) uses `new Date() > keyRecord.expiresAt`, correctly handling `null` expiresAt (no expiration)
- [ ] `enforcePartnerAuth` returns 403 (not 401) when partnerId is present but no auth provided
- [ ] Partner name comparison is case-sensitive and exact (no normalization that could be exploited)
- [ ] No endpoint accepts secret keys from query parameters or request body
- [ ] Error responses from key validation use distinct error codes (`API_KEY_REQUIRED`, `INVALID_SECRET_KEY`, `INVALID_API_KEY`, `PARTNER_MISMATCH`) without revealing which step failed for valid key formats
