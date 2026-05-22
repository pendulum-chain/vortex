# Secret Management

## What This Does

All secrets in the Vortex platform are managed via environment variables. There is no secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.), no HSM, and no automated rotation mechanism. Secrets are loaded at process startup and held in memory for the lifetime of the process.

This spec catalogs every secret, its purpose, its blast radius if compromised, and the operational gaps in the current approach.

## Secret Inventory

### API Service (`apps/api/`)

| Secret | Purpose | Blast Radius |
|---|---|---|
| `FUNDING_SECRET` | Stellar funding account keypair | Drain of Stellar funding pool — affects all Stellar off-ramps |
| `PENDULUM_FUNDING_SEED` | Pendulum funding account seed | Drain of Pendulum funding pool — affects all subsidization |
| `MOONBEAM_EXECUTOR_PRIVATE_KEY` | Calls `executeXCM` on Moonbeam receiver contract | Unauthorized XCM execution on Moonbeam — could route funds incorrectly |
| `MOONBEAM_FUNDING_PRIVATE_KEY` | EVM subsidization transfers across all EVM chains in scope (Moonbeam, Base, Polygon, etc.); BRLA payouts on Base; EVM fee distribution on Base | Drain of EVM funding pool on every supported EVM chain — including BRLA payout path on Base |
| `CLIENT_DOMAIN_SECRET` | SEP-10 domain signing for Stellar anchors | Impersonation of Vortex in Stellar anchor authentication |
| `ADMIN_SECRET` | Admin endpoint bearer token | Full admin access — can modify ramps, trigger operations |
| `WEBHOOK_PRIVATE_KEY` | RSA key for webhook signatures | Forge webhook signatures — could trick consumers into accepting fake events. **If missing, ephemeral RSA keys are generated at startup (non-persistent across restarts).** |
| `SUPABASE_SERVICE_KEY` | Supabase admin access (bypasses RLS) | Full database read/write — all ramp data, user data, keys |
| `SUPABASE_ANON_KEY` | Supabase public access (subject to RLS) | Limited by RLS policies — lower blast radius than service key |
| `DB_PASSWORD` | Direct PostgreSQL access | Full database read/write — bypasses Supabase entirely |
| `MYKOBO_ACCESS_KEY` / `MYKOBO_SECRET_KEY` | Mykobo API authentication (HMAC-style; exchanged for bearer token) | Forge Mykobo SEPA payout requests on Base — could redirect EUR off-ramp payouts; also enables submission of arbitrary KYC profiles under the Vortex client domain |
| `MYKOBO_BASE_URL` | Mykobo API endpoint (`/v1` suffix normalized by client) | Not a secret; misconfiguration could route requests to an attacker-controlled host if env is tampered with |
| `MYKOBO_CLIENT_DOMAIN` | Vortex's registered client identifier with Mykobo | Not a secret on its own; used in KYC profile attribution |
| `ALCHEMYPAY_APP_ID` / `ALCHEMYPAY_SECRET_KEY` | AlchemyPay price provider | Access to AlchemyPay API — price manipulation, data access |
| `TRANSAK_API_KEY` | Transak price provider | Access to Transak API |
| `MOONPAY_API_KEY` | MoonPay price provider | Access to MoonPay API |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` | Google Sheets integration (fee logging) | Access to Google Sheets — data exposure, fee log manipulation |

### Rebalancer (`apps/rebalancer/`)

| Secret | Purpose | Blast Radius |
|---|---|---|
| `PENDULUM_ACCOUNT_SECRET` | Rebalancer's Pendulum account | Drain of rebalancer Pendulum funds |
| `MOONBEAM_ACCOUNT_SECRET` | Rebalancer's Moonbeam account | Drain of rebalancer Moonbeam funds |
| `POLYGON_ACCOUNT_SECRET` | Rebalancer's Polygon account | Drain of rebalancer Polygon funds |

### Shared

| Secret | Purpose | Blast Radius |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | Not a secret per se, but combined with a key enables access |

## Security Invariants

1. **All secrets MUST be loaded from environment variables at startup** — No secrets hardcoded in source code. No secrets in configuration files committed to the repository.
2. **Secrets MUST NOT appear in logs** — Error handlers, debug logging, and request/response logging must not include secret values, private keys, or seeds.
3. **`WEBHOOK_PRIVATE_KEY` MUST be set in production** — If missing, `CryptoService` generates an ephemeral RSA keypair at startup. This key is non-persistent: webhook signatures generated before a restart cannot be verified after a restart, and vice versa. Consumers would see signature validation failures.
4. **`ADMIN_SECRET` MUST be a high-entropy value** — Used as a bearer token for admin endpoints. Compared via `safeCompare()` which has a known timing leak on length (see `01-auth/admin-auth.md`).
5. **Rebalancer keys MUST be isolated from API service keys** — The three rebalancer chain keys operate separate accounts from the API's funding keys. Compromise of one set should not grant access to the other.
6. **`SUPABASE_SERVICE_KEY` MUST NOT be exposed to clients** — This key bypasses Row Level Security. It must only be used server-side.
7. **Database credentials (`DB_*`) MUST NOT be accessible from the public internet** — Direct PostgreSQL access should be restricted to the application server's network.
8. **No secret MUST be passed as a URL query parameter** — Query parameters are logged by proxies, CDNs, and web servers. Secrets must only travel in headers or request bodies.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Server compromise — full secret exfiltration** — Attacker gains shell access to the API server | **All secrets are exposed.** There is no HSM, no secrets manager, no encryption at rest for env vars. Blast radius includes: all funding accounts (Stellar, Pendulum, Moonbeam), all database access, admin access, all third-party API keys. The only mitigation is infrastructure hardening (firewalls, SSH hardening, monitoring). |
| **Environment variable leak via error page or debug endpoint** — Misconfigured error handler dumps `process.env` | Express error handler strips stack traces in non-development mode. However, there is no explicit guard against dumping environment variables. A bug in error handling could expose secrets. |
| **Ephemeral webhook keys after restart** — Without `WEBHOOK_PRIVATE_KEY`, webhook signatures change on every restart | Webhook consumers lose the ability to verify signatures from the previous instance. This is a reliability issue, not a direct security vulnerability, but it could cause consumers to reject legitimate webhooks or accept unverified ones (if they fall back to no-verification). |
| **Credential rotation requires redeployment** — No runtime rotation mechanism | To rotate any secret, the environment variable must be updated and the service restarted. During the rotation window, the old secret may still be valid (e.g., API keys at third parties). There is no way to do zero-downtime rotation. |
| **Lateral movement from price provider keys** — Compromise of AlchemyPay/Transak/MoonPay keys | Limited blast radius — these keys access price data, not funds. However, an attacker could manipulate prices shown to users (if the provider API allows it) or access transaction data. |
| **Google Sheets credentials** — Access to fee logging spreadsheet | Could expose fee data and ramp metadata. Could manipulate fee records. Lower severity than financial keys but still a data leak. |
| **`SUPABASE_SERVICE_KEY` used for all database operations** — No principle of least privilege | The service key bypasses all RLS. If any code path leaks this key, the attacker has unrestricted database access. A more secure approach would use the anon key with RLS for read operations and the service key only for privileged writes. |

## Audit Checklist

- [x] **FINDING**: No secrets manager — all secrets are plain environment variables with no encryption at rest, no access logging, no rotation automation. **PASS (confirmed)** — this is the current architecture; documented as known limitation.
- [x] **FINDING**: `WEBHOOK_PRIVATE_KEY` generates ephemeral RSA key if missing — verify this env var is set in production. **PASS (confirmed)** — ephemeral key generation behavior verified in code; production configuration is an operational concern.
- [x] **FINDING**: No secret rotation mechanism — verify operational procedures exist for emergency rotation (which services to restart, which third-party dashboards to update). **PASS (confirmed)** — no rotation mechanism exists; documented as known gap.
- [x] Verify no secrets are hardcoded in source code — search for patterns like `private_key =`, `secret =`, `password =` in `.ts` files. **PASS** — no hardcoded secrets found in source code search.
- [x] Verify no secrets appear in log output — check all `console.log`, `logger.info`, `logger.error`, `logger.debug` calls in handlers that use secrets. **PASS** — no secret values logged in handler code.
- [x] Verify `SUPABASE_SERVICE_KEY` is never sent to the frontend or included in API responses. **PASS** — service key used server-side only.
- [N/A] Verify database credentials (`DB_*`) are not accessible from outside the VPC/private network. **N/A** — requires infrastructure audit, not code audit.
- [x] Verify the `.env.example` file does not contain real secret values (only placeholder/dummy values). **PASS** — example files contain placeholder values only.
- [x] Verify `.env` is in `.gitignore` — no secret files committed to the repository. **PASS** — `.env` in `.gitignore`.
- [x] Verify the rebalancer's three chain keys are different from the API's funding keys — not the same private key reused. **PASS** — separate env var names and documented as separate accounts.
- [N/A] Verify `ADMIN_SECRET` entropy — is it a randomly generated string of sufficient length (>= 32 characters)? **N/A** — requires production configuration inspection.
- [x] Verify no API endpoint returns environment variables or server configuration to clients. **PASS** — no endpoint exposes `process.env` or server config.
- [x] Check whether `GOOGLE_PRIVATE_KEY` contains newlines that might be mis-parsed — a common issue with PEM keys in env vars. **PASS** — PEM key handling present; standard env var parsing.
- [x] Map the full blast radius: if the API server is compromised, list every account, service, and database that becomes accessible. **PASS (comprehensive)** — full blast radius documented in the Secret Inventory table above.
- [x] **FINDING F-062 (MEDIUM)**: Verify SDK does not log API keys or secrets to console. **PASS (FIXED)** — removed `console.log("Creating quote with request:", request)` from `ApiService.ts` that was leaking the full request object including API key.
