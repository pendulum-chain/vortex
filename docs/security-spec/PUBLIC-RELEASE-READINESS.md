# Public Release Readiness Report

**Repository**: `pendulum-chain/vortex` (already public on GitHub) and `pendulum-chain/vortex-private` (private mirror).
**Scope**: Full secret/PII/configuration scan of tracked tree and complete git history across all branches and both remotes.
**Method**: Read-only grep + AST sweeps over working tree, `git log --all --full-history -p`, branch-containment checks, and remote-visibility verification via `gh`.

---

## Executive Summary

The `pendulum-chain/vortex` repository on GitHub is **already public**. Several secrets and operational artifacts that would normally be classified as pre-publication blockers are already exposed on public branches (including `origin/main`). This report therefore distinguishes between:

- **Already-leaked** — the secret is in public history. Rotation is mandatory and urgent. Scrubbing history is optional and cosmetic; once a secret is on a public branch on GitHub, it must be assumed compromised regardless of subsequent rewrites.
- **Tree-only** — the issue exists in the current working tree and can still be prevented from reaching public history with a normal commit.

---

## HIGH Severity

### H1. Supabase service-role JWT hardcoded in tracked migration

| | |
|---|---|
| **Location** | `supabase/migrations/20260304142601_remote_schema.sql:834` |
| **Secret** | `Authorization: Bearer eyJ...MlmXlQFvCGzFKEFROqgodLuPwTGeQtjificJjFJAjRA` |
| **Project** | `kglbssavflprkvsohcbg.supabase.co` |
| **Role** | `service_role` (bypasses Row Level Security) |
| **Expiry** | 2035 |
| **Embedded in** | `CREATE OR REPLACE TRIGGER "SlackNotifier"` body, called from `pg_net.http_post` |
| **Status on public origin** | Present on `origin/main` |
| **Classification** | Already-leaked |

**Impact.** A service-role JWT grants full read/write access to every table in the Supabase project, ignoring RLS policies. With this token, an attacker can dump all data, mutate any row, and invoke any RPC as a superuser-equivalent.

**Required actions, in order:**
1. Rotate the Supabase project's `service_role` JWT secret in the Supabase dashboard. This invalidates the leaked token immediately.
2. Audit Supabase access logs for unauthorized usage of the leaked token between commit `0e2074e85` (2026-03-23) and rotation time.
3. Refactor the trigger to read the JWT from a runtime source instead of inlining it. Recommended approaches:
   - Use Supabase **Vault** (`vault.decrypted_secrets`) and reference the secret by name inside the trigger body.
   - Or move the Slack notification out of the database trigger and into application code where the secret comes from `process.env`.
4. Regenerate the migration so the new version contains no token. Commit it normally — do not attempt to rewrite history (see "Scrubbing strategy" below).

---

### H2. Stellar secret key committed in `signer-service-rust/.env`

| | |
|---|---|
| **Location (history)** | `signer-service-rust/.env` at commit `76ce1c287` (2024-05-13) |
| **Deletion commit** | `f43b3cd04` (2024-06-05, "share env example") |
| **Secret** | `STELLAR_SECRET_KEY=SCVJD7BHU5LNFXNIDC7E226HISKUOZUEPJWLA2YU2GNBFMP5PYF2TQBH` |
| **Also present** | `POSTGRES_PASSWORD=1234` (low value — local-dev DB) |
| **Status on public origin** | Present on `origin/offramp-prototype` |
| **Classification** | Already-leaked |

**Impact.** A Stellar secret key (`S...`) gives full control of the corresponding account: signing transactions, draining XLM and any held assets, and modifying account flags. The branch name `offramp-prototype` and timing (May 2024) suggest this was a development account; this must be confirmed.

**Required actions:**
1. Determine whether the public key for this secret (derive offline) was ever funded on Stellar mainnet. Check at `https://horizon.stellar.org/accounts/<PUBLIC_KEY>`.
2. If mainnet: immediately submit a `MergeAccount` operation moving all balances to a safe account, **before** doing anything else.
3. Independent of mainnet status, treat the secret as compromised forever. Do not reuse it.
4. Optionally delete the `offramp-prototype` branch on `origin` (it is two years old and unlikely to be needed).

---

## MEDIUM Severity

### M1. Ramp-state JSON files with signed transactions and ephemeral signer addresses in history

| | |
|---|---|
| **Files** | `api/src/api/services/phases/lastRampState.json`, `lastRampStateOnramp.json`, `signer-service/src/api/services/phases/failedRampStateRecovery.json` |
| **First committed** | `fe1f74777` (2025-04-08) |
| **Status on public origin** | Present on `origin/main`, `origin/main-backup-pre-widget` |
| **Classification** | Already-leaked |

