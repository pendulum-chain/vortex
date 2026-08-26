# Monerium Onramp — Deferred Decisions Registry

**Purpose:** single place for every parameter and decision we deliberately postponed so implementation can start. Nothing in here blocks coding; each row states the placeholder used in code/spec until decided. Review this file at every phase gate.

**Last updated:** 2026-08-26

## Decision table — recommended values (2026-08-26)

Consolidated pre-deploy view: every open parameter with a concrete recommendation to
accept or overrule. Rationale and history stay in the detail sections below.

| # | Item | Placeholder in code | Recommended | Rationale | Status |
|---|---|---|---|---|---|
| B1 | GA `feeBps` | 0 (pilot) | **0 pilot / 25 bps GA starting point** | Covers keeper gas + ops without denting OTC economics; set per client at deploy, later adjustable via the P11 timelocked setter. Commercial call. | Open (business) |
| B2 | Penny-test amount | 5 USDC | **5 USDC** | Cheap, proves contract-originated credit at the destination. | Accept placeholder |
| B3 | Processing SLA wording | "within 1 business hour" | **"converted and forwarded within 4 hours of mint on business days; weekend/holiday mints execute against the last oracle round within the 52 h window and may see wider spreads"** | Matches keeper cadence + P8 weekend policy; 1 h leaves no incident headroom. | Draft for terms (G2) |
| B4 | Pilot client list + volume limits | €1k/client/day | **3–5 clients; €100k/client/day, €250k aggregate/day (paper controls)** | €1k/day is unusable for OTC tickets. Note: limits are contractual only — nothing in the backend enforces daily volume; `perSwapCap` bounds per-swap size, monitoring covers the rest. | Open (business) |
| B5 | Partner liability terms | — | **Tier A defaults from the variant doc**: partner warrants destination correctness, rotation loss borne by the client, dormancy re-activation on written partner confirmation (admin status endpoint) | Already the design the contract assumes. | Draft for partner agreement |
| B6 | Redemption-limitation disclosure | Draft in variant doc §6 | **Use the §6 draft** | Commitment made to Monerium; wording needs G2 review only. | Draft for terms (G2) |
| P1 | `SLIPPAGE_BPS` | 100 | **100** | T6 baseline shows ~14 bps impact at 25k incl. fees; 100 bps absorbs weekend EUR/USD drift inside the P8 window. | Accept placeholder |
| P2 | `MAX_FEE_BPS` | 100 | **100** | 1% ceiling leaves commercial room above the B1 value without weakening the client guarantee. | Accept placeholder |
| P3 | Dead-man sweep delay | 60 days | **60 days** | Long enough that no operational hiccup triggers it, short enough to be a credible client escape hatch. | Accept placeholder |
| P4 | Permissionless trigger delay | 24 h | **24 h** | Keeper cycles every minute; >24 h of silence means the fallback SHOULD be live. | Accept placeholder |
| P5 | Dormancy window | 60 days | **60 days** | Pairs with P3; backend-enforced, adjustable later without redeploy. | Accept placeholder |
| P6 | `minSwapAmount` (floor / operational) | €25 / €25 | **floor €25 (immutable) / operational €250** | Mainnet swap ≈ 400–600k gas; at €25 the keeper's gas can exceed 1% of volume. €250 keeps gas noise negligible for OTC sizes. Must stay ≥ each client's CEX minimum where applicable. | Set at deploy |
| P7 | `perSwapCap` (operational / ceiling) | €10k / €50k | **operational €25k / ceiling €50k** | T6: 25k executes within ~14 bps on the pinned path. Re-run T6 at the deploy block before raising the operational value. | Set at deploy |
| P8 | `MAX_ORACLE_AGE` | 26 h in test configs | **52 h** | Decided 2026-07-17 (observed weekend gaps up to 48 h). Still needs applying to the fork/invariant test configs and the deploy config. | Decided — apply |
| P9 | Notification confirmation depth | 32 blocks | **32 blocks** | Implemented (DEPOSIT_CONVERTED depth gate). | Done — close |
| P10 | Router pin + fee tiers | SwapRouter02, 5 bps hops | **SwapRouter02; re-verify both pools/fee tiers at the deploy block** | G0 output; verification action, not a value. | Action at deploy |
| T1 | `RECOVERY_HASH` / issuer recovery | `bytes32(0)` (disabled) | **Open — see options below** | See the rewritten T1 row: question to Monerium still unsent; a pilot-only permissive validator is under consideration with material tradeoffs. | **OPEN** |
| P11 | Guardian-settable `feeBps` (contract change) | — | **DECIDED + IMPLEMENTED (2026-08-26)**: guardian-only `setFeeBps`, capped by immutable `MAX_FEE_BPS`; increases announce on-chain and apply permissionlessly after `FEE_INCREASE_TIMELOCK = 24 hours` (Marcel's call); decreases (and cancel-via-restate) immediate. Monitoring reconciles guardian fee changes like owner-authorized config (warn + configVersion bump). | G2 must still scope the bounded pre-announced fee power. | Done — G2 scoping outstanding |
| O1 | Client migration to a new clone (contract upgrades, or fee changes while P11 is unbuilt) | none (no tooling) | **Backend-enforced migration procedure**: admin endpoint that announces the migration (association monitor treats it as expected), waits its own delay, then links the new clone and moves the IBAN (`PATCH /ibans`) — with the invariant that Vortex tooling only ever targets factory clones (`isForwarder` + config read-back). No on-chain timelock is possible: the IBAN move is a Monerium API call the chain never sees; the preventive layer on Monerium's side is G1 item 4 (authorization requirements on `PATCH /ibans`). | Open — build when first needed |

## Business decisions (Marcel / partner)

| # | Decision | Placeholder until decided | Needed by |
|---|---|---|---|
| B1 | GA `feeBps` value (structure is built; per-client, immutable at init) | `0` (pilot) | Before first paying client |
| B2 | Penny-test amount for destination verification | 5 USDC | Pilot onboarding runbook |
| B3 | Processing SLA wording for client terms (incl. weekend behavior) | "within 1 business hour; FX-market-hours caveat" | Terms drafting (with G2) |
| B4 | Pilot client list + per-client volume limits | €1k/client/day | G4 pilot start |
| B5 | Partner liability terms: destination warranty, rotation-loss allocation, dormancy re-confirmation mechanics | — | Partner agreement signing |
| B6 | Redemption-limitation disclosure text (Monerium requires it; commitment made in TG thread) | Draft in variant doc §6 | Terms drafting (with G2) |

## Contract parameters (decide before mainnet deploy; placeholders fine for sandbox/testnet)

| # | Parameter | Placeholder | Notes |
|---|---|---|---|
| P1 | `SLIPPAGE_BPS` | 100 (1%) | Immutable; absorbs EURe + USDC basis vs Chainlink EUR/USD |
| P2 | `MAX_FEE_BPS` | 100 (1%) | Immutable ceiling for per-client feeBps |
| P3 | Dead-man sweep delay (stranded EURe → fallbackAddress) | 60 days | Immutable; uses on-chain `strandedSince` marker (R03 fix) |
| P4 | Permissionless swap-trigger delay | 24 h | Same marker as P3 |
| P5 | Dormancy pause window (no successful forward → pause pending re-confirmation) | 60 days | Operational (backend-enforced via per-account pause), not immutable |
| P6 | `minSwapAmount` floor / operational value | €25; must also be ≥ CEX min deposit per client | Floor immutable, operational value adjustable within bounds |
| P7 | `perSwapCap` operational value + immutable ceiling | €10k / €50k | Availability parameter, not safety (minOut is safety) |
| P8 | `MAX_ORACLE_AGE` | 26 h → **recommend 52 h** | T2 answered (2026-07-17): feed updates through weekends but sparsely — observed gaps 32.6 h / 36.1 h / **48.0 h**. 26 h would revert most weekends; 52 h covers observed max + margin, weekend EUR/USD moves sit well inside the 100 bps slippage bound |
| P9 | Notification confirmation depth | 32 blocks | Backend only |
| P10 | Uniswap router pin (SwapRouter w/ deadline vs SwapRouter02 w/o) + EURC hop fee-tier re-verification | SwapRouter02 | G0 spike output |

## Technical clarifications pending (external)

| # | Item | Owner | Status |
|---|---|---|---|
| T1 | **Monerium recovery-burn mechanism for contract addresses** — OPEN (2026-08-26). The issuer recovery flow validates a signature against the linked address via EIP-1271; the forwarder currently accepts only the link hash, so `RECOVERY_HASH = bytes32(0)` disables issuer recovery entirely. Options on the table: **(a) ship the pilot as-is** (no issuer recovery; the fallback-address sweep remains the client's recovery path; issuer backstop best-effort only); **(b) obtain the exact recovery message/hash from Monerium and whitelist it** — the preferred end state, but the question has still not been sent; **requirement (review r1)**: enable only if the message is parameterless or payout-neutral, since a parameterized message validated by our attestor would grant Vortex disposal discretion; **(c) pilot-only permissive validator (Marcel, 2026-08-26)**: accept that the pilot may need a less MiCA-clean variant where `isValidSignature` validates arbitrary attestor-signed messages so every Monerium-side flow (recovery included) works. **Recorded tradeoffs for (c)**: Monerium redeem orders also validate via EIP-1271, so a permissive validator reintroduces the redeem-to-arbitrary-IBAN path the constrained design exists to block — an attestor-key compromise becomes a fiat theft path, and the non-custody analysis changes because Vortex gains disposal capability (G2 must re-scope custody/MiCA before this ships; attestor key custody would need hardening, e.g. HSM; plan a migration back to the constrained validator for GA). Decision: Marcel + G2, before mainnet deploy | Monerium tech team (question), Marcel + G2 (pilot variant) | **OPEN — question not sent; pilot variant under consideration** |
| T2 | Chainlink EUR/USD weekend behavior → weekend policy | G0 spike | **Answered 2026-07-17**: rounds observed on Sat/Sun (deviation-triggered), gaps up to 48 h; see P8. Weekend policy: execute normally with `MAX_ORACLE_AGE ≥ 52 h` |
| T6 | Liquidity baseline (review F12 reproducibility) | G0 spike | **Recorded 2026-07-17, mainnet block 25553101**, QuoterV2 on pinned path EURe→(500)→EURC→(500)→USDC: 1k → 1.14298, 5k → 1.14288, 10k → 1.14278, 25k → 1.14252 USDC/EURe (Chainlink same day 1.14410 — 25k within ~14 bps incl. 2×5 bps fees). Deeper than the 07-10 snapshot; €10k cap comfortable. Re-run at deploy + wire into monitoring (task 6) |
| T3 | Corporate KYB mechanism under whitelabel: Monerium-run verification vs KYC-reliance (reliance requires licenses we may not hold) | Monerium MSA negotiation | Open — fold into G1 |
| T4 | Whitelabel sandbox: verify EIP-1271 link works against a deployed forwarder E2E (G0 headline item) | Us | **VALIDATED 2026-07-17**: Monerium sandbox accepted the attestor-signed link (HTTP 201, `state: linked`) on first attempt and issued an IBAN (state approved) — zero client interaction. Hash variant presented: **EIP-191** → narrow the contract to `LINK_HASH_191` only before audit (drop `LINK_HASH_RAW`; folded into review-r1 follow-ups). Sandbox artifacts (Sepolia): factory `0x82f4953CF3ACaa464b67f932AAF008af010a9376`, forwarder `0x67592847844958b455ae907D3Ef1EADBf6827fdc`, MockOracle `0x337dd479435aE2593c9B023B48617278c6AB34E3`, profile `d2de6768-b0e7-11f0-a4ad-fabb3106d2e3`, IBAN `EE08 7224 5745 6244 9516`. Client API notes: `POST /addresses` body `{address, chain, message, profile, signature}` confirmed; `GET /profiles` list 404s (use per-profile paths); `POST /ibans` is async 202 → poll. **Re-validated with hardened binding** (EIP-191-only + chainid, review-r1 fixes) same day: factory2 `0xcBE354e847bF597513148918E7EbDff72aC75842`, forwarder2 `0xD7444AB7270A142227Fe659D63873ABdc8AF9b72`, link 201. Remaining G0 sliver: simulate SEPA deposit → observe mint + webhook (dashboard button at sandbox.monerium.dev → Receive → "Simulate bank transfer" — needs Marcel's dashboard login, one click) |
| T5 | Whether Monerium rejects linking an address already linked to another profile (defense-in-depth question) | Monerium tech | Nice-to-have |

## G1 — written approval package to collect from Monerium

All currently Telegram-only. Consolidate into MSA or side letter:

1. Attestor-pattern acceptance (compliance said "fine if fallback capabilities maintained" — fallback is now mandatory, so condition is met by design).
2. Redemption-limitation disclosure obligation (their explicit request; our commitment).
3. Issuer recovery backstop: burn from linked address + payout only to customer's own external bank account, no fees, re-verification possible (their statements 2026-07-16/17) + T1 mechanics.
4. IBAN pinning: authorization required for `PATCH /ibans` / `POST /addresses` on whitelabel profiles (pre-existing G1 item — unresolved).
5. OAuth→whitelabel profile portability + whether whitelabel `client_id` auto-accesses existing profiles (pre-existing; Telegram-only).
6. SEPA recall / fraud loss allocation after conversion+forwarding (pre-existing; unresolved).
7. Per-IBAN suspension capability for incident response (pre-existing; unresolved).
8. T3 corporate KYB mechanism.
9. Advance notice of any change to the EIP-1271 ownership/link message (and, once T1 resolves, the recovery message): the forwarder whitelists their exact hashes, so an unannounced change fail-closes new onboarding (2026-08-26).

## G2 — legal review scope (unchanged, not started)

Custody opinion on attestor construction; MiCA exchange/transfer-service scoping (non-custody ≠ out of scope); disclosure enforceability; DPA/controller-processor with Monerium; sanctions screening procedure for destinations.

## Decisions already made (do not reopen without cause)

- B2B variant first; consumer passkey flow is phase 2 (2026-07-17).
- Tier C dropped: self-custodied `fallbackAddress` mandatory for every client (2026-07-17; aligns with Monerium condition).
- Target whitelabel API directly, develop against sandbox; no legacy-OAuth interim build (2026-07-17).
- Adversarial review runs in parallel with implementation (2026-07-17).
- Attestor-constrained `isValidSignature` (link hash only, attestor key only, bound to contract address); never a general owner key. **Under reconsideration for the pilot only** via T1 option (c) — any relaxation goes through the T1 decision with G2, not silently.
- Never send raw EURe to a CEX destination; EURe recovery targets are `fallbackAddress` only.
- No on-contract redeem validator (F05 stands); redemption path = fallback sweep → client redeems from own address; issuer recovery as break-glass backstop (pending T1).
- Fee structure: per-client `feeBps` at init, guardian-adjustable via the 24 h-timelocked setter within immutable `MAX_FEE_BPS` (P11, 2026-08-26 — supersedes the original post-init immutability); `FEE_RECIPIENT` treasury immutable per implementation (pilot fee 0).
