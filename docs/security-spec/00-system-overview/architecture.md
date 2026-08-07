# System Overview — Architecture & Trust Boundaries

## What This Does

Vortex is a cross-border payment gateway built on the Pendulum blockchain. It converts between fiat currencies (BRL, EUR, ARS) and crypto assets across multiple chains (Pendulum, Moonbeam, AssetHub, Hydration, Polygon, Base). The system is a Bun monorepo with four main components:

- **API** (`apps/api`) — Express backend handling ramp orchestration, quote generation, auth, and external service integration
- **Frontend** (`apps/frontend`) — React SPA for end-user flows
- **Dashboard** (`apps/dashboard`) — Authenticated account surface for onboarding, self-ramps, and optional EVM wallet custody UX
- **SDK** (`packages/sdk`) — Stateless Node.js SDK abstracting API calls and ephemeral key management for partner integrations
- **Rebalancer** (`apps/rebalancer`) — Automated liquidity management across chains
- **Smart Contracts** (`contracts/relayer`) — TokenRelayer.sol for ERC-20 meta-transaction relaying on EVM chains

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│ UNTRUSTED: Internet                                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐                     │
│  │ Browser  │  │ SDK User │  │ Partner (API) │                     │
│  └────┬─────┘  └────┬─────┘  └──────┬────────┘                     │
│       │              │               │                              │
├───────┼──────────────┼───────────────┼──────────────────────────────┤
│ BOUNDARY: Network edge (rate limiter, CORS, TLS)                    │
│       │              │               │                              │
│  ┌────▼──────────────▼───────────────▼────────┐                     │
│  │ API Server (Express)                        │                    │
│  │  ├─ Auth middleware (Supabase/API key/Admin)│                    │
│  │  ├─ Controllers + Validators                │                    │
│  │  ├─ Phase Processor (state machine)         │                    │
│  │  └─ Services (ramp, quote, etc.)            │                    │
│  └────┬───────────┬───────────┬───────────┬────┘                    │
│       │           │           │           │                         │
├───────┼───────────┼───────────┼───────────┼─────────────────────────┤
│ BOUNDARY: Backend ↔ Infrastructure / External Services              │
│       │           │           │           │                         │
│  ┌────▼────┐ ┌────▼────┐ ┌───▼──────┐ ┌──▼──────────────┐         │
│  │Postgres │ │Supabase │ │Chains    │ │External APIs    │         │
│  │(DB)     │ │(Auth)   │ │(RPC)     │ │(BRLA/Avenia,    │         │
│  └─────────┘ └─────────┘ │Pendulum  │ │ Mykobo,         │         │
│                           │Moonbeam  │ │ Alfredpay,      │         │
│                           │AssetHub  │ │ Squid)          │         │
│                           │Hydration │ └─────────────────┘         │
│                           │Polygon   │                              │
│                           │Base      │                              │
│                           └──────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Base** is the hub for all BRL on/off-ramp flows: BRLA mint/burn via Avenia, Nabla swap on EVM, and sequential-transfer fee distribution. BRL flows do not touch Pendulum or Moonbeam.

The optional embedded-wallet mode adds two direct CDP trust edges that are not represented by the
backend-centered diagram: the authenticated browser sends its Supabase JWT and device-authorized
signing/export requests to CDP, and the API sends the same request bearer to CDP only to verify the
submitted user/address association. CDP never replaces Vortex API authentication. See
[`01-auth/cdp-embedded-wallets.md`](../01-auth/cdp-embedded-wallets.md).

### Key Data Flows

1. **Quote flow:** Client → API (quote request) → Price providers + fee calculation → Stored quote → Client
2. **Ramp registration:** Client → API (register with quote ID + addresses) → Unsigned txs generated → Client signs → API starts phase processor
3. **Phase execution:** Phase processor reads state from DB → Executes handler (on-chain tx, external API call) → Updates phase + state in DB → Next phase
4. **Subsidization:** During ramp, if swap output doesn't match quoted amount, funding accounts top up the ephemeral to cover the difference
5. **Webhook delivery:** API signs events with RSA-PSS → Delivers to partner webhook URLs
6. **Embedded-wallet flow (optional EVM only):** Browser authenticates to CDP with its Supabase
   session → user explicitly provisions/restores an EOA → API verifies and records the association →
   browser asks CDP to sign the Vortex-issued payload → browser broadcasts through the configured RPC

## Security Invariants