**Contents.**
- Pre-signed EVM transaction envelopes (with valid signatures from ephemeral keys).
- Pre-signed Stellar XDR envelopes (with valid signatures from ephemeral Stellar accounts).
- Concrete ephemeral signer addresses (e.g., `0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3`, `GBVXWRUJUSMEX75YN5KGYBNBJISFKOJBWHHX6ODQXNSXMCAIVD2BTDDD`).

**Impact.** The signed transactions themselves do not leak the ephemeral private keys (signatures are not invertible). However:
- The signed transactions are valid envelopes that could be replayed if their account state matches (sequence number, nonce). For Stellar this is bounded by sequence numbers; for EVM this is bounded by nonces, target chain ID, and any account-touching tx already broadcast.
- The ephemeral addresses, transaction shapes, target contracts, swap routes, and fee values reveal operational patterns of the off/onramp engine. This is mainly a privacy concern, not a custody concern.

**Required actions:**
1. Verify each of the listed ephemeral addresses on the target chains. If any account on Polygon, Stellar, Pendulum, Moonbeam, or AssetHub still holds funds, sweep them.
2. For every signed transaction in those files, check whether it is still replayable (account exists, nonce/sequence not yet consumed, fee still valid). If so, broadcast a no-op transaction at the same nonce/sequence to invalidate the envelope, or fund the account so it can be drained.
3. The files are no longer in the working tree and are now correctly ignored (`apps/api/...` paths use a different layout). Confirm `.gitignore` covers any future `lastRampState*.json` and `failedRampStateRecovery.json` artifacts in their new locations.

### M2. `apps/api/.env.example` is incomplete

Fifteen environment variables are read by `apps/api/src` but not documented in `apps/api/.env.example`:

```
EVM_FUNDING_PRIVATE_KEY
MYKOBO_ACCESS_KEY
MYKOBO_SECRET_KEY
MYKOBO_BASE_URL
MYKOBO_CLIENT_DOMAIN
ALCHEMY_API_KEY
SLACK_USER_ID
SLACK_WEB_HOOK_TOKEN
SUBSCAN_API_KEY
DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS
WEBHOOK_PUBLIC_KEY
RAMP_WIDGET_URL
LOG_LEVEL
BACKEND_TEST_STARTER_ACCOUNT
GOOGLE_CONTACT_SPREADSHEET_ID
TAX_ID
VORTEX_FEE_PEN_PERCENTAGE
```

**Impact.** External contributors cannot run the API without trial-and-error. None of these expose secrets in the example file (placeholders only), but their absence makes the project significantly harder to onboard.

**Required action.** Add each variable to `apps/api/.env.example` with a placeholder and a one-line comment.

---

## LOW Severity

### L1. Sentry DSN inlined in `apps/frontend/src/main.tsx:32`

```ts
dsn: "https://7eb35f175ccba5b5e2eb1ca00e64e053@o4508217222692864.ingest.de.sentry.io/4508217730269264"
```

Per Sentry's documentation, frontend DSNs are intentionally public and not authentication credentials. The remaining concern is that OSS forks running this code will silently report errors to your Sentry project, polluting your event quota.

**Required action.** Move to `import.meta.env.VITE_SENTRY_DSN` and gate `Sentry.init()` on its presence. Document in `apps/frontend/.env.example`.

### L2. Root `.gitignore` only matches the literal `apps/api/.env`

The per-app `.gitignore` files cover `.env` correctly, but the root file does not enforce a project-wide pattern. Any future app added under `apps/` or `services/` will not have its `.env` ignored unless someone remembers to add an entry.

**Required action.** Add to root `.gitignore`:

```
**/.env
**/.env.local
**/.env.*.local
!**/.env.example
```

### L3. Long-lived stale branches on public origin

`origin/offramp-prototype`, `origin/main-backup-pre-widget`, and a large number of completed feature branches (numbered like `315-...`, `552-...`, `577-...`) remain on the public remote. They contain leaked secrets (H2, M1) and outdated code.

**Required action.** Audit `origin` branches and delete completed feature branches, prototypes, and backups. Use `gh api repos/pendulum-chain/vortex/branches` for a full list.

---

## Confirmed-Clean Categories

The following classes of exposure were searched for and **not** found:

