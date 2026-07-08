# Security Audit Results — Code vs Spec

> **Started:** 2026-04-02 | **Completed:** 2026-04-02 | **Auditor:** Automated + Manual Review
>
> Each section corresponds to a spec file. Checklist items are marked:
> - `[PASS]` — Code matches spec
> - `[FAIL]` — Code deviates from spec (new finding or confirmation of existing)
> - `[PARTIAL]` — Partially meets spec, needs attention
> - `[N/A]` — Not verifiable from code alone (requires runtime/infra check)
>
> For full finding descriptions, code snippets, and CTO decisions, see [FINDINGS.md](FINDINGS.md).

---

## 00 — System Overview / Architecture

**Spec:** `00-system-overview/architecture.md`

#### 1. `[PASS]` Every route has appropriate auth middleware
Originally a critical gap (multiple ramp/quote/BRLA/maintenance/webhook routes were unauthenticated). Resolved: legacy `pendulum/fundEphemeral`, `moonbeam/execute-xcm`, and `subsidize/*` routes were removed; all `/v1/ramp/*` and `/v1/ramp/quotes(/best)` endpoints now use `requirePartnerOrUserAuth()` (sk_ partner key OR Supabase Bearer) with ownership guards; `requireAuth`/`adminAuth`/`apiKeyAuth` cover the remaining sensitive routes. → [F-013](FINDINGS.md)

#### 2. `[FAIL]` No controller directly accesses `process.env` for secrets
`PENDULUM_FUNDING_SEED` accessed directly via `process.env` in `pendulum.service.ts`, bypassing centralized config. Other violations are low-severity (URL configs, non-critical API keys). → [F-016](FINDINGS.md)

#### 3. `[PASS]` Ephemeral key secrets never appear in API request/response payloads or logs
Clients send `signingAccounts` (addresses only). No private keys in request/response schemas or logs.

#### 4. `[PASS]` Phase processor always reads fresh state from DB before executing a phase
Fresh `RampState.findByPk(rampId)` on every `processRamp()` call. Lock mechanism prevents concurrent modification (though non-atomic — F-003).

#### 5. `[FAIL]` All external API calls have timeout configuration
Most external `fetch()` calls (Mykobo, BRLA, CoinGecko, Moonpay, Transak, AlchemyPay, Slack, Subscan) lack `AbortController`/timeout. Only `webhook-delivery.service.ts` has a 30s timeout. → [F-014](FINDINGS.md)

#### 6. `[PARTIAL]` Error responses never leak internal state, stack traces, or secret material
Stack traces stripped in production. However, raw `err.message` from internal errors passed to API responses in some paths. → [F-015](FINDINGS.md)

#### 7. `[N/A]` Database connection uses TLS in production
No explicit SSL/TLS in Sequelize config. Depends on database hosting (e.g., Supabase enforces TLS at server level). → [F-017](FINDINGS.md)

#### 8. `[PASS]` Rate limiting is applied at the network edge before auth middleware
Rate limiter applied before routes in middleware chain.

#### 9. `[PASS]` CORS configuration restricts origins to known frontend domains
Static origin whitelist. No wildcard, no dynamic reflection. Staging origin always present (tracked as F-036).

#### 10. `[PASS]` Rebalancer keys are distinct from API server keys
Different env var names and separate config files.

### Architecture Audit Summary

| # | Check | Result |
|---|---|---|
| 1 | All routes have auth middleware | ✅ PASS — F-013 resolved |
| 2 | No direct `process.env` in controllers | 🔴 FAIL — F-016 |
| 3 | Ephemeral keys not in payloads/logs | ✅ PASS |
| 4 | Phase processor reads fresh state | ✅ PASS |
| 5 | External API calls have timeouts | 🟠 FAIL — F-014 |
| 6 | Error responses don't leak internals | 🟡 PARTIAL — F-015 |
| 7 | Database uses TLS | ❓ N/A — F-017 |
| 8 | Rate limiting before auth | ✅ PASS |
| 9 | CORS restricts to known origins | ✅ PASS |
| 10 | Rebalancer keys distinct | ✅ PASS |

### New Findings from Architecture Audit

| ID | Severity | Summary |
|---|---|---|
| F-013 | ✅ RESOLVED | Multiple security-sensitive endpoints had no authentication middleware (now strict dual-track auth + ownership guards) |
| F-014 | 🟠 HIGH | Most external HTTP `fetch()` calls lack timeout — hanging services can stall ramp processing |
| F-015 | 🟡 MEDIUM | Raw `err.message` from internal errors passed to API responses |
| F-016 | 🟡 MEDIUM | `PENDULUM_FUNDING_SEED` accessed directly via `process.env` in service file |
| F-017 | 🔵 LOW | Database TLS not explicitly configured in Sequelize options |

---

## 01 — Auth / Supabase OTP

**Spec:** `01-auth/supabase-otp.md`

#### 1. `[PASS]` `requireAuth` applied to all protected endpoints
Resolved alongside F-013. `/v1/ramp/*` endpoints now require either `X-API-Key: sk_*` (partner) or `Authorization: Bearer` (Supabase user) via `requirePartnerOrUserAuth()`; `/v1/brla/*` user-data endpoints use `requireAuth`; `adminAuth` and `apiKeyAuth` cover maintenance and webhook routes respectively.

#### 2. `[PASS]` `optionalAuth` only where unauthenticated access is intentionally allowed
Used on ramp `/register`, quote creation, BRLA KYC — all reasonable uses.

#### 3. `[FAIL]` `verifyToken()` uses service role key, not anon key
Uses anon-key Supabase client. Functionally correct (server-side verification happens regardless), but deviates from spec. → [F-018](FINDINGS.md)

#### 4. `[PASS]` `Bearer ` prefix check includes trailing space
Correct `startsWith("Bearer ")` with `substring(7)` extraction.

#### 5. `[PASS]` `req.userId` only set by auth middlewares
Only `requireAuth` and `optionalAuth` set `req.userId`.

#### 6. `[PASS]` Error responses contain no token fragments or internal details
Generic error messages only: "Missing or invalid authorization header", "Invalid or expired token", "Authentication failed".

#### 7. `[PASS]` `optionalAuth` truncates tokens in warning logs
First 15 chars + "..." + last 4 chars.