1. **Every client-facing endpoint MUST declare its accepted principals** — protected routes require Supabase OTP, API key (`sk_`), or an admin token as appropriate. Quote creation and other explicitly catalogued public-information routes may be anonymous. Anonymous quote IDs are short-lived bearer references until atomically claimed.
2. **Authentication and resource authorization are separate boundaries** — middleware authenticates the presented principal and rejects invalid or indeterminate credentials before controller logic. Controllers/services MUST additionally enforce ownership and authority after loading the referenced quote, ramp, webhook, recipient, or other resource.
3. **The API server MUST NOT hold user private keys** — ephemeral keys are generated client-side
   (SDK/frontend). Optional CDP EOA key operations remain in CDP's protected flow; the API receives
   only wallet metadata and must never receive exported key or device-credential material.
4. **Server-held secrets (funding keys, executor keys) MUST only be used for platform operations** — funding ephemeral accounts, executing subsidization, signing webhooks. Never for user-initiated transactions on behalf of the user's own assets.
5. **All external service calls (BRLA, Mykobo, Alfredpay, chain RPCs) MUST be treated as untrusted** — responses must be validated, timeouts enforced, and failures handled without corrupting ramp state.
6. **Database state MUST be the single source of truth for ramp progress** — in-memory state is transient and may be lost on restart.
7. **No single component compromise should grant access to all user funds** — the system should limit blast radius through key separation and least-privilege access.
8. **All inter-chain transfers MUST be verified on both source and destination** — sending a transfer is not sufficient; the system must confirm receipt before advancing phases.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Unauthorized ramp initiation** | Attacker starts ramps without valid auth, draining liquidity | Auth middleware on all ramp endpoints; quote binding to authenticated session |
| **Server compromise** | Attacker gains access to API server, extracts env vars | Key separation (different keys per chain), rotation procedures, minimal secrets in memory |
| **Stale RPC data** | Chain RPC returns outdated balances, causing incorrect subsidization | Verify balances at point of use, not cached; cross-check with on-chain finality |
| **External API manipulation** | BRLA/Mykobo/Alfredpay returns manipulated amounts | Validate external responses against quoted amounts; bound acceptable variance |
| **Database tampering** | Attacker with DB access modifies ramp state to skip phases | Phase transition validation in code (not just DB constraints); audit logging of all state changes |
| **Cross-chain message failure** | XCM transfer succeeds on source but fails on destination | Phase handlers wait for destination confirmation before advancing; timeout + retry logic |
| **Rebalancer key theft** | Rebalancer's chain keys compromised | Rebalancer uses dedicated keys separate from main API; limited balances; monitoring for unexpected transfers |
| **Embedded-wallet session or origin compromise** | Stolen Supabase session or same-origin script authenticates to CDP and requests signatures | Production remains deferred under `RISK-018` until custom auth, exact origins, policies, MFA, confirmation, CSP, monitoring, and rollback controls are evidenced |

## Audit Checklist

- [x] Every route in `apps/api/src/api/routes/v1/` has appropriate auth middleware applied — **PASS: F-013 resolved. Legacy fundEphemeral/execute-xcm/subsidize endpoints removed. `/v1/ramp/*` and `/v1/ramp/quotes(/best)` enforce `requirePartnerOrUserAuth()` with per-principal ownership guards. `/v1/brla/*`, `/v1/mykobo/profiles` (F-068 resolved), `/v1/maintenance/*`, `/v1/webhook/*` use `requireAuth`/`adminAuth`/`apiKeyAuth` respectively.**
- [ ] No controller directly accesses `process.env` for secrets — all go through `config/vars.ts` — **F-016: `PENDULUM_FUNDING_SEED` accessed directly in `pendulum.service.ts`; also `SLACK_WEB_HOOK_TOKEN`, `COINGECKO_API_KEY`**
- [x] Ephemeral key secrets never appear in API request/response payloads or logs
- [x] Phase processor always reads fresh state from DB before executing a phase (no stale cache)
- [ ] All external API calls have timeout configuration — **F-014: Most `fetch()` calls lack timeout/AbortController (Mykobo, price feeds, Subscan, etc.)**
- [ ] Error responses never leak internal state, stack traces, or secret material — **F-015: Stack traces stripped in prod, but raw `err.message` leaks in some paths**
- [ ] Database connection uses TLS in production — **F-017: Not configured in Sequelize options; relies on server-side enforcement**
- [x] Rate limiting is applied at the network edge before auth middleware
- [x] CORS configuration restricts origins to known frontend domains (staging origin tracked as F-008)
- [x] Rebalancer keys are distinct from API server keys