- GitHub PATs (`gh[pousr]_...`, `github_pat_...`).
- npm tokens (`npm_...`), private npm scopes, registry-auth URLs in `package.json` files.
- AWS access keys (`AKIA...`, secret-access-key shapes).
- OpenAI / Anthropic / HuggingFace API keys (`sk-...`, `sk-ant-...`, `hf_...`).
- Telegram bot tokens.
- Slack webhook URLs (only placeholder `your_slack_webhook_token_here`).
- Mnemonic seed phrases (BIP-39 12/24-word patterns).
- Real 64-character hex private keys in any branch's history. All matches were either RLP-encoded transaction envelopes from contract artifacts or ABI-encoded `uint256` values.
- Internal IP addresses (RFC1918, loopback only in dev configs).
- Internal hostnames beyond the publicly documented `*.vortexfinance.co` and `*.pendulumchain.tech` infrastructure.
- Real customer/partner PII in test data (no real CPFs, BRLA accounts, or production payout addresses found).
- All tracked `.env*` files are `.env.example` placeholders.

---

## Scrubbing Strategy

The conventional advice — "rewrite history with `git filter-repo` or BFG Repo-Cleaner, then force-push" — does **not** materially reduce risk for this repository, because:

1. The repository has been public on GitHub since at least 2024-05.
2. GitHub caches forks, pull requests, and unreachable commits indefinitely. Force-pushing a rewritten history does not delete those caches.
3. Any third party may have already cloned, mirrored, or scraped the repository.
4. The leaked Supabase JWT and Stellar secret must be rotated regardless of whether history is rewritten.

**Recommended approach: rotate, do not rewrite.**

1. Treat all already-leaked secrets as compromised forever. Rotate.
2. Patch the working tree so future commits are clean.
3. Add CI-level secret scanning (e.g., `gitleaks`, `trufflehog`, GitHub's native push protection) to catch the next leak before it reaches `origin`.
4. Optionally delete obsolete branches (`offramp-prototype`, `main-backup-pre-widget`, completed feature branches) to reduce the public surface, but understand that anything cached by GitHub or third parties remains accessible.

If, after rotation, leadership still requires a history rewrite for compliance or appearance reasons:

1. Coordinate with every active developer (force-push will require everyone to re-clone).
2. Use `git filter-repo --invert-paths --path signer-service-rust/.env --path signer-service/.env --path 'api/src/api/services/phases/lastRampState*.json' --path 'signer-service/src/api/services/phases/failedRampStateRecovery.json'`.
3. For the Supabase migration, use `git filter-repo --replace-text` to substitute the JWT with a placeholder, preserving the rest of the file.
4. Force-push to all branches on `origin`.
5. Open a GitHub support ticket to purge cached PRs and unreachable commits.

This is significant operational disruption with marginal security benefit. It should not be the priority.

---

## Action Checklist (Prioritized)

| # | Action | Severity | Owner |
|---|---|---|---|
| 1 | Rotate Supabase service_role JWT in dashboard | HIGH | Backend on-call |
| 2 | Verify Stellar account `G...` (derived from `SCVJD...`) — sweep if funded on mainnet | HIGH | Backend on-call |
| 3 | Audit Supabase access logs since 2026-03-23 | HIGH | Backend on-call |
| 4 | Refactor `SlackNotifier` trigger to read JWT from Vault, regenerate migration | HIGH | Backend |
| 5 | Sweep any funded ephemeral accounts referenced in committed `lastRampState*.json` | MEDIUM | Backend |
| 6 | Move Sentry DSN to `VITE_SENTRY_DSN` env var | LOW | Frontend |
| 7 | Patch root `.gitignore` with `**/.env` patterns | LOW | Anyone |
| 8 | Complete `apps/api/.env.example` (15 missing vars) | MEDIUM | Backend |
| 9 | Enable GitHub Secret Scanning + Push Protection on `pendulum-chain/vortex` | MEDIUM | Repo admin |
| 10 | Add `gitleaks` pre-commit hook and CI step | LOW | Anyone |
| 11 | Delete obsolete branches on `origin` | LOW | Repo admin |

---

## Appendix: Scan Methodology

- Tracked-tree secret patterns: `git ls-files | xargs grep -nE '<pattern>'`.
- History secret patterns: `git log --all --full-history --pretty=format: -p | grep -aE '<pattern>'`.
- Branch containment: `git branch -a --contains <commit>`.
- Remote visibility: `gh repo view pendulum-chain/vortex --json visibility,isPrivate`.
- Patterns swept: JWT (`eyJhbGciOi...`), AWS (`AKIA[0-9A-Z]{16}`), GitHub PAT, npm token, OpenAI/Anthropic/HF keys, Telegram bot token, Slack webhook, BIP-39 mnemonic shape, 64-hex private keys, RFC1918 IPs, internal hostnames, email addresses outside `vortexfinance.co`/`pendulumchain.tech`.
