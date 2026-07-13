# PRD: Quoteless EUR → USDC (Ethereum) Onramp via Monerium Whitelabel

**Status:** Draft for architecture review
**Date:** 2026-07-13
**Owner:** Vortex team
**Reviewer instructions:** see [§14 Reviewer checklist](#14-reviewer-checklist)

---

## 1. Summary

Vortex adds a new onramp flow: a user onboards once, receives a **dedicated virtual IBAN** (issued by Monerium under Vortex's whitelabel integration), and from then on any EUR they wire to that IBAN is **automatically converted to USDC on Ethereum mainnet and forwarded to a pre-configured, static destination address** — with no per-transfer quote, signature, or interaction.

The user's IBAN is linked to a **user-owned smart contract account (Safe)** on Ethereum. Monerium mints EURe directly into that Safe. A constrained, **immutable Vortex module** on the Safe performs the EURe→USDC swap and forwards proceeds to the fixed destination. The design goal is that **Vortex is never a custodian**: at no point can Vortex redirect, withhold, or seize user funds — provably, at the contract level.

## 2. Background

- Monerium is a licensed EMI issuing EURe (ERC-20 e-money token, 1:1 EUR). Each KYC'd profile can link blockchain addresses (per chain) and receives a personal IBAN; incoming SEPA payments are minted as EURe to the linked address, typically within seconds (SEPA Instant: "within 5 seconds, including the time to mint or burn EURe tokens onchain" — [monerium.com/partners](https://monerium.com/partners/)).
- Vortex will operate Monerium's **Whitelabel plan**: profile creation, KYC/KYB submission, address linking, and IBAN issuance all run through the Monerium API under the Vortex brand ([docs.monerium.com/whitelabel](https://docs.monerium.com/whitelabel)). Monerium has confirmed (commercially) that users onboarded earlier via OAuth/legacy integrations can be taken over.
- Address linking requires a one-time signature over the exact message `"I hereby declare that I am the address owner."`. For contract accounts Monerium validates via **EIP-1271** `isValidSignature` on-chain ([docs.monerium.com/oauth/#eip-1271](https://docs.monerium.com/oauth/#eip-1271)). **The contract must already be deployed when the link is validated** — the docs do not mention ERC-6492/counterfactual signature support. Linking is **per-chain** (`ethereum` for this flow).
- Redeem orders (EURe → SEPA payout) also accept EIP-1271 signatures — relevant for the recovery path (§8.4).
- **Precedent:** Gnosis Pay uses the same primitive stack (Safe + Monerium EURe + constrained Zodiac modules) to build a non-custodial card product. This validates the general architecture; our module constraints differ but the trust model is analogous.

### 2.1 Verified liquidity facts (as of 2026-07-10 — re-verify at build time)

- EURe **V2** on Ethereum: `0x39b8B6385416f4cA36a20319F70D28621895279D`. The V1 token (`0x3231Cb...273f`) is deprecated; several stale V1 pools still show TVL — must not be used.
- There is **no meaningful direct EURe/USDC pool on Ethereum**. The real route is **EURe → EURC → USDC**:
  - EURe/EURC Uniswap v3 0.05% (`0x2a817bd5018f9782f84398067639230121e07d4c`): ~$104k TVL — the bottleneck hop.
  - EURC/USDC Uniswap v3 0.05% (`0x95dbb3c7546f22bce375900abfdd64a4e5bd73d6`) + v4 pools: >$5M TVL, ~$2.6M daily volume — effectively unconstrained at our sizes.
- Measured aggregator quotes: 10k EURe → USDC at spot (~zero impact); 50k EURe via pure AMM routing suffers **~3.6% impact** (bottleneck pool exhausted), while CoW Swap quoted ~spot at 50k via solver/RFQ liquidity.
- Consequence: v1 must enforce **per-swap size caps** (§7.3) and the routing layer must be replaceable (§7.4).

## 3. Goals

1. One-time onboarding: single passkey ceremony; **exactly one signature** (the Monerium link message). No wallet extension required.
2. Fully automatic post-onboarding flow: EUR in → USDC at destination, no user action.
3. **Non-custodial by construction**: Vortex cannot change the destination, cannot withdraw funds, cannot upgrade logic into something that can. Bounded worst-case loss from any Vortex compromise (§8.3).
4. Swap routing is replaceable over time (pools/DEXes change) **without** weakening guarantee 3.
5. Reasonable execution quality: bounded slippage vs. EUR/USD oracle rate.

### Non-goals (v1)

- Offramp (USDC → EUR) — future work; the same account layout supports it via Monerium redeem orders.
- Quotes, limit prices, or user-selectable destinations per transfer.
- Chains other than Ethereum mainnet for mint/swap/delivery.
- Supporting user-supplied external wallets as the deposit target.

## 4. Actors & trust model

| Actor | Role | Trust required |
|---|---|---|
| User | Owns passkey → owns Safe; sends EUR from their bank | Trusts Monerium (fiat/e-money layer) and audited contracts; does **not** need to trust Vortex for fund safety |
| Vortex backend | Whitelabel API client: onboarding, KYC submission, webhooks; runs the keeper | Can censor (not execute) and delay; cannot steal beyond bounded slippage margin (§8.3) |
| Monerium | EMI: KYC of record, IBAN issuance, EURe mint/burn | Fully trusted for fiat layer (licensed, regulated); EURe token has issuer admin powers (freeze/upgrade) inherent to e-money |
| Keeper (Vortex-operated) | Triggers swap+forward when EURe arrives | Untrusted for safety — all safety is enforced in the module; trusted only for liveness |
| Safe (per user) | Holds EURe transiently; owner = user passkey **only** | Battle-tested Safe v1.4.1+ contracts |
| VortexSwapModule | Immutable module enabled on the Safe at setup | The security-critical component — see invariants §8.2 |

**Custody analysis:** the Safe's only owner is the user's passkey. Vortex is not an owner, holds no keys to the account, and its module cannot move assets anywhere except (a) into a swap that must return oracle-checked USDC, and (b) USDC to the immutable destination. Vortex's practical powers are limited to *not acting* (censorship/liveness failure), which does not constitute control of funds. Formal legal sign-off required (§13).

## 5. End-to-end flows

### 5.1 Onboarding (one passkey ceremony, one signature)

1. User completes Vortex-branded KYC (whitelabel: Vortex submits identity data / SumSub applicant token to Monerium via `POST /profiles` + KYC endpoints; approval via webhook).
2. Browser creates a **passkey** (WebAuthn platform authenticator — Face ID / fingerprint / Windows Hello; synced via iCloud Keychain / Google Password Manager).
3. Vortex backend deploys, in one transaction (Vortex pays gas):
   - the Safe (v1.4.1+, CREATE2, deterministic address), owner = the passkey's `SafeWebAuthnSigner`, threshold 1;
   - enables `VortexSwapModule` (immutable, points at this Safe's immutable `destination` and config);
   - (optional, §8.4) enables `RecoveryValidatorModule`.
   Deployment **must complete before linking** (no counterfactual link — §2).
4. User performs **the one signature**: passkey signs `"I hereby declare that I am the address owner."` (WebAuthn assertion wrapped for Safe EIP-1271 verification).
5. Vortex backend calls Monerium `POST /addresses` (link address to profile, `chain: ethereum`, with signature). Monerium validates via `isValidSignature` on the deployed Safe.
6. Monerium issues the dedicated IBAN. Vortex shows the user: their IBAN + the fixed destination address + fee/rate disclosure.

The **destination address** is collected and confirmed during onboarding (see Open Question Q2 on ownership attestation) and is baked into the module config before the user signs the link message — the user's single signature therefore implicitly ratifies the destination.

### 5.2 Steady-state transfer

1. User wires EUR (SEPA/SEPA Instant) to their IBAN.
2. Monerium mints EURe (V2) to the user's Safe on Ethereum. Vortex detects via Monerium webhook **and** an on-chain `Transfer` watcher (defense in depth).
3. Keeper calls `VortexSwapModule.swapAndForward(safe, routeData)`:
   - module reads the Safe's full EURe balance (subject to per-swap cap; splits large balances across multiple executions);
   - computes `minOut` from Chainlink EUR/USD (§7.2);
   - approves exactly `amountIn` EURe to the route's router (allowlisted, §7.4), executes the swap **from the Safe's context via `execTransactionFromModule` (call only, no delegatecall)**;
   - verifies post-conditions (USDC delta ≥ `minOut`, EURe delta ≤ `amountIn`, approval reset to 0);
   - transfers the Safe's full USDC balance to `destination`;
   - emits an event; keeper tx submitted via private orderflow (Flashbots Protect) to avoid sandwiching.
4. Vortex notifies the user (email/app): amount received, USDC delivered, tx hash.

### 5.3 Exit / recovery

- **User-initiated (passkey):** the user is the Safe owner and can always execute arbitrary transactions — withdraw EURe/USDC, disable modules, change destination, or abandon the flow. User-initiated actions are rare; they run through ERC-4337 with a Vortex paymaster (or a Vortex-relayed Safe tx) so the user never needs ETH.
- **Passkey loss:** the automated flow **keeps working** (keeper needs no user signature), so in-flight and future deposits still reach the destination. Only user-initiated recovery is lost. Mitigations: passkeys are cloud-synced by default; optionally add a user-controlled recovery owner (email-based recoverer such as Candide/Safe Recovery Hub) — decide in Q3.
- **Stranded EURe** (swap route dead, or swaps paused): see §8.4 recovery module — EURe can be redeemed back to the **user's own bank IBAN** via a Monerium redeem order pre-authorized at setup. Never sweep raw EURe to `destination` — if destination is an exchange deposit address, EURe would be unsupported and lost.

## 6. System components

1. **Vortex backend (apps/api)** — new Monerium whitelabel service: profile/KYC lifecycle, address linking, webhook ingestion (profile approved, payment received, order state), IBAN issuance; persistence of user ↔ Safe ↔ destination mapping; keeper job scheduling. Follows the existing phase/state-machine pattern (new ramp type `monerium_onramp` with phases: `awaitDeposit → detectMint → swapAndForward → notifyComplete`).
2. **Frontend** — onboarding flow (KYC UI, passkey ceremony, destination input + confirmation, disclosure screen); status page (deposits, conversions, tx links). No wallet-connect requirement.
3. **Contracts** (new package or `contracts/` dir):
   - `VortexAccountFactory` — deploys Safe + WebAuthn signer + module wiring atomically via CREATE2.
   - `VortexSwapModule` — immutable per-deployment singleton, parameterized per Safe (see §8).
   - `RouterRegistry` — Vortex-owned allowlist of swap routers, behind a timelock (§7.4).
   - `RecoveryValidatorModule` (optional v1, §8.4).
4. **Keeper service** — watches mints, builds route calldata (v1: Uniswap path; later: aggregator calldata), submits via private relay, retries, alerts.
5. **Oracle** — Chainlink EUR/USD feed on mainnet (verify address, heartbeat ~24h / deviation ~0.15% at build time; staleness guard in module).

## 7. Swap routing

### 7.1 v1 route: Uniswap v3 multi-hop, single call

Uniswap v3's router supports multi-hop swaps in **one call**: `exactInput(path)` with the encoded path `EURe → (0.05%) → EURC → (0.05%) → USDC`. No aggregator dependency, fully on-chain, deterministic. This answers the "can Uniswap swap over two pools in one call" question: yes, natively.

### 7.2 Execution bounds

- `minOut = amountIn × chainlinkEURUSD × (1 − maxSlippageBps) × 10^(−12)` (EURe 18 decimals → USDC 6 decimals).
- `maxSlippageBps` is an **immutable constant** in the module (proposal: 100 bps). Note this bound implicitly tolerates EURe/EUR and USDC/USD depegs up to the same margin; a hard depeg beyond it makes swaps revert (fail-safe: funds sit as EURe until resolved or recovered via §8.4).
- Oracle staleness check: revert if `updatedAt` older than heartbeat + grace.

### 7.3 Size caps & batching

- Per-swap cap (proposal: **€10,000 equivalent**, constant in module or registry) — sized to the bottleneck EURe/EURC pool. Larger balances are swapped in successive keeper executions spaced over time.
- Min-swap threshold (proposal: €25) to avoid uneconomical dust swaps; dust accumulates until threshold.
- These parameters should live in the `RouterRegistry` (timelocked, bounded: cap can never exceed a module-immutable ceiling; slippage never above the immutable 100 bps).

### 7.4 Route replaceability without custody risk

The module's **logic is immutable**; only **route data** is replaceable:

- `RouterRegistry` (owned by Vortex multisig behind a **7-day timelock**, all changes evented/public) maps `routeId → (router address, selector allowlist)`.
- Keeper passes `(routeId, calldata)`; module checks router is registered, executes, then enforces post-conditions (§8.2). Because post-conditions are checked in the immutable module, **even a malicious registered router cannot extract more than the slippage margin** (§8.3).
- v2 candidates behind the same interface: 1inch/Paraswap executor calldata (validated by the same balance-delta checks), or **CoW Protocol programmatic orders** (ComposableCoW handler signing "sell all EURe for USDC, min = oracle × (1−slippage), receiver = destination" via EIP-1271) — this is the route that quoted the 50k clip at spot in testing and removes keeper gas + MEV concerns entirely. Recommended as the first post-launch iteration.

### 7.5 MEV

Keeper transactions go through private orderflow (Flashbots Protect / MEV-blocker). Worst-case sandwich loss is already capped by `minOut`, private submission just avoids donating the margin.

## 8. Smart contract specification

### 8.1 Per-user configuration (set at Safe deployment, before the link signature)

| Param | Mutability |
|---|---|
| `EURE` (V2 token addr) | immutable |
| `USDC` token addr | immutable |
| `destination` | **immutable to Vortex**; changeable only via Safe owner (user passkey) transaction |
| `oracle` (Chainlink EUR/USD) | immutable (module version) |
| `maxSlippageBps` | immutable constant |
| `routerRegistry` | immutable pointer; registry contents timelocked (§7.4) |

### 8.2 Module invariants (the security core — reviewer: attack these)

- **I1**: The module can move only two tokens: EURe (into a registered router, exact-amount approval) and USDC (only to `destination`, full balance).
- **I2**: After `swapAndForward`: `usdcReceived ≥ minOut(oracle)`, `eureSpent ≤ amountIn`, EURe allowance to router reset to 0. Otherwise revert (atomic).
- **I3**: `execTransactionFromModule` is used with `operation = CALL` only — **no delegatecall ever** (a delegatecall would let a router rewrite Safe storage/owners).
- **I4**: The module cannot add/remove Safe owners, change threshold, or enable/disable modules.
- **I5**: The module has no upgrade mechanism, no `selfdestruct`, no owner-privileged functions beyond `swapAndForward` (keeper-gated or permissionless — see Q5) and view functions.
- **I6**: Vortex's only levers are: registry contents (timelocked, bounded by immutable caps) and choosing when/whether to call the keeper function.
- **I7**: Reentrancy-guarded; balance deltas measured against pre-call snapshots on the Safe itself.
- **I8**: Only the user (Safe owner) can disable the module or change `destination`.
- **I9**: The module rejects `routeData` whose router is not currently registered, and enforces a calldata selector allowlist per router entry.

### 8.3 Bounded worst-case (full Vortex compromise)

If Vortex's registry multisig is compromised AND the 7-day timelock elapses unnoticed AND a malicious router is registered: the router still must return `minOut` USDC to pass I2, so the maximum extractable value is **`maxSlippageBps` (+ oracle deviation) per swap** — ~1.15% of throughput, not principal. Vortex compromise can additionally *halt* swaps (liveness), never redirect principal. This bound should be stated in user-facing terms and verified by the auditor.

### 8.4 Recovery path for stranded EURe (recommended for v1)

`RecoveryValidatorModule`: an immutable module that makes the Safe's EIP-1271 `isValidSignature` return valid **only** for messages matching Monerium's redeem template `"Send EUR <amount> to <IBAN> at <timestamp>"` where `<IBAN>` hash-matches a `refundIban` pinned at setup (the user's own external bank account, collected at onboarding; changeable only by user passkey). This lets the Vortex backend place a Monerium redeem order returning stranded EURe **to the user's own bank account** with no user signature — non-custodial because the only authorizable payout target is the user's own pinned IBAN. Constraints: template must be parsed/validated strictly (amount ≤ balance, timestamp freshness); coordinate with Monerium that link-message validation is unaffected (the link message must also validate — the validator whitelists exactly these two message shapes).

### 8.5 Known external powers (accepted, disclose)

- EURe and USDC are issuer-controlled tokens (upgradeable; freeze/blacklist powers). A blacklisted `destination` (USDC) or frozen Safe (EURe) strands funds pending issuer/compliance resolution — inherent to fiat-backed stablecoins, mitigated by §8.4 and user-changeable destination.
- Chainlink feed failure → swaps revert (fail-safe, funds idle as EURe).

## 9. Fees & unit economics (open — Q1)

- Costs per user: one-time Safe+module deployment (mainnet, Vortex-paid — estimate and monitor; low at current basefees) + per-swap keeper gas (~350–600k gas).
- No quote is shown, so the fee must be a **disclosed, deterministic rule**, e.g. an immutable `feeBps` in the module skimmed to a Vortex treasury address at forward time (transparent, auditable, part of the signed-off config), plus disclosure "conversion at market rate, max slippage 1%". Spread-capture (silently keeping the slippage margin) is rejected: it's opaque and undermines the non-custody story.
- MiCA/consumer transparency: even quoteless, the flow needs pre-contractual disclosure of fee rule and rate mechanism (legal review, Q7).

## 10. Compliance notes

- Monerium whitelabel MSA covers the "client money / third-party use" ToS restriction at the fiat layer: each user is Monerium's e-money customer; Vortex never holds fiat or e-money on its own account in this flow.
- Non-custody at the crypto layer per §4/§8.3 — needs formal legal opinion for target jurisdictions (MiCA CASP analysis: does orchestrating an automatic conversion constitute an exchange service even without custody?).
- **Destination ownership (Q2)**: if `destination` must be user-owned (attested at onboarding), the flow is self-transfer-shaped (cleaner: no travel-rule counterparty, weaker "payment service" characterization). Allowing third-party destinations turns this into a payments product with materially heavier obligations. v1 recommendation: require attestation of user ownership.
- Monerium performs AML screening on incoming SEPA; large/first-party-mismatched deposits may be held for review — surface "pending compliance review" state in UX. Verify with Monerium whether incoming mints have amount thresholds analogous to the €15k redeem-document rule.

## 11. Failure modes

| Failure | Behavior | Mitigation |
|---|---|---|
| Swap reverts (slippage/oracle stale/pool drained) | EURe idles in Safe | Keeper retries with backoff; alerting; route change via registry; §8.4 recovery after timelock |
| Keeper down | No swaps (funds safe in Safe) | Redundant keepers; optionally make `swapAndForward` permissionless (Q5) so anyone can execute |
| Monerium webhook missed | Delayed detection | On-chain Transfer watcher as second trigger |
| Deposit > per-swap cap | Multiple sequential swaps | Automatic split; disclose timing to user |
| EUR sent from a bank account not matching profile name | Monerium compliance hold or return | Surface state; instruct users to send from own account |
| Passkey lost | Automation unaffected; user-initiated actions blocked | Cloud-synced passkeys; optional recovery owner (Q3) |
| Destination blacklisted by Circle | Forward reverts; USDC stuck in Safe | User changes destination via passkey; support runbook |
| EURe frozen by issuer | Nothing moves | Compliance resolution with Monerium |
| Depeg beyond slippage bound | Swaps revert (by design) | Monitor; product decision to pause/notify |

## 12. Rollout

1. **M0 — Spike:** deploy Safe+passkey+module on Sepolia/fork; validate Monerium sandbox EIP-1271 link end-to-end (sandbox.monerium.dev); confirm WebAuthn signer gas on mainnet (EIP-7951 precompile path post-Fusaka vs Solidity fallback).
2. **M1 — Contracts:** module + registry + factory, full test suite (fork tests against real pools incl. V1-pool poisoning tests), invariant/fuzz tests on I1–I9, external audit.
3. **M2 — Backend/Frontend:** whitelabel onboarding, keeper, state machine, notifications; internal pilot with capped amounts (e.g. €1k/user/day).
4. **M3 — GA:** raise caps; add CoW programmatic-order route (§7.4) for large-clip execution.

## 13. Open questions

- **Q1 — Fee model:** immutable `feeBps` in-module vs off-chain billing vs loss-leader. Blocks module finalization.
- **Q2 — Destination ownership:** require user-owned destination attestation in v1? (Recommended: yes.)
- **Q3 — Passkey recovery:** rely on platform sync only, or add an opt-in recovery owner in v1?
- **Q4 — Recovery module (§8.4) in v1 scope?** (Recommended: yes — it's the only fix for stranded EURe + lost passkey.)
- **Q5 — Keeper gating:** `swapAndForward` restricted to Vortex keeper vs fully permissionless (better liveness/decentralization; safe because all safety is in invariants — but consider griefing via unfavorable-timing executions within the slippage bound).
- **Q6 — Monerium specifics to confirm in sandbox/MSA:** whitelabel address-link flow identical to the OAuth EIP-1271 docs; ERC-6492 support (else deploy-before-link stands); incoming-payment compliance thresholds; who bears mint gas (expected: Monerium); redeem-order EIP-1271 details for §8.4.
- **Q7 — Legal:** non-custody opinion; MiCA CASP scoping; disclosure requirements for quoteless conversion.

## 14. Reviewer checklist

You are reviewing for architectural flaws. Specifically attempt to break:

1. **Theft vectors:** any path where Vortex (backend, keeper, registry multisig, module deployer) redirects or extracts user principal. Include: malicious router within I1–I9; oracle manipulation (Chainlink EUR/USD compromise or staleness games); approval leakage; reentrancy through router callbacks; delegatecall smuggling; CREATE2 redeployment tricks; malicious `SafeWebAuthnSigner` substitution at factory level; front-running the link (linking a Monerium profile to a Safe the user doesn't actually control — who verifies factory integrity?).
2. **The one-signature claim:** does anything in practice require a second user signature (Monerium re-verification, destination change, 4337 deployment quirks)?
3. **Stranding vectors:** enumerate every state where funds are stuck and no §8.4/§5.3 path applies.
4. **Liveness/censorship:** consequences of Vortex disappearing permanently — can users self-rescue with only their passkey and public docs?
5. **§8.3 bound:** verify the claimed worst-case (slippage margin, not principal) holds under composed failures (compromised registry + compromised keeper + oracle at deviation edge).
6. **Liquidity math:** per-swap cap vs the $104k bottleneck pool; behavior under pool migration/deprecation; V1-token poisoning.
7. **Compliance shape:** does the §10 reasoning hold; is the "not a custodian" claim defensible given the module is Vortex-authored and Vortex-deployed?
8. **Recovery module (§8.4):** can the message-template validator be abused (IBAN substring games, amount/timestamp manipulation, replay across chains/profiles, interference with the link-message validation)?
9. **Operational realism:** webhook loss, chain reorgs around mint detection, multiple rapid deposits, decimals (EURe 18 / USDC 6), gas spikes.
