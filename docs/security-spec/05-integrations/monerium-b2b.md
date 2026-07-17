# Monerium B2B Whitelabel Onramp

## What This Does

The B2B zero-touch onramp (docs/prd/monerium-b2b-implementation-plan.md) gives each corporate client a Monerium IBAN linked to a per-client `VortexForwarder` contract. SEPA deposits mint EURe to the forwarder; a keeper later swaps and forwards USDC to the client's destination. This spec covers the backend integration built in `apps/api/src/api/services/monerium-b2b/`: the whitelabel API client, the attestor signature for address linking, the webhook receiver with durable inbox, and the deposit processor. It is deliberately NOT part of the one-shot ramp state machine — accounts are persistent and repeatedly funded.

**Provider type:** on-ramp (EUR → USDC)
**Fiat currencies:** EUR
**Chains involved:** Ethereum (forwarder contracts, EURe/USDC)
**Modules:** `monerium-b2b/whitelabel-client.ts`, `monerium-b2b/attestor.ts`, `monerium-b2b/webhook.ts`, `monerium-b2b/deposit-processor.ts`, `controllers/monerium-b2b.controller.ts` (POST `/v1/monerium-b2b/webhook`); keeper: `monerium-b2b/chain.ts`, `monerium-b2b/mint-watcher.ts`, `monerium-b2b/conversion-executor.ts`, `monerium-b2b/dormancy.ts`, `workers/monerium-b2b.worker.ts`; monitoring: `monerium-b2b/monitoring.ts`
**API auth method:** OAuth client credentials (`MONERIUM_B2B_CLIENT_ID`/`MONERIUM_B2B_CLIENT_SECRET`) against `MONERIUM_B2B_API_URL` (sandbox `api.monerium.dev` by default); inbound webhooks authenticated by HMAC-SHA256 (`MONERIUM_B2B_WEBHOOK_SECRET`)

## Security Invariants

1. **Attestor key stays in env and out of logs** — `MONERIUM_B2B_ATTESTOR_PRIVATE_KEY` is read from the environment only, never persisted, never returned by an API response, and never included in log lines or error messages (the not-configured error names the variable, not the value).
2. **The attestor signature authorizes linking only** — the attestor signs exactly `keccak256(abi.encodePacked(forwarderAddress, linkHash))` where `linkHash` is one of the two fixed hashes of `"I hereby declare that I am the address owner."` (EIP-191 personal hash or raw keccak). `VortexForwarder.isValidSignature` accepts nothing else, so a leaked attestor key can link addresses but can never move funds or change forwarder config. The backend MUST never sign arbitrary hashes with this key.
3. **Signature format matches the contract check** — 65-byte `r ‖ s ‖ v` with `v ∈ {27, 28}` and low-s (the contract rejects malleable signatures). Enforced by construction (viem canonical signatures) and pinned by unit test `attestor.test.ts`.
4. **Webhook HMAC over raw bytes, constant-time** — the `webhook-signature` header is verified as HMAC-SHA256 of the RAW request bytes (captured by a body-parser `verify` hook scoped to this route, never a re-serialization of parsed JSON) using `crypto.timingSafeEqual`, with a self-compare on length mismatch so timing does not leak the mismatch position. Unverified requests are rejected 401 before any database write.
5. **Durable persist before 200 (R06)** — every verified delivery is inserted into `monerium_webhook_events` before the 200 response is sent. Processing happens strictly after the response; a crash between insert and processing loses nothing because the inbox row survives.
6. **Delivery dedup is enforced by the database** — inserts use `ON CONFLICT DO NOTHING` on the unique `event_id` (payload id when present, else sha256 of the raw bytes), so Monerium retries and duplicate deliveries can never double-create or double-apply a deposit event.
7. **Deposit status transitions are forward-only** — `pending → {minted, held, returned}`, `held → {minted, returned}`; `minted` and `returned` are terminal. Out-of-order or replayed webhook events can never regress a deposit status; regressive transitions are logged and ignored. Guarded by `isForwardTransition` (unit-tested).
8. **Per-forwarder serialization via advisory lock** — all deposit writes for one forwarder happen inside a transaction holding `pg_advisory_xact_lock(hashtextextended('monerium-b2b:' || lower(forwarderAddress), 0))`, so concurrent processors (multiple API instances, webhook-triggered plus scheduled runs) apply events for an account strictly one at a time. This is the same serialization point the execution/attribution logic (R04) will use.
9. **Deposit identity is the Monerium order id** — `monerium_order_id` is unique; the on-chain mint `(chain_id, tx_hash, log_index)` is a second partial-unique identity. Amounts are stored as 18-decimal base-unit strings converted from the provider decimal, never floats.
10. **Client credentials are env-only and requests are bounded** — whitelabel API credentials come from env, all calls carry an explicit timeout, HTTPS base URLs only, and upstream failures surface as generic 502s without echoing provider response bodies.
11. **KYB submission is a guarded stub** — `submitKybData` throws 501 until the whitelabel KYB mechanism is contractually settled (deferred-decisions registry T3); no speculative identity-data path exists.