#### 8. `[FAIL]` Supabase config validated at startup
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` default to `""` with no startup validation. Service starts but auth silently fails. → [F-019](FINDINGS.md)

#### 9. `[PASS]` Token expiry enforced by verification call
Supabase server-side verification checks JWT `exp` claim.

#### 10. `[PARTIAL]` No `optionalAuth` misuse
BRLA KYC endpoints use `optionalAuth` for user-specific resources — questionable but not a standalone finding.

### Supabase OTP Audit Summary

| # | Checklist Item | Result |
|---|---|---|
| 1 | `requireAuth` on all protected endpoints | ✅ PASS — F-013 resolved |
| 2 | `optionalAuth` only where intended | ✅ PASS |
| 3 | `verifyToken()` uses service role key | 🔵 FAIL — F-018 |
| 4 | `Bearer ` prefix check correct | ✅ PASS |
| 5 | `req.userId` only set by auth middleware | ✅ PASS |
| 6 | Error responses leak no data | ✅ PASS |
| 7 | Token truncation in logs | ✅ PASS |
| 8 | Supabase config validated at startup | 🟡 FAIL — F-019 |
| 9 | Token expiry enforced | ✅ PASS |
| 10 | No `optionalAuth` misuse | 🟡 PARTIAL |

### New Findings from Supabase OTP Audit

| ID | Severity | Summary |
|---|---|---|
| F-018 | 🔵 LOW | `verifyToken()` uses anon-key client instead of service-role client |
| F-019 | 🟡 MEDIUM | No startup validation for Supabase config — empty defaults, auth silently fails |

---

## 01 — Auth / API Keys

**Spec:** `01-auth/api-keys.md`

#### 1. `[PARTIAL]` All endpoints requiring partner auth use `apiKeyAuth` or `enforcePartnerAuth`
`enforcePartnerAuth()` is commented out on quote routes. Anyone can pass a `partnerId` without the corresponding secret key. Known design decision.

#### 2. `[PASS]` Secret key validation uses bcrypt
Only comparison path: `bcrypt.compare(apiKey, keyRecord.keyHash)`.

#### 3. `[PASS]` Public key validation never returns auth credentials
Returns `partnerName` or `null` — never credentials.

#### 4. `[PASS]` `getKeyType()` correct
`pk_` → public, `sk_` → secret, else → `null`.

#### 5. `[PASS]` Regex patterns match documented format
`/^(pk|sk)_(live|test)_[a-zA-Z0-9]{32}$/` — anchored, exact match.

#### 6. `[PASS]` `generateApiKey()` uses `crypto.randomBytes(32)`
Cryptographically secure key generation.

#### 7. `[PASS]` `hashApiKey()` uses bcrypt with salt rounds ≥ 10
`saltRounds = 10`.

#### 8. `[PASS]` Expiration check handles null `expiresAt`
Null check before comparison — no expiration if unset.

#### 9. `[PASS]` `enforcePartnerAuth` returns 403
Correct 403 response. Code is currently unreachable (commented out on only route).

#### 10. `[PASS]` Partner name comparison is case-sensitive
Strict equality (`!==`), no normalization.

#### 11. `[PASS]` No secret keys in query parameters or request body
`apiKeyAuth` reads exclusively from `X-API-Key` header.

#### 12. `[PARTIAL]` Error codes don't reveal validation step
`PARTNER_MISMATCH` error includes `authenticatedPartnerName` and `requestedPartnerName` — moderate information disclosure.

### API Key Audit Summary

| # | Checklist Item | Result |
|---|---|---|
| 1 | Partner-auth endpoints use apiKeyAuth/enforcePartnerAuth | 🟡 PARTIAL — `enforcePartnerAuth` commented out |
| 2 | Secret keys use bcrypt | ✅ PASS |
| 3 | Public keys don't grant auth | ✅ PASS |
| 4 | `getKeyType()` correct | ✅ PASS |
| 5 | Regex matches format | ✅ PASS |
| 6 | `generateApiKey()` uses crypto.randomBytes | ✅ PASS |
| 7 | bcrypt salt rounds ≥ 10 | ✅ PASS |
| 8 | Expiration handles null | ✅ PASS |
| 9 | `enforcePartnerAuth` returns 403 | ✅ PASS |
| 10 | Partner name case-sensitive | ✅ PASS |
| 11 | No sk\_ in query/body | ✅ PASS |
| 12 | Error codes don't reveal validation step | 🟡 PARTIAL |

### New Findings from API Key Audit

No new standalone findings. Commented-out `enforcePartnerAuth` and partner name leak in error response are design observations.

---

## 01 — Auth / Admin Auth

**Spec:** `01-auth/admin-auth.md`

#### 1. `[PASS]` `adminAuth` on all admin endpoints
`router.use(adminAuth)` applied globally on admin route file. The maintenance toggle gap previously cross-referenced under F-013 has been closed.

#### 2. `[PASS]` Only `safeCompare` used for comparison
No `===` or `==` comparison of token.

#### 3. `[EXISTING FINDING]` `safeCompare()` leaks secret length
Early return on length mismatch. → [F-010](FINDINGS.md)

#### 4. `[PARTIAL]` `config.adminSecret` validated at startup
Runtime check returns 500 when empty, but no startup validation. Service starts normally with empty `adminSecret`. Analogous to F-019.

#### 5. `[PASS]` No admin endpoint accepts other auth as fallback
Only `adminAuth` is imported and applied.

#### 6. `[PASS]` Admin endpoints not reachable from public frontend
CORS allows all origins for all routes, but auth middleware is the actual protection. Acceptable.

#### 7. `[N/A]` `ADMIN_SECRET` ≥ 32 characters
Deployment config check. No minimum length enforced in code.

#### 8. `[PASS]` No logging middleware captures full Authorization header
Morgan doesn't log auth headers. Auth middleware truncates tokens in logs.

#### 9. `[PASS]` Error response reveals nothing about secret
Generic "Invalid admin token" message.

#### 10. `[FAIL]` Admin auth errors logged with request metadata
Successful rejections (invalid token, missing header) produce **no server-side log**. Only exceptions are logged. → [F-020](FINDINGS.md)

### Admin Auth Audit Summary

| # | Checklist Item | Result |
|---|---|---|
| 1 | `adminAuth` on all admin endpoints | ✅ PASS |
| 2 | Only `safeCompare` used | ✅ PASS |
| 3 | `safeCompare` length leak | ⚠️ EXISTING F-010 |
| 4 | `adminSecret` validated at startup | 🟡 PARTIAL |
| 5 | No fallback auth | ✅ PASS |
| 6 | Admin not reachable from frontend | ✅ PASS |
| 7 | `ADMIN_SECRET` ≥ 32 chars | ❓ N/A |
| 8 | No full auth header logging | ✅ PASS |
| 9 | Error reveals nothing | ✅ PASS |
| 10 | Failed auth logged | 🟡 FAIL — F-020 |

### New Findings from Admin Auth Audit

| ID | Severity | Summary |
|---|---|---|
| F-020 | 🟡 MEDIUM | Failed admin auth attempts (401/403) produce no server-side logs |

---

## 02 — Signing Keys

### 02a — Ephemeral Accounts

**Spec:** `02-signing-keys/ephemeral-accounts.md`

#### 1. `[PASS]` Ephemeral key generation is SDK/frontend only
No production code in `apps/api` generates ephemeral keys. Only test files reference generation functions.

#### 2. `[PASS]` Ramp registration only accepts addresses
`AccountMeta` type contains `{ address, type }` — no private key field.

#### 3. `[N/A]` Stellar ephemeral multisig (2-of-2 thresholds)
Deferred to Module 05 (Stellar transaction construction).

#### 4. `[PASS]` Stellar ephemeral starting balance is bounded
`2.5 XLM`, `0.1 PEN`, `1 GLMR`, `1.5 MATIC` — all reasonably bounded constants.

#### 5. `[PASS]` `storeEphemeralKeys` writes to local filesystem only
Pure `fs/promises.writeFile` — no network calls.

#### 6. `[FAIL]` Ephemeral addresses validated for format
`normalizeAndValidateSigningAccounts()` validates `account.type` but **never validates `account.address`** — no format, length, or chain-specific checks. → [F-021](FINDINGS.md)

#### 7. `[PASS]` No API code logs/persists ephemeral private keys
API only handles addresses and presigned transactions.

#### 8. `[PASS]` `generateEphemerals()` produces fresh keypairs
No caching, memoization, or static references.

#### 9. `[PASS]` Unsigned transactions bound to specific ephemeral addresses
Transaction construction uses registered `signingAccounts` addresses.

#### 10. `[PARTIAL]` API checks if EVM ephemeral address is an EOA
No `getCode()` check. Low practical risk (self-harm scenario).

### Ephemeral Accounts Audit Summary

| # | Checklist Item | Result |
|---|---|---|
| 1 | Ephemeral key gen is SDK-only | ✅ PASS |
| 2 | Registration accepts addresses only | ✅ PASS |
| 3 | Stellar 2-of-2 multisig | ↗️ Deferred to Module 05 |
| 4 | Starting balance bounded | ✅ PASS |
| 5 | `storeEphemeralKeys` local only | ✅ PASS |
| 6 | Ephemeral addresses validated | ❌ FAIL — F-021 |
| 7 | No private keys logged/persisted | ✅ PASS |
| 8 | Fresh keypairs each call | ✅ PASS |
| 9 | Transactions bound to addresses | ✅ PASS |
| 10 | EVM EOA check | 🟡 PARTIAL |

### New Findings from Ephemeral Accounts Audit

| ID | Severity | Summary |
|---|---|---|
| F-021 | 🟡 MEDIUM | No address format validation for ephemeral accounts |

---

### 02b — Server-Side Signing Keys

**Spec:** `02-signing-keys/server-side-signing.md`

#### 1. `[PARTIAL]` `FUNDING_SECRET` purpose separation
Also aliased as `SEP10_MASTER_SECRET` — same key for funding and Stellar web authentication. → [F-022](FINDINGS.md)

#### 2. `[PASS]` `PENDULUM_FUNDING_SEED` used only for funding ephemerals
Used in `subsidize.controller.ts` and `pendulum.service.ts` for funding/subsidization only. Dual access path noted (F-016).

#### 3. `[PARTIAL]` `MOONBEAM_EXECUTOR_PRIVATE_KEY` purpose
Also aliased as `MOONBEAM_FUNDING_PRIVATE_KEY`. One key handles all platform EVM operations. Intentional design decision.

#### 4. `[PASS]` `initializeKeys()` called exactly once at startup
Called once in `initializeApp()`. Singleton pattern ensures one instance.

#### 5. `[PASS]` `getPrivateKey()` is `private`
Not accessible from outside `CryptoService`.

#### 6. `[PASS]` `getPublicKey()` is the only key-exposure method
No method returns the private key. `signPayload()` returns a signature.

#### 7. `[PASS]` Missing `WEBHOOK_PRIVATE_KEY` triggers warning log
Falls back to in-memory key generation with logged warning.

#### 8. `[PASS]` RSA key generation uses 2048-bit modulus
Confirmed `modulusLength: 2048`.

#### 9. `[PASS]` Signing uses RSA-PSS with SHA-256 and max salt
All three parameters confirmed.

#### 10. `[PASS]` No server key in responses/logs/errors
Only derived public keys and addresses exposed. Error messages are generic.

#### 11. `[PASS]` Missing mandatory keys → startup failure
`validateRequiredEnvVars()` checks `FUNDING_SECRET`, `PENDULUM_FUNDING_SEED`, `MOONBEAM_EXECUTOR_PRIVATE_KEY`, `CLIENT_DOMAIN_SECRET`. Missing → `process.exit(1)`.

#### 12. `[N/A]` Funding/executor accounts hold minimal balances
Operational check — cannot verify from code.

#### 13. `[N/A]` Monitoring/alerts for balance changes
No monitoring infrastructure in codebase.

### Server-Side Signing Audit Summary

| # | Checklist Item | Result |
|---|---|---|
| 1 | `FUNDING_SECRET` single-purpose | 🟡 PARTIAL — F-022 (SEP10 alias) |
| 2 | `PENDULUM_FUNDING_SEED` funding only | ✅ PASS |
| 3 | `MOONBEAM_EXECUTOR_PRIVATE_KEY` single-purpose | 🟡 PARTIAL — aliased as funding key |
| 4 | `initializeKeys()` called once | ✅ PASS |
| 5 | `getPrivateKey()` is private | ✅ PASS |
| 6 | Only `getPublicKey()` exposes material | ✅ PASS |
| 7 | Missing webhook key logs warning | ✅ PASS |
| 8 | RSA 2048-bit | ✅ PASS |
| 9 | RSA-PSS + SHA-256 + max salt | ✅ PASS |
| 10 | No keys in responses/logs | ✅ PASS |
| 11 | Missing keys → exit | ✅ PASS |
| 12 | Minimal balances | ❓ N/A |
| 13 | Balance monitoring | ❓ N/A |

### New Findings from Server-Side Signing Audit

| ID | Severity | Summary |
|---|---|---|
| F-022 | 🟡 MEDIUM | `SEP10_MASTER_SECRET` aliased to `FUNDING_SECRET` — key separation violated |

---

## 03 — Ramp Engine

### 03a — State Machine (Phase Processor)

**Spec:** `03-ramp-engine/state-machine.md`

#### 1. `[EXISTING FINDING]` Lock acquisition is non-atomic
Check-then-set pattern with no `SELECT FOR UPDATE` or CAS. → [F-003](FINDINGS.md)

#### 2. `[EXISTING FINDING]` Infinite soft loop after max retries
After max retries, counter is cleared → resets to 0 on next processing cycle → indefinite retries. → [F-004](FINDINGS.md)

#### 3. `[PASS]` `state.update()` restricted to `currentPhase`/`phaseHistory`
`{ fields: ["currentPhase", "phaseHistory"] }` prevents accidental overwrite of other columns.

#### 4. `[PASS]` Terminal states halt recursion and clean up retries
Both `complete` and `failed` call `retriesMap.delete()` with no recursive call.

#### 5. `[PASS]` 10-minute timeout enforced via `Promise.race`
`RecoverablePhaseError` on timeout. `clearTimeout` in `finally`.

#### 6. `[PASS]` `MAX_RETRIES` (8) not bypassed
No code path resets counter during retry loop. Caveat: resets across cycles (F-004).

#### 7. `[PASS]` `minimumWaitSeconds` respected
Used if provided, otherwise 30-second fallback.

#### 8. `[PASS]` `phaseHistory` append-only
Spread operator creates new array with existing entries plus new one.

#### 9. `[PASS]` Error logs include all required fields
Stack trace, error message, phase, recoverability flag, timestamp all present.

#### 10. `[PASS]` No handler mutates `currentPhase` directly
Handlers update operational state only. Phase transitions exclusively via processor.

#### 11. `[PASS]` `lockedRamps` Set cleaned up in `finally`
`releaseLock()` called in `finally` block.

#### 12. `[PASS]` Lock expiry handles edge cases
Missing timestamp, invalid date, and normal case all handled.

#### 13. `[PASS]` Phase processor is singleton
Private static instance with `getInstance()`. Default export is singleton.

### State Machine Audit Summary

| # | Checklist Item | Result |
|---|---|---|
| 1 | Lock non-atomic | ⚠️ EXISTING F-003 |
| 2 | Infinite soft loop | ⚠️ EXISTING F-004 |
| 3 | Update restricted to phase fields | ✅ PASS |
| 4 | Terminal states halt + cleanup | ✅ PASS |
| 5 | 10-min timeout | ✅ PASS |
| 6 | MAX_RETRIES not bypassed | ✅ PASS |
| 7 | minimumWaitSeconds respected | ✅ PASS |
| 8 | phaseHistory append-only | ✅ PASS |
| 9 | Error logs complete | ✅ PASS |
| 10 | No handler mutates currentPhase | ✅ PASS |
| 11 | lockedRamps cleanup | ✅ PASS |
| 12 | Lock expiry edge cases | ✅ PASS |
| 13 | Singleton | ✅ PASS |

No new findings. F-003 and F-004 confirmed as previously documented.

---

### 03b — Quote Lifecycle

**Spec:** `03-ramp-engine/quote-lifecycle.md`

#### 1. `[PASS]` Fees calculated server-side, no client override
Quote pipeline calculates all fees in `BaseFeeEngine`. No fee parameters accepted from client.

#### 2. `[PASS]` Quote expiry hardcoded to 10 minutes
Hardcoded literal `10 * 60 * 1000`. No client parameter or config overrides it.

#### 3. `[PASS]` `discountStateTimeoutMinutes` ≠ quote expiry
Controls partner `difference` adjustment, not `QuoteTicket.expiresAt`. Separate mechanisms.

#### 4. `[PASS]` Quote consumed atomically with ramp creation
Both operations share same DB transaction. `WHERE status = 'pending'` ensures single-use.

#### 5. `[PASS]` `deltaDBasisPoints` step size reasonable
0.3 / 10000 = 0.003% per step. Would take 5+ hours of continuous quoting to accumulate 0.01%.

#### 6. `[N/A]` Dynamic difference caps
Database values — requires DB review.

#### 7. `[EXISTING FINDING]` Dynamic pricing state is in-memory only
Module-level `Map` — lost on restart. → [F-012](FINDINGS.md)

#### 8–9. `[N/A]` Min/max dynamic difference DB constraints
Database schema check needed.

#### 10. `[PASS]` Exchange rates from live on-chain sources
Core swap rate from Nabla DEX (on-chain). Oracle price from Nabla oracle.

#### 11. `[PASS]` Quote response doesn't leak discount internals
`QuoteResponse` excludes `adjustedDifference`, `adjustedTargetDiscount`, subsidy internals.

#### 12. `[PASS]` Quote amounts immutable after creation
Only `status` updated (consumed) or quote destroyed (expired). No amount modification.

#### 13. `[PARTIAL]` Authentication on quote creation
`optionalAuth` + `validatePublicKey` + `apiKeyAuth({ required: false })`. Intentional — SDK creates quotes before login.

#### 14. `[PARTIAL]` Quote ownership verified at registration
No strict ownership check, but mitigated by UUID unpredictability + 10min expiry + single-use.

#### 15. `[PASS]` Subsidy only when `targetDiscount > 0`
Ternary returns `Big(0)` when discount is 0.

#### 16. `[PASS]` `calculateSubsidyAmount` cap correct
`maxSubsidy × expectedOutput` correctly caps the shortfall.

#### 17. `[PASS]` `resolveDiscountPartner` fallback to "vortex"
Falls back to `DEFAULT_PARTNER_NAME = "vortex"` when partner not found.

#### 18. `[N/A]` Monitoring for high subsidization
No monitoring infrastructure.

### Quote Lifecycle Audit Summary

| # | Checklist Item | Result |
|---|---|---|
| 1 | Fees server-side | ✅ PASS |
| 2 | Expiry hardcoded 10 min | ✅ PASS |
| 3 | discountStateTimeout ≠ expiry | ✅ PASS |
| 4 | Atomic quote consumption | ✅ PASS |
| 5 | deltaD step size | ✅ PASS |
| 6 | Dynamic difference caps | ❓ N/A |
| 7 | In-memory pricing state | ⚠️ EXISTING F-012 |
| 8 | minDynamicDifference constraint | ❓ N/A |
| 9 | maxDynamicDifference constraint | ❓ N/A |
| 10 | On-chain exchange rates | ✅ PASS |
| 11 | No discount internals leaked | ✅ PASS |
| 12 | Amounts immutable | ✅ PASS |
| 13 | Auth on quote creation | 🟡 PARTIAL — optional by design |
| 14 | Quote ownership | 🟡 PARTIAL — UUID + expiry mitigation |
| 15 | Subsidy only when discount > 0 | ✅ PASS |
| 16 | Subsidy cap correct | ✅ PASS |
| 17 | Default partner fallback | ✅ PASS |
| 18 | Monitoring for high subsidy | ❓ N/A |

No new findings. F-012 confirmed.

---

### 03c — Fee Integrity

**Spec:** `03-ramp-engine/fee-integrity.md`

#### 1. `[EXISTING FINDING]` Dual fee system discrepancy
Database-based fees (displayed) vs token-config-based fees (deducted). Two paths calculate independently. → [F-002](FINDINGS.md)

#### 2. `[PASS]` All fee calculations use `Big.js`
No native JS `number` arithmetic on monetary amounts.

#### 3. `[PASS]` Negative output protection
`Big.toFixed()` with round-down mode. Fee engines store values, don't subtract.

#### 4. `[PASS]` No fee parameter accepted from client
`QuoteRequest` type has no fee rate/amount/override fields.

#### 5. `[N/A]` Fee config values match intentions
Business review needed.

#### 6. `[PASS]` `distributeFees` uses pre-signed transactions
Fee distribution locked at quote time. Handler submits pre-signed tx as-is.

#### 7. `[N/A]` Anchor fees pre-accounted in quoted amount
Deferred to Module 05 integration-specific review.

#### 8. `[PASS]` Fee changes don't affect in-flight ramps
Fees stored in `metadata.fees` at creation. No re-fetch during execution.

### Fee Integrity Audit Summary

| # | Checklist Item | Result |
|---|---|---|
| 1 | Dual fee system | 🔴 EXISTING F-002 |
| 2 | Big.js for fees | ✅ PASS |
| 3 | Negative output protection | ✅ PASS |
| 4 | No client fee params | ✅ PASS |
| 5 | Fee config correctness | ❓ N/A |
| 6 | distributeFees presigned | ✅ PASS |
| 7 | Anchor fees pre-accounted | ↗️ Deferred to Module 05 |
| 8 | Fee changes don't affect in-flight | ✅ PASS |

No new findings. F-002 confirmed.

---

## Module 04 — Smart Contracts

### Token Relayer (`04-smart-contracts/token-relayer.md`)

**Contract:** `TokenRelayer.sol` (218 lines, pragma ^0.8.28). All 12 prior findings confirmed fixed.

| # | Check | Result |
|---|---|---|
| C-1 | `nonReentrant` + CEI pattern | ✅ PASS |
| C-2 | OZ `ECDSA.recover()` | ✅ PASS |
| C-3 | Contract compiles | ✅ PASS |
| H-1 | Exact approval + revoke | ✅ PASS |
| H-2 | Hardcoded `destinationContract` in digest | ✅ PASS |
| M-1 | `receive()` + `withdrawETH()` | ✅ PASS |
| M-2 | Permit try-catch fallback | ✅ PASS |
| M-3 | Test ABI includes `payloadValue` | ✅ PASS |
| L-1 | `executedCalls` removed | ✅ PASS |
| L-2 | Withdrawal events added | ✅ PASS |
| I-1 | OZ `Ownable` | ✅ PASS |
| I-3 | OZ `EIP712` | ✅ PASS |
| G-1 | OZ dependency pinning | ⚠️ PARTIAL — caret range `^5.2.0`, not exact |
| G-2 | Constructor zero-address check | ✅ PASS |
| G-3 | Owner via Ownable constructor | ✅ PASS |
| G-4 | Nonce before external calls | ✅ PASS |
| G-5 | No selfdestruct/delegatecall | ✅ PASS |
| G-6 | Deployed bytecode verification | ❓ N/A — requires on-chain check |

No new findings. All 12 prior findings verified fixed. OZ caret range is a minor best-practice observation.

---

## Module 05 — Integrations

### 5.1 BRLA Integration

**Spec:** `05-integrations/brla.md`

| # | Check | Result |
|---|---|---|
| 1 | Credentials from env vars | ✅ PASS |
| 2 | Payment confirmation before mint | ✅ PASS — on-chain balance (ground truth) |
| 3 | Correct gross payout amount | ✅ PASS — from stored quote metadata |
| 4 | CPF/tax ID validation | ✅ PASS — `isValidCnpj`/`isValidCpf` |
| 5 | Idempotent subaccount creation | ✅ PASS — tax ID as PK |
| 6 | API response validation | ⚠️ PARTIAL — shared package not audited |
| 7 | RecoverablePhaseError usage | ✅ PASS |
| 8 | HTTPS enforcement | ✅ PASS |
| 9 | No credentials/tax IDs in logs | ⚠️ PARTIAL — generic error handler may leak |
| 10 | Timeout on API calls | 🔴 FAIL — F-014 |
| 11 | Server-side PIX details | ✅ PASS |
| 12 | Reconciliation logging | ⚠️ PARTIAL — implicit only via DB state |

---

### 5.2 Monerium Integration (DEPRECATED — replaced by Mykobo)

**Spec:** `05-integrations/monerium.md` (deprecated; see `05-integrations/mykobo.md` for the current registration-gated EUR rail)

> Monerium is no longer used. EUR on/off-ramp registration is currently gated before provider side effects; when re-enabled, the EUR flow goes through Mykobo on Base. The checks below describe the historical Monerium audit state and are retained for traceability of F-023 / F-024 lineage.

| # | Check | Result |
|---|---|---|
| 1 | Credentials from env vars | ✅ PASS |
| 2 | SEPA confirmation via on-chain balance | ✅ PASS |
| 3 | Minted amount verified on-chain | ✅ PASS |
| 4 | Maximum SEPA wait time | ⚠️ PARTIAL — 30min may be too short for SEPA. → [F-023](FINDINGS.md) |
| 5 | Server-side SEPA details | ✅ PASS |
| 6 | Ephemeral balance verification | ✅ PASS |
| 7 | Idempotency keys | ❓ N/A — polling-based, inherently idempotent |
| 8 | RecoverablePhaseError usage | ✅ PASS |
| 9 | HTTPS enforcement | ✅ PASS |
| 10 | No credentials/IBAN in logs | ⚠️ PARTIAL — error responses could contain data |
| 11 | Timeout on API calls | 🔴 FAIL — F-014 |
| 12 | Concurrent SEPA ramp limit | 🔴 FAIL — no per-user throttle. → [F-024](FINDINGS.md) |

---

### 5.2b Mykobo Integration (REGISTRATION-GATED EUR RAIL)

**Spec:** `05-integrations/mykobo.md`

Mykobo replaces Monerium for EUR on-ramp and Stellar/EURC for EUR off-ramp. EUR registration is currently gated before Mykobo side effects; when re-enabled, both directions flow on Base, mirroring the BRLA-on-Base architecture.

| # | Check | Result |
|---|---|---|
| 1 | Mykobo access/secret keys + base URL from env vars | ✅ PASS — loaded via `packages/shared` config; `MykoboApiService` throws on missing config |
| 2 | `MYKOBO_BASE_URL` HTTPS and `/v<digits>` enforced | ✅ PASS — F-070 fixed: `assertSecureMykoboBaseUrl` enforces HTTPS at construction (localhost permitted in non-production) |
| 3 | On-ramp `mykoboOnrampDeposit` polls Base RPC for EURC arrival | ✅ PASS — `checkEvmBalancePeriodically` against `evmEphemeralAddress` until `mykoboMint.outputAmountRaw` arrives |
| 4 | 24h outer payment timeout; on expiry → `failed` | ✅ PASS — `PAYMENT_TIMEOUT_MS = 24h`, transition to `failed` enforced in handler |
| 5 | 5% recovery tolerance scoped to pre-funded shortcut only | ✅ PASS — `EPHEMERAL_FUNDED_TOLERANCE_FACTOR=0.95` applies only to `ephemeralAlreadyFunded` pre-check; live polling uses full `expectedAmountRaw` |
| 6 | On-ramp intent `wallet_address` = Base ephemeral (not user destination) | ✅ PASS — `prepareMykoboOnrampTransactions` passes `evmEphemeralEntry.address` |
| 7 | Off-ramp intent `wallet_address` = Base ephemeral | ✅ PASS — `prepareEvmToMykoboOfframpTransactions` passes `evmEphemeralEntry.address` |
| 8 | Off-ramp `receivables` address sourced server-side from intent response | ✅ PASS — `mykoboReceivablesAddress = intent.instructions.address` |
| 9 | Off-ramp EURC transfer amount equals `nablaSwapEvm.outputAmountRaw` | ✅ PASS — encoded into the `mykoboPayoutOnBase` presigned tx at registration time |
| 10 | `mykoboPayoutOnBase` advances to `complete` only after on-chain + Mykobo `COMPLETED` | ✅ PASS — `sendMykoboPayoutTransaction` waits for receipt; `pollMykoboUntilCompleted` blocks on `COMPLETED` |
| 11 | `FAILED` / `CANCELLED` / `EXPIRED` → unrecoverable error | ✅ PASS — `createUnrecoverableError` for all three terminal statuses |
| 12 | Recovery: `mykoboPayoutTxHash` short-circuits re-broadcast | ✅ PASS — waits for prior receipt; re-sends only if prior tx reverted |
| 13 | `MykoboApiError` mapped to recoverable/unrecoverable at handler boundary | ✅ PASS — payout handler wraps send failures in `createRecoverableError`; status terminal → unrecoverable |
| 14 | Bearer-token refresh debounced (no thundering-herd on 401) | ✅ PASS — F-071 fixed: `authFailurePromise` debounce added to `handleAuthFailure`, mirroring `tokenPromise` pattern |
| 15 | Token / access / secret keys absent from logs | ⚠️ PARTIAL — `MykoboApiError.body` may carry raw response bodies into logs; no explicit redaction |
| 16 | IBAN payment details surfaced only after presigned-tx validation | ✅ PASS — `ibanPaymentData` returned from `prepareRampTransactions` only after `validatePresignedTxs` succeeds upstream |
| 17 | `/v1/mykobo/profiles` endpoints require Supabase OTP auth | ✅ PASS — F-068 fixed: `requireAuth` added to both GET and POST routes |
| 18 | Mykobo KYC documents not persisted by Vortex | ✅ PASS — multipart form-data streamed through to Mykobo; no local persistence of files or PII beyond the email→profile linkage |
| 19 | HTTPS enforced for all Mykobo API calls | ✅ PASS — F-070 fixed: `assertSecureMykoboBaseUrl` rejects non-HTTPS schemes at construction (localhost permitted in non-production) |
| 20 | Timeout / AbortController on Mykobo HTTP client | 🔴 FAIL — F-014 (cross-cutting; Mykobo `fetch` calls lack explicit `AbortController`, same gap as BRLA/Monerium/CoinGecko/etc.) |
| 21 | Phase handlers never call Mykobo API without explicit recoverable/unrecoverable mapping | ✅ PASS — `mykobo-payout-handler.ts` catches `PhaseError` directly and wraps non-PhaseError exceptions |

---

### 5.3 Alfredpay Integration

**Spec:** `05-integrations/alfredpay.md`

| # | Check | Result |
|---|---|---|
| 1 | Credentials from env vars | ✅ PASS |
| 2 | `validateResultCountry` applied | ✅ PASS — all 9 routes |
| 3 | Enum-based country validation | ✅ PASS |
| 4 | Payment confirmation before mint | ✅ PASS — `Promise.race` balance + status |
| 5 | Correct offramp amount | ✅ PASS — from presigned tx |
| 6 | Permit data validation | ✅ PASS — structure + length + signatures |
| 7 | RecoverablePhaseError usage | ✅ PASS |
| 8 | HTTPS enforcement | ✅ PASS |
| 9 | No credentials in logs | ✅ PASS |
| 10 | Timeout on API calls | 🔴 FAIL — F-014 |
| 11 | Subsidy before transfer | ✅ PASS |

---

### 5.4 Stellar Anchors Integration

**Spec:** `05-integrations/stellar-anchors.md`

| # | Check | Result |
|---|---|---|
| 1 | `isStellarEphemeralFunded` checks existence + trustline | ✅ PASS |
| 2 | Sequence number validation | ✅ PASS |
| 3 | Nonce re-execution guard | ✅ PASS |
| 4 | `AmountExceedsUserBalance` → wait only, no re-submit | ✅ PASS |
| 5 | `verifyStellarPaymentSuccess` checks zero balance | ✅ PASS |
| 6 | `NETWORK_PASSPHRASE` derivation correct | ✅ PASS |
| 7 | `HORIZON_URL` consistency | ⚠️ PARTIAL — import inconsistency between modules. → [F-025](FINDINGS.md) |
| 8 | Presigned redeem extrinsic | ✅ PASS |
| 9 | Stellar XDR submitted as-is | ✅ PASS |
| 10 | `checkBalancePeriodically` 10min timeout | ✅ PASS |
| 11 | No secret keys in logs | ✅ PASS |
| 12 | `@ts-ignore` on nonce call | ⚠️ PARTIAL — suppressed type error. → [F-026](FINDINGS.md) |

---

### 5.5 Squid Router Integration

**Spec:** `05-integrations/squid-router.md`

| # | Check | Result |
|---|---|---|
| 1 | Approve hash persisted before swap | ✅ PASS |
| 2 | `Promise.any` AggregateError handling | ✅ PASS |
| 3 | `calculateGasFeeInUnits` bounds | ✅ PASS — negative guard to "0" |
| 4 | `addNativeGas` correct address/chain | ✅ PASS |
| 5 | Funding vs executor keys distinct env vars | ✅ PASS |
| 6 | `getPublicClient` fallback risk | ⚠️ PARTIAL — silent default to Moonbeam on unknown currency |
| 7 | `isSignedTypedDataArray` validation | ✅ PASS |
| 8 | `RELAYER_ADDRESS` matches deployment | ✅ PASS |
| 9 | Balance check timeout 15min | ✅ PASS |
| 10 | Gas estimate 1.6M reasonable | ✅ PASS |
| 11 | `MAX_FINAL_SETTLEMENT_SUBSIDY_USD` cap | 🔴 FAIL — F-001 (CRITICAL, `throw` missing) |
| 12 | `sendTransactionWithBlindRetry` nonce | ⚠️ PARTIAL — possible double-submit on lost response |
| 13 | `squidRouterPermitExecutionValue` validation | 🔴 FAIL — no null/range check on `msg.value`. → [F-027](FINDINGS.md) |

### New Findings from Module 05

| ID | Severity | Finding | Module |
|---|---|---|---|
| F-023 | ⚪ Superseded | (Historical) Monerium 30-min SEPA timeout — Monerium removed; Mykobo uses 24h | Monerium → Mykobo |
| F-024 | 🟡 Medium | No concurrent SEPA ramp limit per user (now applies to Mykobo) | Mykobo |
| F-025 | 🔵 Low | `HORIZON_URL` import inconsistency between modules | Stellar |
| F-026 | 🔵 Low | `@ts-ignore` on `.nonce.toNumber()` hides potential API incompatibility | Stellar |
| F-027 | 🟡 Medium | `squidRouterPermitExecutionValue` used as `msg.value` without validation | Squid Router |
| F-068 | 🔴 Critical | Mykobo `/v1/mykobo/profiles` GET/POST have no `requireAuth` — anonymous KYC ingestion | Mykobo |
| F-069 | 🟠 High | EUR off-ramp `fundEphemeral.nextPhaseSelector` falls through to `moonbeamToPendulum` (latent stuck-phase bug) | Mykobo / Ramp Engine |
| F-070 | 🟡 Medium | `MYKOBO_BASE_URL` accepts any URL scheme — no HTTPS enforcement | Mykobo |
| F-071 | 🔵 Low | `MykoboApiService.handleAuthFailure` is not debounced — concurrent-401 thundering herd | Mykobo |

---

## Module 06 — Cross-chain

### 6.1 XCM Transfers

**Spec:** `06-cross-chain/xcm-transfers.md`

| # | Check | Result |
|---|---|---|
| 1 | RPC shuffling uses persisted state (UUID-keyed) | ✅ PASS |
| 2 | 30min RecoverablePhaseError on exhaustion | ✅ PASS |
| 3 | Hash registration wait before executeXCM | ✅ PASS |
| 4 | Executor key not logged | ✅ PASS |
| 5 | On-chain receiver contract caller validation | ⚠️ PARTIAL — cannot verify from app code |
| 6 | Pendulum→Moonbeam 3-tier recovery | ✅ PASS |
| 7 | 2-min Moonbeam balance timeout | ✅ PASS |
| 8 | Hydration→AssetHub finalization skip | ✅ PASS — accepted risk, documented |
| 9 | Hydration nonce guard | 🔴 FAIL — warning-only, no skip. → [F-028](FINDINGS.md) |
| 10 | Hydration swap uses presigned extrinsic | ✅ PASS |
| 11 | Pendulum→AssetHub terminal phase | ✅ PASS |
| 12 | Pendulum→Hydration balance wait | ✅ PASS |
| 13 | No private key logging | ✅ PASS |
| 14 | Retry budget isolation | ⚠️ PARTIAL — stale gas price across 5-attempt internal loop |

---

### 6.2 Bridge Security — Spacewalk

**Spec:** `06-cross-chain/bridge-security.md`

| # | Check | Result |
|---|---|---|
| 1 | Vault filters by assetCode AND assetIssuer | ✅ PASS |
| 2 | Capacity check before vault selection | ✅ PASS |
| 3 | Presigned redeem extrinsic | ✅ PASS |
| 4 | Nonce guard skips re-submission | ✅ PASS |
| 5 | `AmountExceedsUserBalance` → wait only | ✅ PASS |
| 6 | Stellar funded check (existence + trustline) | ✅ PASS |
| 7 | 10-minute balance timeout | ✅ PASS |
| 8 | No fallback vault | ✅ PASS |
| 9 | Slash/cancel documented | ⚠️ PARTIAL — no operational runbook |
| 10 | `@ts-ignore` on nonce | 🟡 EXISTING — F-026 |
| 11 | Per-vault tx maximum | ⚠️ PARTIAL — not verified at protocol level |
| 12 | No claimable-balance recovery | ✅ PASS — confirmed absent, documented gap |

---

### 6.3 Fund Routing — Subsidization & Settlement

**Spec:** `06-cross-chain/fund-routing.md`

| # | Check | Result |
|---|---|---|
| 1 | Missing `throw` on USD cap | 🔴 EXISTING — F-001 (CRITICAL) |
| 2 | Pre-swap subsidy: `expected - current` | ✅ PASS |
| 3 | Post-swap subsidy: same pattern | ✅ PASS |
| 4 | Skip when balance sufficient | ✅ PASS |
| 5 | `getFundingAccount()` from `PENDULUM_FUNDING_SEED` | ✅ PASS |
| 6 | `MOONBEAM_FUNDING_PRIVATE_KEY` isolation | 🔴 FAIL — aliased to executor key. → [F-029](FINDINGS.md) |
| 7 | Destination transfer balance check | ✅ PASS |
| 8 | Presigned transfer submitted as-is | ✅ PASS |
| 9 | Swap input bounded | ⚠️ PARTIAL — cap broken (F-001) |
| 10 | Retry on malicious route | 🔴 FAIL — no output validation, retries amplify loss. → [F-030](FINDINGS.md) |
| 11 | Post-swap routing completeness | ⚠️ PARTIAL — no default/error case. → [F-031](FINDINGS.md) |
| 12 | Funding balance pre-check | 🔴 FAIL — no check, opaque errors. → [F-032](FINDINGS.md) |
| 13 | Monitoring/alerting | 🔵 N/A |
| 14 | Cap value ($10 USD) reasonable | ✅ PASS |

### New Findings from Module 06

| ID | Severity | Finding | Sub-module |
|---|---|---|---|
| F-028 | 🟡 Medium | Hydration nonce guard is warning-only + stale gas estimate in retry loop | XCM Transfers |
| F-029 | 🟠 High | `MOONBEAM_FUNDING_PRIVATE_KEY` aliased to `MOONBEAM_EXECUTOR_PRIVATE_KEY` — no blast radius separation | Fund Routing |
| F-030 | 🟡 Medium | SquidRouter swap has no output validation; retries amplify losses from bad routes | Fund Routing |
| F-031 | 🔵 Low | Post-swap routing has no default/error case for unrecognized flow combinations | Fund Routing |
| F-032 | 🟡 Medium | No pre-check of Pendulum funding account balance in subsidy handlers | Fund Routing |

---

## Module 07 — Operations

### 07a — Rebalancer

**Spec:** `07-operations/rebalancer.md`

#### 1. `[PASS]` State file locking
Confirmed limitation: Supabase Storage file overwrite, no locking. One-shot process — concurrency depends on deployment.

#### 2. `[PARTIAL]` `brlaBusinessAccountAddress` hardcoded default
Configurable via env var, but falls back to hardcoded address. Not in `.env.example`.

#### 3. `[PASS]` 5% slippage tolerance
Hardcoded `0.95` multiplier. Reasonable for default small amounts ($1 USD).

#### 4. `[PASS]` Gas 5x multiplier
Aggressive but ensures inclusion on Polygon. Gas is typically cheap.

#### 5. `[PASS]` Coverage ratio threshold
Default Base flow uses asymmetric bounds around 1.0: `1 - REBALANCING_THRESHOLD_BRLA_TO_USDC` for the low-coverage correction and `1 + REBALANCING_THRESHOLD_USDC_TO_BRLA` for the high-coverage flow. Both route-specific thresholds fall back to `REBALANCING_THRESHOLD` and default to `0.01`.

#### 6. `[PASS]` Rebalancer keys distinct from API keys
Different env var names. Actual isolation is operational.

#### 7. `[PARTIAL]` Step idempotency
Steps 2, 3, 5, 6, 7 have crash windows between execution and `saveState()` causing double-spend on re-execution. No tx hash guards or nonce guards. → [F-033](FINDINGS.md)

#### 8. `[PARTIAL]` BRLA→USDC swap amount validation
Legacy BRLA→USDC trusts the BRLA API response. Base high-coverage routes use provider quotes and delta-based arrival checks; Base low-coverage is a Base-only two-swap loop with final balance verification.

#### 9. `[FAIL]` SquidRouter swap amount validation
Legacy SquidRouter never validates received amount matches estimate and its Axelar polling has no timeout (infinite loop risk). The Base SquidRouter route has a 30-minute Axelar timeout and delta-based Base USDC arrival check. → [F-034](FINDINGS.md)

#### 10. `[PASS]` Storage write errors handled
Errors thrown and propagated. Process exits with code 1.

#### 11. `[PARTIAL]` Monitoring/alerting
Slack on success only. No notification on failure, stuck state, or insufficient balance.

#### 12. `[PASS]` No secrets logged
Only env var names, never values.

#### 13. `[PASS]` One-shot process
`process.exit(0/1)` after single run. Concurrency depends on external scheduling.

#### 14. `[PASS]` Missing/corrupted state handled
Returns `undefined` → starts fresh rebalance.

### Rebalancer Summary

| # | Check | Result |
|---|---|---|
| 1 | State file locking | ✅ PASS (confirmed limitation) |
| 2 | Business account address | 🟡 PARTIAL |
| 3 | 5% slippage | ✅ PASS (confirmed limitation) |
| 4 | Gas 5x multiplier | ✅ PASS (confirmed limitation) |
| 5 | Coverage ratio threshold | ✅ PASS |
| 6 | Key isolation | ✅ PASS |
| 7 | Step idempotency | 🟡 PARTIAL — F-033 |
| 8 | BRLA→USDC amount validation | 🟡 PARTIAL |
| 9 | SquidRouter amount validation | 🔴 FAIL — F-034 |
| 10 | Storage write errors | ✅ PASS |
| 11 | Monitoring/alerting | 🟡 PARTIAL |
| 12 | No secrets logged | ✅ PASS |
| 13 | Schedule/trigger | ✅ PASS |
| 14 | Missing/corrupted state | ✅ PASS |

---

### 07b — Secret Management

**Spec:** `07-operations/secret-management.md`

#### 1. `[PASS]` No secrets manager — plain env vars
Confirmed limitation. All secrets via `process.env`.

#### 2. `[PASS]` Ephemeral webhook key if missing
`CryptoService` generates RSA keypair in-memory if env var absent.

#### 3. `[PASS]` No secret rotation mechanism
All env vars loaded at startup. Rotation requires restart.

#### 4. `[PASS]` No secrets hardcoded in source code
Only development defaults for DB credentials.

#### 5. `[PASS]` No secrets in log output
Error messages log env var names, never values.

#### 6. `[PASS]` `SUPABASE_SERVICE_KEY` not exposed to frontend
Frontend uses `SUPABASE_ANON_KEY` (Vite-prefixed). No endpoint returns service key.

#### 7. `[N/A]` Database credentials network-restricted
Infrastructure check.

#### 8. `[PASS]` `.env.example` safe
Only placeholder values.

#### 9. `[PASS]` `.env` in `.gitignore`
Both root and rebalancer `.gitignore` exclude `.env`.

#### 10. `[PASS]` Rebalancer keys isolated
Different env var names from API keys.

#### 11. `[N/A]` `ADMIN_SECRET` entropy
Deployment config. No minimum length in code.

#### 12. `[PASS]` No endpoint leaks env vars or config
Reviewed all 27 route files. No endpoint returns `process.env` or `config`.

#### 13. `[PASS]` `GOOGLE_PRIVATE_KEY` newline handling
`.split(String.raw\`\\n\`).join("\\n")` correctly handles PEM in env vars.

#### 14. `[PASS]` Blast radius mapping comprehensive
All secrets in code documented in spec. No undocumented secrets found.

### Secret Management Summary

| # | Check | Result |
|---|---|---|
| 1 | No secrets manager | ✅ PASS (confirmed) |
| 2 | Ephemeral webhook key | ✅ PASS |
| 3 | No rotation | ✅ PASS (confirmed) |
| 4 | No hardcoded secrets | ✅ PASS |
| 5 | No secrets in logs | ✅ PASS |
| 6 | Service key not exposed | ✅ PASS |
| 7 | DB creds restricted | 🔵 N/A |
| 8 | .env.example safe | ✅ PASS |
| 9 | .env in .gitignore | ✅ PASS |
| 10 | Rebalancer keys isolated | ✅ PASS |
| 11 | Admin secret entropy | 🔵 N/A |
| 12 | No config in responses | ✅ PASS |
| 13 | Google key newlines | ✅ PASS |
| 14 | Blast radius mapped | ✅ PASS |

---

### 07c — API Surface

**Spec:** `07-operations/api-surface.md`

#### 1. `[FAIL]` 50MB body parser limit
`bodyParser.json({ limit: "50mb" })` — no endpoint justifies this. 100 req/min × 50MB = 5GB/min memory pressure per IP. → [F-035](FINDINGS.md)

#### 2. `[FAIL]` Staging CORS origin in production
`staging--pendulum-pay.netlify.app` always in whitelist, not gated by `NODE_ENV`. → [F-036](FINDINGS.md)

#### 3. `[PARTIAL]` Validator coverage
Multiple sensitive POST endpoints lack auth and input validation (`/ramp/update`, `/ramp/start`, `/pendulum/fundEphemeral`, `/moonbeam/execute-xcm`, `/maintenance/schedules/:id/active`, `/webhook`). Full route-by-route audit in FINDINGS.md. → [F-037](FINDINGS.md)

#### 4. `[PASS]` No CORS wildcard or dynamic reflection
Static origin array. `credentials: true` requires specific origin.

#### 5. `[PASS]` Rate limit bypass via `X-Forwarded-For`
`trust proxy` set to specific number (not `true`). Prevents arbitrary spoofing.

#### 6. `[PASS]` Helmet configured with secure defaults
`helmet()` with default config — all protections enabled.

#### 7. `[N/A]` `NODE_ENV` set to production
Default fallback is `"production"` (safe). Runtime check.

#### 8. `[PASS]` Error responses — no internal types/SQL fragments
Stack stripped in production. Validation errors use user-facing field names.

#### 9. `[PASS]` `errors` array contains only user-facing messages
Validator messages reference request field names, not DB internals.

#### 10. `[PARTIAL]` Route auth mapping
Full audit in checklist item 3. Multiple gaps. → F-037

#### 11. `[PASS]` `publicKeyAuth` not used for operations requiring `apiKeyAuth`
`validatePublicKey()` used only for optional partner tracking on quotes.

#### 12. `[N/A]` Controllers don't pass raw `req.body` to database
Controllers reviewed destructure specific fields. Full review deferred.

#### 13. `[PASS]` No endpoint returns `process.env` or internal paths
Verified across all route files.

#### 14. `[PARTIAL]` Cookie SameSite/CSRF
Server reads cookies but doesn't set them. No CSRF tokens, but primary auth uses `Authorization` headers (inherently CSRF-safe). Cookie auth limited to `/stellar/sep10`.

#### 15. `[PASS]` 404 handler — no information leak
Generic "Not found" JSON through standard error handler.

#### 16. `[PASS]` File upload validation
No file upload endpoints. BRLA KYC uses pre-signed URLs for client-side upload.

### API Surface Summary

| # | Check | Result |
|---|---|---|
| 1 | 50MB body limit | 🔴 FAIL — F-035 |
| 2 | Staging CORS origin | 🔴 FAIL — F-036 |
| 3 | Validator coverage | 🟡 PARTIAL — F-037 |
| 4 | No CORS wildcard | ✅ PASS |
| 5 | Rate limit X-Forwarded-For | ✅ PASS |
| 6 | Helmet defaults | ✅ PASS |
| 7 | NODE_ENV production | 🔵 N/A |
| 8 | Error response safety | ✅ PASS |
| 9 | User-facing error messages | ✅ PASS |
| 10 | Route auth mapping | 🟡 PARTIAL — F-037 |
| 11 | publicKeyAuth vs apiKeyAuth | ✅ PASS |
| 12 | Raw req.body to DB | 🔵 N/A (deferred) |
| 13 | No env/config in responses | ✅ PASS |
| 14 | Cookie SameSite/CSRF | 🟡 PARTIAL |
| 15 | 404 handler clean | ✅ PASS |
| 16 | File upload validation | ✅ PASS |

### New Findings from Module 07

| ID | Severity | Finding | Sub-module |
|---|---|---|---|
| F-033 | 🟠 High | Rebalancer steps not idempotent — crash between execution and saveState causes double-spend | Rebalancer |
| F-034 | 🟡 Medium | Rebalancer SquidRouter swap has no output validation and Axelar polling has no timeout | Rebalancer |
| F-035 | 🟡 Medium | 50MB body parser limit enables memory exhaustion | API Surface |
| F-036 | 🟡 Medium | Staging CORS origin always in production whitelist | API Surface |
| F-037 | 🟠 High | Multiple sensitive POST endpoints lack auth and input validation | API Surface |

---

## Final Audit Summary

### Scope

Full security audit covering all 8 modules (00–07) across 23 specification files. Each spec's Audit Checklist was verified item-by-item against actual source code.

| Module | Sub-modules Audited | Checklist Items |
|---|---|---|
| 00 — System Overview | Architecture | 10 |
| 01 — Auth | Supabase OTP, API Keys, Admin Auth | 32 |
| 02 — Signing Keys | Ephemeral Accounts, Server-Side Signing | 23 |
| 03 — Ramp Engine | State Machine, Quote Lifecycle, Fee Integrity | 39 |
| 04 — Smart Contracts | Token Relayer | 18 |
| 05 — Integrations | BRLA, Mykobo (active EUR), Monerium (deprecated), Alfredpay, Stellar Anchors, Squid Router | 60 |
| 06 — Cross-chain | XCM Transfers, Bridge Security, Fund Routing | 40 |
| 07 — Operations | Rebalancer, Secret Management, API Surface | 44 |
| **Total** | **22 sub-modules** | **~266 checklist items** |

### Findings Summary

| Severity | Fixed | Accepted | Deferred | Open | Total |
|---|---|---|---|---|---|
| 🔴 Critical | 6 | 0 | 0 | 0 | 6 |
| 🟠 High | 12 | 3 | 3 | 0 | 18 |
| 🟡 Medium | 26 | 3 | 6 | 0 | 35 |
| 🔵 Low / ⚪ Info | 9 | 3 | 0 | 0 | 12 |
| **Total** | **53** | **9** | **9** | **0** | **71** |

Findings F-068 through F-071 from the Mykobo integration audit (2026-05-22) were resolved in the same audit cycle; see `FINDINGS.md` Phase 5 section for full descriptions and resolutions. A companion fix wired `fundEphemeral` into the EUR (Mykobo) onramp flow — the EUR ephemeral on Base previously had no source of native ETH, which would have caused `nablaApprove`/`nablaSwap`/squid txs to fail with insufficient gas had any Mykobo onramp progressed past deposit.

### Recommended Remediation Order

**Week 1 — Stop the Bleeding:**
1. Fix F-001 (add `throw` — one word)
2. Add auth middleware to sensitive routes (F-013, F-037)
3. Reduce body parser limit to 1MB (F-035)
4. Gate staging CORS origin behind NODE_ENV (F-036)

**Week 2 — Concurrency & State Safety:**
5. Implement atomic phase lock (F-003)
6. Add terminal state guard (F-004)
7. Make rebalancer steps idempotent (F-033)

**Week 3 — Integration Hardening:**
8. Add output amount validation to SquidRouter swaps (F-027, F-030, F-034)
9. Add concurrent SEPA ramp limit per user (F-024, now applies to Mykobo flows)
10. Add pre-balance checks to subsidy handlers (F-032)

**Month 2 — Architectural Improvements:**
11. Separate private keys per function (F-029)
12. Unify fee systems (F-002)
13. Add structured audit logging (F-015)
14. Implement proper admin auth (F-020)

**Mykobo Integration Audit (2026-05-22) — Open:**
15. ✅ Done — Added `requireAuth` to `/v1/mykobo/profiles` GET/POST (F-068, Critical). The GET endpoint now identifies profiles by the authenticated user's email (`req.userEmail`) via `MykoboApiService.getProfileByEmail`, and rejects requests whose `email` query parameter does not match the authenticated user. POST profile creation continues to bind `wallet_address` to the user's ephemeral, so no separate wallet-ownership check is required there.
16. ✅ Done — Added explicit EURC SELL branch to `fund-ephemeral-handler.nextPhaseSelector` returning `distributeFees`; also added the missing EURC BUY branch returning `subsidizePreSwap` and wired `fundEphemeral` into the Mykobo onramp flow via `mykobo-onramp-deposit-handler` and `getRequiresBaseEphemeralAddress` (F-069, High)
17. ✅ Done — Enforced HTTPS scheme on `MYKOBO_BASE_URL` at `MykoboApiService` construction via `assertSecureMykoboBaseUrl` (F-070, Medium)
18. ✅ Done — Debounced `MykoboApiService.handleAuthFailure` with `authFailurePromise` mirroring `getToken`'s `tokenPromise` (F-071, Low)

### Files Reference

- **Specifications:** `docs/security-spec/` (23 spec files — see `README.md` for index)
- **Findings tracker:** `docs/security-spec/FINDINGS.md` (67 findings with full details)
- **Audit results:** This file (`docs/security-spec/AUDIT-RESULTS.md`)
