# System Overview — Architecture & Trust Boundaries

## What This Does

Vortex is a cross-border payment gateway built on the Pendulum blockchain. It converts between fiat currencies (BRL, EUR, ARS) and crypto assets across multiple chains (Pendulum, Moonbeam, Stellar, AssetHub, Hydration, Polygon). The system is a Bun monorepo with four main components:

- **API** (`apps/api`) — Express backend handling ramp orchestration, quote generation, auth, and external service integration
- **Frontend** (`apps/frontend`) — React SPA for end-user flows
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
│  │  └─ Services (ramp, quote, stellar, etc.)   │                    │
│  └────┬───────────┬───────────┬───────────┬────┘                    │
│       │           │           │           │                         │
├───────┼───────────┼───────────┼───────────┼─────────────────────────┤
│ BOUNDARY: Backend ↔ Infrastructure / External Services              │
│       │           │           │           │                         │
│  ┌────▼────┐ ┌────▼────┐ ┌───▼──────┐ ┌──▼──────────────┐         │
│  │Postgres │ │Supabase │ │Chains    │ │External APIs    │         │
│  │(DB)     │ │(Auth)   │ │(RPC)     │ │(BRLA, Monerium, │         │
│  └─────────┘ └─────────┘ │Pendulum  │ │ Alfredpay,      │         │
│                           │Moonbeam  │ │ Squid, Stellar) │         │
│                           │Stellar   │ └─────────────────┘         │
│                           │AssetHub  │                              │
│                           │Hydration │                              │
│                           │Polygon   │                              │
│                           └──────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Data Flows

1. **Quote flow:** Client → API (quote request) → Price providers + fee calculation → Stored quote → Client
2. **Ramp registration:** Client → API (register with quote ID + addresses) → Unsigned txs generated → Client signs → API starts phase processor
3. **Phase execution:** Phase processor reads state from DB → Executes handler (on-chain tx, external API call) → Updates phase + state in DB → Next phase
4. **Subsidization:** During ramp, if swap output doesn't match quoted amount, funding accounts top up the ephemeral to cover the difference
5. **Webhook delivery:** API signs events with RSA-PSS → Delivers to partner webhook URLs

## Security Invariants

1. **All client-facing endpoints MUST enforce authentication** — either Supabase OTP, API key (sk\_), or admin token, depending on the route. No ramp or quote mutation endpoint may be accessible without auth.
2. **Trust boundaries MUST be enforced at the middleware layer** — auth checks happen before controller logic, never inside controllers.
3. **The API server MUST NOT hold user private keys** — ephemeral keys are generated client-side (SDK/frontend). The server only receives addresses, never secrets.
4. **Server-held secrets (funding keys, executor keys) MUST only be used for platform operations** — funding ephemeral accounts, executing subsidization, signing webhooks. Never for user-initiated transactions on behalf of the user's own assets.
5. **All external service calls (BRLA, Monerium, Alfredpay, chain RPCs) MUST be treated as untrusted** — responses must be validated, timeouts enforced, and failures handled without corrupting ramp state.
6. **Database state MUST be the single source of truth for ramp progress** — in-memory state is transient and may be lost on restart.
7. **No single component compromise should grant access to all user funds** — the system should limit blast radius through key separation and least-privilege access.
8. **All inter-chain transfers MUST be verified on both source and destination** — sending a transfer is not sufficient; the system must confirm receipt before advancing phases.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Unauthorized ramp initiation** | Attacker starts ramps without valid auth, draining liquidity | Auth middleware on all ramp endpoints; quote binding to authenticated session |
| **Server compromise** | Attacker gains access to API server, extracts env vars | Key separation (different keys per chain), rotation procedures, minimal secrets in memory |
| **Stale RPC data** | Chain RPC returns outdated balances, causing incorrect subsidization | Verify balances at point of use, not cached; cross-check with on-chain finality |
| **External API manipulation** | BRLA/Monerium returns manipulated amounts | Validate external responses against quoted amounts; bound acceptable variance |
| **Database tampering** | Attacker with DB access modifies ramp state to skip phases | Phase transition validation in code (not just DB constraints); audit logging of all state changes |
| **Cross-chain message failure** | XCM transfer succeeds on source but fails on destination | Phase handlers wait for destination confirmation before advancing; timeout + retry logic |
| **Rebalancer key theft** | Rebalancer's chain keys compromised | Rebalancer uses dedicated keys separate from main API; limited balances; monitoring for unexpected transfers |

## Audit Checklist

- [ ] Every route in `apps/api/src/api/routes/v1/` has appropriate auth middleware applied
- [ ] No controller directly accesses `process.env` for secrets — all go through `config/vars.ts`
- [ ] Ephemeral key secrets never appear in API request/response payloads or logs
- [ ] Phase processor always reads fresh state from DB before executing a phase (no stale cache)
- [ ] All external API calls have timeout configuration
- [ ] Error responses never leak internal state, stack traces, or secret material
- [ ] Database connection uses TLS in production
- [ ] Rate limiting is applied at the network edge before auth middleware
- [ ] CORS configuration restricts origins to known frontend domains
- [ ] Rebalancer keys are distinct from API server keys