## Keeper

The keeper loop (`workers/monerium-b2b.worker.ts`, every minute: webhook inbox → mint watcher → per-account conversion executor → dormancy gate) holds signing keys and submits transactions; its invariants:

1. **Three-way key separation** — the keeper key (`MONERIUM_B2B_KEEPER_PRIVATE_KEY`, submits `poke()`/`swapAndForward()`), the guardian key (`MONERIUM_B2B_GUARDIAN_PRIVATE_KEY`, dormancy pause only), and the attestor key (address linking only) are three distinct keys. None of them can move funds: `swapAndForward` only executes the contract-constrained oracle-checked swap to the client's own `destination`; `setGuardianPaused` is protective-only by contract invariant; the attestor signs the fixed link statement. All three are env-only and never logged.
2. **Private orderflow for keeper writes** — keeper/guardian transactions are submitted through a dedicated transport (`MONERIUM_B2B_PRIVATE_RPC_URL`, e.g. `https://rpc.flashbots.net`), separate from the read/receipt client (`MONERIUM_B2B_RPC_URL`). If the private endpoint is unset the keeper falls back to the public RPC and logs a warning — acceptable on sandbox/testnet, an operational finding on mainnet.
3. **Execution record before send** — a `monerium_conversion_executions` row (status `pending`, `eureInRaw = min(balance, perSwapCap)`, snapshot destination) is durably committed BEFORE any transaction is broadcast, and the tx hash is recorded immediately after send. A crash therefore always leaves an auditable pending row, never an untracked on-chain swap; leftover pendings are resolved next cycle via receipt lookup (finalize) or declared failed (no hash: never sent; stale hash: timed out).
4. **Advisory-lock serialization** — all keeper database mutations (mint recording, execution slot check/creation, finalization, R04 allocation) run inside the shared per-forwarder `pg_advisory_xact_lock` (`withForwarderLock`), the same lock the webhook deposit processor uses. Double-send is prevented by the "any pending execution → skip" check under that lock; the chain send/wait itself intentionally runs outside a database transaction so the pending record cannot be rolled back by a crash.
5. **Attribution is snapshot-based and idempotent (R04)** — on confirmation, unallocated minted deposits with mint block ≤ execution block are selected oldest-first up to `eureInRaw`, USDC attribution is pro-rata by `amount_raw` against `eureInRaw` with floor division and remainder to the largest deposit (unit-tested), and `allocated_execution_id` links them. Mint identity is the `(chain_id, tx_hash, log_index)` partial unique index, so watcher re-scans after a crash cannot double-record; non-Monerium EURe inflows become `unattr:`-prefixed deposit rows (R09) and are never presented as customer deposits.
6. **Dormancy pause is protective-only (R05)** — after 60 days (registry P5) without a confirmed conversion, the gate calls per-clone `setGuardianPaused(true)` with the guardian key (log-only when the key is unset) and records `dormant_since`; account status stays `active`. The pause can never move funds or block the client's fallback paths (contract invariant); un-pause is a manual guardian operation pending partner re-confirmation mechanics (registry B5).

## Monitoring

The monitoring pass (`monerium-b2b/monitoring.ts`, run from the worker, rate-limited to one pass per 30 minutes) is detection-only; its invariants:

1. **No keys, no transactions** — monitors read chain state (`MONERIUM_B2B_RPC_URL`) and the Monerium API only; they never hold private keys and never broadcast. The only database mutation is the R07 reconciliation in (4). Alerts go through the standard logger (`error` = incident trigger per `docs/runbooks/monerium-b2b-incident.md`).
2. **Executable-depth check (PRD §7.4)** — QuoterV2 static quotes on the pinned EURe→EURC→USDC path at `minSwapAmount` and `perSwapCap` sizes, compared against Chainlink EUR/USD (`computeQuoteImpactBps`, unit-tested against the T6 baseline). Impact above `SLIPPAGE_BPS` at `minSwapAmount` size logs the error-level PAUSE THRESHOLD line; at `perSwapCap` size a warning. Gated to chainId 1 — the QuoterV2 address is a mainnet pin.
3. **Stranded-balance monitor** — forwarders holding ≥ `MIN_SWAP_FLOOR` EURe with the on-chain stranding marker (R03) armed longer than 12 h warn; past `TRIGGER_DELAY` they error (the permissionless trigger is then live — a keeper-outage signal, not a fund-risk signal).
4. **Association monitor (S1 detective control)** — per active account, re-reads the profile's linked addresses (`GET /addresses?profile=`) and the partner-context IBAN list (`GET /ibans`) and error-alerts on ANY divergence from the DB record (forwarder unlinked, extra address linked, IBAN moved or unrecorded — `diffAssociation`, unit-tested). This is the detective control for the S1 risk (Vortex-held whitelabel credentials can move associations at Monerium): changes cannot be prevented client-side, only detected.
5. **Config reconciliation (R07)** — re-reads per-clone config and bytecode. `destination`/`fallbackAddress` drift is owner-authorized by construction (`onlyFallback` in the contract): it is reconciled into the DB (with a `configVersion` bump) and logged at warn, never alarmed. `feeBps` drift (immutable post-init), a clone whose bytecode is not the EIP-1167 proxy of the factory's implementation, or a missing `isForwarder` registration are error-level should-be-impossible states. Mirrors the standalone manifest verifier (`contracts/monerium-forwarder/script/verify-manifest.ts`), which is documented as consistency evidence, not a trust root (R01).

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Webhook spoofing** | Attacker posts fabricated order events to `/v1/monerium-b2b/webhook` to invent or advance deposits | HMAC-SHA256 over raw bytes with constant-time compare; 401 before any persistence; 503 (no acceptance) if the secret is unconfigured |
| **Webhook replay / duplicate delivery** | A captured valid delivery is replayed to double-count a deposit | Durable inbox dedup on unique `event_id` (`ON CONFLICT DO NOTHING`); forward-only transitions make a replayed older state a no-op |
| **Out-of-order events regress state** | A delayed `pending` event arrives after `minted` | Forward-only transition lattice; regressions logged and dropped |
| **Attestor key leak** | Attacker obtains `MONERIUM_B2B_ATTESTOR_PRIVATE_KEY` | Blast radius is bounded by design: the key can only produce link attestations for the fixed message, never move funds (contract-side invariant); rotate key + re-deploy forwarders with new ATTESTOR immutable |
| **Attestor signing oracle abuse** | Backend is tricked into signing an arbitrary hash with the attestor key | `signLinkAttestation` derives the hash internally from the fixed LINK_MESSAGE and the forwarder address parameter; no caller-supplied hash is ever signed |
| **Concurrent processors corrupt attribution** | Two instances process events for one account simultaneously | Transaction-scoped Postgres advisory lock per forwarder address serializes all per-account writes |
| **Lost webhook between receipt and processing** | Process crashes after 200 but before the deposit write | Insert-before-200 durable inbox; unprocessed rows are retried on the next run |
| **Poison inbox row blocks processing** | A malformed payload throws forever | Non-order/unrecognized payloads are marked processed and skipped; genuine failures are logged per-row and do not block other rows |
| **API credential compromise** | Whitelabel client id/secret leak | Env-only storage; sandbox credentials are segregated from production (`MONERIUM_B2B_*` set is distinct from legacy `MONERIUM_*`); rotate at Monerium |
| **Provider unavailability** | Monerium API down | Client calls have explicit timeouts and surface 502; webhook inbox is unaffected (processing is local) |

## Audit Checklist

- [ ] `MONERIUM_B2B_ATTESTOR_PRIVATE_KEY`, `MONERIUM_B2B_CLIENT_SECRET`, `MONERIUM_B2B_WEBHOOK_SECRET` loaded from env only; grep confirms no logging of their values
- [ ] Attestor signs only the bound link hash (`attestor.ts` has no arbitrary-hash signing entry point)
- [ ] `attestor.test.ts` pins the signature layout against `VortexForwarder.isValidSignature` (65 bytes, v in 27/28, low-s, bound to forwarder address)
- [ ] Webhook HMAC verified over raw captured bytes (`config/express.ts` verify hook), constant-time compare
- [ ] Inbox insert (`ON CONFLICT DO NOTHING` on `event_id`) happens before the 200 response in `monerium-b2b.controller.ts`
- [ ] Forward-only transition guard covers all four statuses; regressive events are dropped, not applied
- [ ] All deposit writes run under `pg_advisory_xact_lock` keyed by lower-cased forwarder address
- [ ] `monerium_order_id` unique constraint present; mint-log partial unique index present (migration 051)
- [ ] `submitKybData` still returns 501 unless registry item T3 has been resolved and this spec updated
- [ ] HTTPS enforced for provider base URLs; timeouts configured on every provider call
- [ ] Sandbox-verification TODOs resolved before production: exact `webhook-signature` digest encoding, delivery id field, upstream order-state vocabulary, EIP-191 vs raw link-hash variant (registry T4)
- [ ] Keeper, guardian, and attestor private keys are three distinct keys in production; none logged
- [ ] `MONERIUM_B2B_PRIVATE_RPC_URL` set in production (public-RPC fallback warning absent from logs)
- [ ] Conversion execution rows are created before broadcast and every terminal row has status confirmed/failed with a cause; R04 allocation math covered by `conversion-executor.test.ts`
- [ ] `monitoring.ts` performs no chain writes and holds no keys; its only DB mutation is the R07 owner-authorized config reconciliation; quote-impact, stranding, association-diff and drift classification covered by `monitoring.test.ts`
- [ ] Association-monitor alerts (S1 detective control) are error-level and reference the incident runbook; owner-authorized config changes (R07) are warn-level reconciliations, never incidents
