# Monerium Onramp — Deferred Decisions Registry

**Purpose:** single place for every parameter and decision we deliberately postponed so implementation can start. Nothing in here blocks coding; each row states the placeholder used in code/spec until decided. Review this file at every phase gate.

**Last updated:** 2026-07-17

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
| T1 | **Monerium recovery-burn mechanism for contract addresses**: exact message/hash their recovery flow validates via EIP-1271, so the forwarder can whitelist it (compile-time constant `RECOVERY_HASH`). If unanswered by deploy time: ship without it — fallback-address recovery covers us; issuer backstop becomes best-effort | Monerium tech team (compliance punted) | **Asked? No — send follow-up** |
| T2 | Chainlink EUR/USD weekend behavior → weekend policy | G0 spike | **Answered 2026-07-17**: rounds observed on Sat/Sun (deviation-triggered), gaps up to 48 h; see P8. Weekend policy: execute normally with `MAX_ORACLE_AGE ≥ 52 h` |
| T6 | Liquidity baseline (review F12 reproducibility) | G0 spike | **Recorded 2026-07-17, mainnet block 25553101**, QuoterV2 on pinned path EURe→(500)→EURC→(500)→USDC: 1k → 1.14298, 5k → 1.14288, 10k → 1.14278, 25k → 1.14252 USDC/EURe (Chainlink same day 1.14410 — 25k within ~14 bps incl. 2×5 bps fees). Deeper than the 07-10 snapshot; €10k cap comfortable. Re-run at deploy + wire into monitoring (task 6) |
| T3 | Corporate KYB mechanism under whitelabel: Monerium-run verification vs KYC-reliance (reliance requires licenses we may not hold) | Monerium MSA negotiation | Open — fold into G1 |
| T4 | Whitelabel sandbox: verify EIP-1271 link works against a deployed forwarder E2E (G0 headline item) | Us | **VALIDATED 2026-07-17**: Monerium sandbox accepted the attestor-signed link (HTTP 201, `state: linked`) on first attempt and issued an IBAN (state approved) — zero client interaction. Hash variant presented: **EIP-191** → narrow the contract to `LINK_HASH_191` only before audit (drop `LINK_HASH_RAW`; folded into review-r1 follow-ups). Sandbox artifacts (Sepolia): factory `0x82f4953CF3ACaa464b67f932AAF008af010a9376`, forwarder `0x67592847844958b455ae907D3Ef1EADBf6827fdc`, MockOracle `0x337dd479435aE2593c9B023B48617278c6AB34E3`, profile `d2de6768-b0e7-11f0-a4ad-fabb3106d2e3`, IBAN `EE08 7224 5745 6244 9516`. Client API notes: `POST /addresses` body `{address, chain, message, profile, signature}` confirmed; `GET /profiles` list 404s (use per-profile paths); `POST /ibans` is async 202 → poll. Remaining G0 sliver: simulate SEPA deposit → observe mint + webhook (mechanism TBD, likely sandbox dashboard) |
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

## G2 — legal review scope (unchanged, not started)

Custody opinion on attestor construction; MiCA exchange/transfer-service scoping (non-custody ≠ out of scope); disclosure enforceability; DPA/controller-processor with Monerium; sanctions screening procedure for destinations.

## Decisions already made (do not reopen without cause)

- B2B variant first; consumer passkey flow is phase 2 (2026-07-17).
- Tier C dropped: self-custodied `fallbackAddress` mandatory for every client (2026-07-17; aligns with Monerium condition).
- Target whitelabel API directly, develop against sandbox; no legacy-OAuth interim build (2026-07-17).
- Adversarial review runs in parallel with implementation (2026-07-17).
- Attestor-constrained `isValidSignature` (link hash only, attestor key only, bound to contract address); never a general owner key.
- Never send raw EURe to a CEX destination; EURe recovery targets are `fallbackAddress` only.
- No on-contract redeem validator (F05 stands); redemption path = fallback sweep → client redeems from own address; issuer recovery as break-glass backstop (pending T1).
- Fee structure: per-client immutable `feeBps` at init, immutable `MAX_FEE_BPS` + treasury (pilot 0).
