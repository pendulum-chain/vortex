# Architecture Review: Quoteless EUR → USDC Onramp via Monerium

**Reviewed document:** [monerium-eur-usdc-onramp.md](./monerium-eur-usdc-onramp.md)  
**Review date:** 2026-07-13  
**Review status:** Blocking issues identified; author response requested  
**Recommended decision:** **No-go for implementation or audit until the P0 findings are resolved**

## 1. Purpose of this review

This document is a deliberately adversarial review of the proposed Monerium EUR → USDC architecture. It is intended to be handed back to the authoring agent for a point-by-point response.

For each finding, the author should state one of:

- **Accept** — the PRD will be changed as recommended.
- **Reject** — explain why the concern does not apply and provide evidence.
- **Modify** — propose a different resolution and explain the resulting trust assumptions.
- **Needs validation** — identify the spike, Monerium confirmation, legal opinion, or contract prototype needed to decide.

The review distinguishes between:

- on-chain safety after EURe has reached the Safe;
- provisioning and fiat-ingress authority before mint;
- operational liveness and recovery;
- user-facing and legal claims;
- compatibility with Vortex's existing one-shot ramp architecture.

## 2. Executive conclusion

The product primitive is credible: a personal IBAN can mint EURe to a linked smart account, and an automated account policy can convert it to USDC. The current proposal, however, overstates the end-to-end security guarantee.

The central claim — that Vortex can never redirect, withhold, or seize user funds and that a full Vortex compromise can lose only the slippage margin — is not established across the complete system. It currently excludes:

1. Monerium address and IBAN-management authority;
2. malicious or incorrect Safe provisioning;
3. fallback-handler and recovery authority;
4. generic router calldata and unrelated Safe approvals;
5. passkey/domain dependence when Vortex disappears;
6. fees and future CoW execution;
7. the fact that a reusable IBAN is not a one-shot ramp.

The architecture can be salvaged, but v1 should be materially smaller and the trust statement should be rewritten as a set of scoped guarantees rather than a single absolute claim.

## 3. What appears sound

The following foundations are reasonable, subject to sandbox and contract-level verification:

- Monerium documents automatic issuance to the wallet linked to a dedicated IBAN.
- Monerium documents off-chain EIP-1271 verification for smart-contract-wallet address linking.
- Safe supports WebAuthn/passkey contract owners.
- Ethereum mainnet has supported the EIP-7951 P-256 precompile since Fusaka.
- Uniswap v3 supports a two-hop exact-input path in one router call.
- An immutable module that constructs tightly constrained calls and verifies token deltas is a sound direction.
- Oracle-based minimum output, strict staleness checks, no delegatecall, exact approvals, atomic forwarding, and invariant/fuzz tests are appropriate defenses.
- Explicitly acknowledging issuer freeze/upgrade powers and fail-safe reverts is correct.

These strengths do not resolve the findings below, but they make a reduced v1 viable.

## 4. Priority summary

| ID | Priority | Finding | Blocks |
|---|---|---|---|
| F01 | P0 | Monerium control plane may redirect future deposits | Non-custody claim, GA |
| F02 | P0 | “Full Vortex compromise” excludes provisioning and fiat ingress | Security model, audit |
| F03 | P0 | The one signature does not bind destination or Safe configuration | Onboarding claim, destination attestation |
| F04 | P0 | Per-user module topology is internally contradictory | Contract design |
| F05 | P0 | RecoveryValidator is not an ordinary Safe module and may bypass ownership | Recovery, EIP-1271, custody |
| F06 | P0 | Router plus selector allowlisting is insufficient | Principal-safety invariant |
| F07 | P0 | CoW cannot preserve the synchronous module invariants behind the same interface | Route replaceability claim |
| F08 | P0 | A permanent IBAN cannot be represented as one terminal Vortex ramp | Backend architecture |
| F09 | P1 | Oracle math and economic bound are underspecified | Contract finalization |
| F10 | P1 | The proposed fee contradicts I1 and changes the compromise bound | Contract finalization |
| F11 | P1 | Passkey-only self-rescue depends on Vortex's RP domain and infrastructure | Liveness claim |
| F12 | P1 | Liquidity caps rely on snapshot TVL rather than executable depth | Availability and rollout |
| F13 | P1 | Webhook, reorg, concurrency, and deposit attribution rules are missing | Backend correctness |
| F14 | P1 | Immutable modules have no credible incident or migration path | Production safety |
| F15 | P1 | Compliance, data protection, and payment-reversal responsibilities are incomplete | Launch readiness |
| F16 | P1 | Dust, gas griefing, and destination edge cases break the automatic-flow promise | Product behavior |
| F17 | P2 | Several failure-mode statements need correction or sharper scope | Specification accuracy |
| F18 | P2 | v1 composes too many overlapping Safe extension mechanisms | Auditability and maintainability |

## 5. Detailed findings

### F01 — Monerium control-plane authority may redirect future deposits

**Priority:** P0  
**Affected PRD sections:** §1, §4, §5.1, §8.3, §10

#### Concern

The custody analysis begins after EURe reaches the expected Safe. It does not establish that Vortex lacks authority to change where future incoming EUR is minted.

Monerium's published whitelabel documentation states that:

- a whitelabel client can link addresses to a customer profile;
- `PATCH /ibans/{iban}` can re-associate an existing IBAN with a different linked address or chain;
- incoming payments are routed to the newly associated address;
- a SEPA memo can route issuance to another linked address.

From the public API shape, a compromised Vortex backend appears able to link an attacker-controlled address — for which the attacker can provide a valid proof of ownership — and move the customer's IBAN to it. This is an inference that must be confirmed with Monerium, but it invalidates the current absolute claim unless Monerium applies additional scopes or user-authorization checks not described publicly.

#### Required resolution

Obtain a written and sandbox-verified Monerium guarantee that, for these profiles:

1. Vortex cannot move the IBAN after activation without authorization from the currently linked Safe;
2. a new address cannot become the default mint address without equivalent end-user authorization;
3. memo-based routing can be disabled or constrained;
4. whitelabel credentials are scoped so their compromise cannot redirect customer issuance;
5. every attempted association change produces an independently monitored event.

If Monerium cannot provide those controls, rewrite the trust model:

> Vortex is trusted not to change the Monerium IBAN association. The on-chain non-custody guarantee starts only after EURe is finalized at the verified Safe.

#### Questions for the author

- What exact authorization does Monerium require for `PATCH /ibans/{iban}`?
- Can Vortex link its own address to a customer's profile using Vortex-controlled proof of that address?
- Can profiles be configured with exactly one non-movable Ethereum address?
- Can memo routing be disabled?
- How are legacy profiles with existing linked addresses handled?

### F02 — The “full Vortex compromise” bound is not a full-compromise bound

**Priority:** P0  
**Affected PRD sections:** §4, §8.2, §8.3, §14

#### Concern

The §8.3 analysis covers a compromised keeper and registry multisig. A full Vortex compromise also includes:

- Monerium client credentials;
- factory bytecode and deployment calldata;
- frontend-provided configuration;
- Safe singleton and proxy-factory selection;
- Safe owners and threshold;
- enabled modules, guard, module guard, and fallback handler;
- passkey signer coordinates and verifier configuration;
- destination, fee recipient, recovery IBAN, and recovery policy.

A Safe can contain the user's passkey owner and still contain an attacker owner or unrestricted module. The fixed Monerium ownership message can validate through the user's owner without proving that the remainder of the Safe configuration is safe.

#### Required resolution

Rename §8.3 to **“Post-deployment keeper and route-governance compromise”** and add separate threat bounds for:

1. provisioning compromise;
2. frontend compromise;
3. Monerium credential compromise;
4. oracle compromise;
5. passkey compromise;
6. stablecoin issuer compromise;
7. dependency upgrade or code-substitution compromise.

Before address linking, both frontend and backend should independently verify the deployed account against a versioned public manifest containing:

- chain ID;
- exact Safe singleton runtime hash and version;
- canonical proxy factory;
- owners and threshold;
- enabled modules;
- fallback handler;
- transaction guard and module guard;
- module runtime hash and immutable arguments;
- destination;
- fee configuration;
- oracle and registry addresses;
- recovery configuration.

#### Questions for the author

- Which components are assumed honest during provisioning?
- What prevents a compromised frontend and backend from presenting a Safe with an extra module?
- What independent evidence can a user or external auditor use to verify a specific deployed account?

### F03 — The one Monerium signature does not bind the destination or configuration

**Priority:** P0  
**Affected PRD sections:** §3.1, §5.1, §10 Q2

#### Concern

The fixed message `I hereby declare that I am the address owner.` contains no:

- chain ID;
- Safe address in the signed text;
- destination;
- module implementation or runtime hash;
- fee rule;
- router/oracle configuration;
- recovery policy.

The assertion proves control of the configured Safe owner under the Safe's current EIP-1271 behavior. It does not “implicitly ratify” an off-chain destination shown in the UI.

Requiring cryptographic ownership of an arbitrary external destination creates a second conflict: ownership must be proven by the destination's key, which cannot generally be proven by the Safe passkey and may require a wallet extension or separate signer.

#### Required resolution

Choose one explicit model:

1. **Two-signature model:** retain the Monerium link assertion and add an EIP-712 deployment-intent signature covering the complete manifest. Add a separate destination signature if destination ownership is required.
2. **Safe-as-destination model:** retain USDC in the passkey-owned Safe and remove arbitrary destination attestation and forwarding.
3. **Trusted provisioning model:** keep one signature but state that the user trusts Vortex's frontend and provisioning backend to deploy the displayed configuration.
4. **Custom signer model:** create and audit a custom WebAuthn signer whose validation of the fixed Monerium hash also commits to immutable account configuration. This adds substantial bespoke cryptographic risk and is not recommended for v1.

#### Questions for the author

- Is “one signature” a hard product constraint or a preference?
- What constitutes destination ownership for exchanges, smart accounts, and custodial deposit addresses?
- Is a UI confirmation intended as legal consent, cryptographic consent, or both?

### F04 — The module topology is internally contradictory

**Priority:** P0  
**Affected PRD sections:** §5.1, §6.3, §8.1, I8

#### Concern

The PRD describes `VortexSwapModule` as:

- an immutable per-deployment singleton;
- parameterized per Safe;
- containing per-user immutable destination/configuration;
- allowing the user to change destination.

A single Solidity deployment cannot have different constructor immutables per Safe. A contract-level immutable destination also cannot be changed. If configuration is stored in a mapping, it is storage, not immutable, and requires an initialization/update authorization design.

#### Required resolution

Specify one topology in pseudocode and storage layout:

**Option A — per-Safe minimal clone with immutable arguments**

- one module instance per Safe;
- destination, oracle, maximum slippage, registry, and fee configuration encoded as immutable arguments;
- changing destination means deploying and owner-authorizing a new module, then disabling the old one.

**Option B — singleton with Safe-keyed configuration**

- configuration initialized atomically during Safe setup;
- initialization cannot be front-run or repeated;
- updates are accepted only when the corresponding Safe itself calls through an owner-authorized transaction;
- events and explicit versioning cover every mutation.

Pin an exact audited Safe version and deployed addresses. `v1.4.1+` is not a reproducible security dependency.

#### Questions for the author

- Is the module one deployment per user or one deployment for all users?
- Where exactly is destination stored?
- What on-chain operation implements “change destination”?
- Does the custom `VortexAccountFactory` add value beyond canonical Safe factories sufficient to justify its audit surface?

### F05 — The recovery validator is not an ordinary Safe module

**Priority:** P0  
**Affected PRD sections:** §5.3, §6.3, §8.4, Q3, Q4

#### Concern

Enabling a normal Safe module does not change Safe's `isValidSignature`. ERC-1271 support is normally provided by a fallback handler. The design also needs ERC-4337, whose `Safe4337Module` acts as both module and fallback handler. The future CoW proposal expects an extensible fallback-handler path. These cannot be installed independently without an explicit composition design.

Further issues:

1. ERC-1271 receives a message hash and signature. It cannot parse the original redeem string unless that string is encoded into the signature payload and re-hashed on-chain.
2. Monerium documents both full and shortened IBAN forms. The policy needs one canonical representation.
3. Monerium accepts timestamps close to the present or in the future; the contract must impose its own narrow validity window.
4. “Whitelisting the link-message shape” is dangerous. If this means returning valid without a genuine passkey owner signature, anyone could satisfy Monerium's ownership check for the Safe.
5. A Vortex-triggerable redemption, even to a pinned bank account, gives Vortex power to dispose of user assets and changes the legal custody analysis.
6. A refund IBAN can be closed, reassigned, or cease belonging to the user.
7. Replay protection needs more than timestamp parsing: chain, Safe, Monerium profile, order identity, exact amount, currency, canonical IBAN, and prior-use state must be bound.

#### Required resolution

The recommended v1 resolution is to remove automatic EIP-1271 redemption and use:

- the user's passkey owner; plus
- an independent, user-controlled recovery owner;
- an owner-authorized Monerium redeem order when recovery is required.

If automated redemption remains, write a separate protocol specification covering:

- the exact fallback-handler composition;
- signature byte schema;
- message reconstruction and hash equality;
- canonical amount, timestamp, currency, and IBAN encoding;
- replay state;
- caller independence;
- passkey validation for the address-link message;
- interaction with ERC-4337 and CoW domains;
- legal treatment of Vortex's unilateral redemption authority.

#### Questions for the author

- Is `RecoveryValidatorModule` intended to be a module, fallback handler, owner, or ERC-7579 validator?
- How does it obtain the original message bytes from the ERC-1271 call?
- Who or what produces the `signature` bytes for a policy-authorized redemption?
- Does the link message still require a genuine passkey assertion?

### F06 — Router address plus selector allowlisting is insufficient

**Priority:** P0  
**Affected PRD sections:** §5.2, §7.4, I1, I2, I3, I7, I9

#### Concern

A selector does not constrain the semantic fields inside calldata. Uniswap `exactInput`, for example, still contains:

- arbitrary token path;
- recipient;
- amount in;
- minimum output;
- deadline.

Aggregator entry points can contain arbitrary nested calls. A malicious router may also exploit unrelated token or Permit2 allowances previously created by the Safe owner. Post-conditions over EURe and USDC do not prove that no other approved asset was taken.

The current I1 statement is therefore stronger than what the described implementation enforces.

#### Required resolution

For each supported route, use an immutable, router-specific adapter or have the module construct calldata internally. Enforce:

- exact router address;
- `value == 0`;
- `operation == CALL`;
- exact token path `EURe V2 → EURC → USDC`;
- exact `amountIn`;
- recipient equal to the Safe during an atomic swap-and-forward flow;
- router-level `amountOutMinimum >= module minOut`;
- a short deadline or execution-validity rule;
- successful return from every `execTransactionFromModule` call;
- safe ERC-20 handling for missing/false return values;
- exact allowance reset;
- expected balance changes and final transfer success.

Scope the guarantee to EURe and USDC in a dedicated Safe. State explicitly that unrelated assets or approvals introduced by the user are outside the guarantee unless independently protected.

Governance should allow **immediate route revocation** but require delay for additions or authority expansion. Waiting seven days to remove a compromised router is unacceptable.

#### Questions for the author

- Will route calldata be constructed by the module, decoded by the module, or trusted from the keeper?
- How are aggregators with arbitrary executor calldata intended to satisfy I1?
- Is the Safe contractually/product-restricted to this flow only?

### F07 — CoW is not replaceable behind the synchronous router interface

**Priority:** P0  
**Affected PRD sections:** §7.4, §8.2

#### Concern

ComposableCoW is a persistent order-authorization system followed by asynchronous settlement. It uses EIP-1271 through an extensible fallback handler and introduces a different lifecycle:

- conditional-order authorization;
- watchtower discovery;
- order generation;
- solver execution;
- settlement-time signature verification;
- allowance and receiver constraints;
- expiry, cancellation, replay, and possibly partial fills.

It does not execute inside one `swapAndForward` call where the module can synchronously snapshot balances, call a router, reset approval, verify deltas, and forward output.

#### Required resolution

Remove CoW from the claim that all future routes fit the same interface and invariants. Treat it as a separate v2 architecture with its own threat model and fallback-handler composition.

That v2 specification must cover:

- exact sell token and maximum amount;
- exact buy token and receiver;
- oracle-derived minimum buy amount;
- order validity and replay domain;
- partial fills;
- cancellation and migration;
- settlement allowance;
- fallback-handler coexistence with ERC-4337 and recovery;
- output attribution to fiat deposits.

#### Questions for the author

- Is CoW intended as a synchronous router, a standing order, or a recurring conditional order?
- How would the current post-swap balance-delta invariant be preserved across asynchronous settlement?

### F08 — A permanent IBAN is not a one-shot Vortex ramp

**Priority:** P0  
**Affected PRD sections:** §5.2, §6.1, §11

#### Concern

The proposed IBAN can receive deposits repeatedly for years. Vortex's existing ramp model represents one quote and one transaction that recursively reaches a terminal `complete` or `failed` phase.

Reusing that state machine creates unresolved questions:

- What reopens a completed ramp?
- How are two rapid deposits represented?
- Which output belongs to which bank deposit if balances are batched?
- How are duplicate Monerium webhooks handled?
- What is the status of the account when one deposit succeeds and another is held for compliance?
- How are historical fees and execution rates represented?

The current phase processor also documents a non-atomic multi-instance lock and retry-exhaustion gap. A persistent, repeatedly funded Safe should not rely on those semantics without database-enforced serialization.

#### Required resolution

Introduce separate persistent models:

```text
MoneriumAccount
  profileId
  iban
  safeAddress
  currentConfigVersion
  onboarding/compliance/account status

FiatDeposit
  moneriumOrderId
  amount/currency
  payment status
  mint tx hash + log index + block
  compliance status

ConversionExecution
  safeAddress
  included deposit IDs
  EURe input
  USDC gross output
  fee
  USDC net output
  destination
  execution tx/status/error
```

Use unique Monerium order IDs and `(chainId, txHash, logIndex)` as idempotency keys. Serialize execution by Safe using an atomic database lock or queue. If deposits are batched, define an auditable allocation and rounding rule.

#### Questions for the author

- Is the Vortex public API expected to expose one ramp forever or one transaction per deposit?
- Are deposits converted independently or batched?
- What webhook/status object does a partner subscribe to for recurring deposits?

### F09 — Oracle math and the economic bound are underspecified

**Priority:** P1  
**Affected PRD sections:** §7.2, §8.3, §11

#### Concern

The formula mixes human-readable and raw token/feed units. For raw values with:

- EURe: 18 decimals;
- Chainlink EUR/USD: expected 8 decimals, but must be queried;
- USDC: 6 decimals;

the scale denominator is `10^(18 + feedDecimals - 6)`, which is `10^20` for an 8-decimal feed. The written `10^(-12)` is understandable only if the rate is already a unitless human value, which Solidity will not receive.

The bound also assumes one USDC equals one USD. EUR/USD does not directly price either EURe market basis or USDC/USD basis. Chainlink deviation threshold is not a complete bound on either stablecoin.

FX feeds also have market-hours/weekend behavior while the AMM is continuously tradable.

#### Required resolution

Specify executable pseudocode including:

- reading `decimals()`;
- `answer > 0`;
- `updatedAt != 0`;
- maximum age and weekend policy;
- round validity checks appropriate to the chosen feed contract;
- `mulDiv` ordering and overflow safety;
- whether minimum output rounds down;
- use or rejection of a USDC/USD feed;
- behavior during EURe or USDC depeg;
- a maximum oracle age that is an immutable safety ceiling, even if an operational value can be lowered.

Rewrite the loss statement as:

> The swap cannot deliver less than the configured percentage of the accepted oracle-model value, assuming the oracle is honest and both token contracts behave as modeled.

Do not call that a bound on principal under oracle or stablecoin failure.

#### Questions for the author

- Is USDC/USD explicitly assumed to be 1.0?
- What happens from Friday FX close through Monday updates?
- What exact proxy address, feed decimals, heartbeat, and failure policy will be pinned?

### F10 — The fee proposal contradicts the invariants

**Priority:** P1  
**Affected PRD sections:** §3.3, I1, §8.3, §9, Q1

#### Concern

I1 says USDC can move only to the user's destination. §9 proposes sending an in-module fee to a Vortex treasury. That adds another permitted recipient and changes:

- custody language;
- user net-output calculation;
- minimum-output calculation;
- balance-delta post-conditions;
- worst-case Vortex extraction;
- event and accounting requirements.

The module cannot be finalized while fee behavior remains open.

#### Required resolution

Choose before contract design:

1. zero fee/loss-leader for v1;
2. off-chain subscription or billing;
3. immutable on-chain `feeBps`, immutable treasury, immutable maximum fee, and exact calculation from swap output.

If option 3 is chosen, update I1 and §8.3 and distinguish the disclosed fee from slippage and malicious extraction.

#### Questions for the author

- Is the fee assessed per deposit, per batch, or per execution?
- Who pays when multiple small deposits are batched?
- Can the fee or treasury ever change, and under whose authorization?

### F11 — Passkey-only self-rescue depends on Vortex's domain and services

**Priority:** P1  
**Affected PRD sections:** §5.3, §11, Q3

#### Concern

WebAuthn credentials are scoped to a relying-party ID. A community recovery site on an unrelated domain cannot invoke a passkey registered for Vortex's RP ID.

Self-rescue also requires:

- access to the relevant RP domain/origin;
- a recoverable or discoverable credential;
- credential metadata where needed;
- a transaction builder that knows the Safe/passkey signature format;
- an RPC provider;
- ETH or a Vortex-independent bundler/paymaster/relayer.

Cloud synchronization is not guaranteed for every credential, device, policy, or authenticator. Safe's own guidance recommends combining passkeys with other authentication methods.

#### Required resolution

Make an independent, user-controlled recovery owner mandatory for v1, such as a second passkey under an independent RP, a hardware wallet, or a carefully audited user-controlled recovery scheme.

Publish and test a disaster-recovery package that can:

- reconstruct the account from public chain data;
- invoke the user's credential under the correct RP ID;
- build a direct Safe transaction without Vortex's API;
- fund gas without Vortex's paymaster;
- disable the module, change destination, or redeem EURe.

Document domain-control continuity if Vortex ceases operation.

#### Questions for the author

- What RP ID will be used?
- Are credentials required to be discoverable and backup-eligible?
- How does recovery work if Vortex loses its domain or backend database?
- Why is recovery optional if permanent self-custody is a core claim?

### F12 — The liquidity cap is based on a snapshot, not a durable bound

**Priority:** P1  
**Affected PRD sections:** §2.1, §7.3, §7.4, §12

#### Concern

Pool TVL is not equivalent to executable depth within 100 bps. Concentrated liquidity can move out of range, providers can withdraw, and routing can change between measurements.

“Successive executions spaced over time” is keeper policy, not an on-chain invariant. A compromised keeper or permissionless caller can submit multiple cap-sized transactions in rapid succession. Even honest executions may not recover liquidity merely because time passed.

The quoted 10k and 50k results are also not reproducible without block numbers, quote parameters, gas/fee treatment, route, quote expiry, and provider response.

#### Required resolution

- Record a reproducible liquidity-assessment methodology and block number.
- Treat `minOut` as the safety condition and the size cap as an availability parameter.
- Monitor executable on-chain quotes and active liquidity continuously.
- Define launch and pause thresholds.
- If pacing is a requirement, enforce an aggregate per-Safe or global rate limit on-chain; otherwise describe pacing as best-effort only.
- Do not raise caps solely from TVL.

#### Questions for the author

- What exact evidence produced “~zero impact” and “~3.6% impact”?
- Is the cap intended to protect price, liveness, platform exposure, or all three?
- What automatically pauses execution when the pool migrates or liquidity disappears?

### F13 — Webhook, reorg, concurrency, and attribution rules are incomplete

**Priority:** P1  
**Affected PRD sections:** §5.2, §6.1, §11, §14.9

#### Concern

“Webhook plus on-chain watcher” is a trigger strategy, not an idempotency or reconciliation design.

Missing requirements include:

- Monerium HMAC verification over raw request bytes;
- timestamp/replay-window validation;
- constant-time signature comparison;
- persisted webhook-ID deduplication;
- returning `200` promptly and processing asynchronously;
- event ordering and out-of-order updates;
- canonical-chain confirmation policy;
- reorg reconciliation using block hash and log identity;
- unique keeper nonce management across instances;
- serialization of concurrent executions for one Safe;
- stale private-relay transaction replacement;
- allocation of one batched output across several fiat deposits;
- reconciliation between Monerium order amount and actual minted amount;
- notification correction if an event is later reorged or reversed operationally.

#### Required resolution

Add an operational state and idempotency specification. On-chain balance should be the execution safety source, while Monerium issue-order IDs should be the accounting identity source.

Use a database-enforced per-Safe execution lock. Contract-level reentrancy protection does not serialize separate transactions from multiple keeper processes.

#### Questions for the author

- How many confirmations are required before conversion and before notification?
- Can two deposits be intentionally combined into one swap?
- How are fees and output allocated when that happens?
- What prevents two keeper instances from racing the same Safe balance?

### F14 — Immutable modules need an incident and migration path

**Priority:** P1  
**Affected PRD sections:** §3.3, §7.4, I5, §11, §12

#### Concern

Immutability prevents Vortex from introducing a malicious upgrade, but it also prevents patching a discovered module bug. Users with lost passkeys may continue receiving future deposits into an account whose automation is disabled or vulnerable.

The registry can halt routes but cannot repair module logic. Moving an IBAN to a new Safe reintroduces F01 and requires an explicit user-authorization model.

#### Required resolution

Define before launch:

- immediate route-disable authority;
- how Monerium deposits are paused or rejected during an incident;
- how users are notified before sending more EUR;
- module version discovery;
- owner-authorized migration to a new module/Safe;
- whether the existing IBAN can move only with the old Safe's signature;
- treatment of users who lost all recovery methods;
- sunset and support duration for old versions.

#### Questions for the author

- What happens after a critical module vulnerability is discovered at 02:00 UTC?
- Can Monerium suspend an individual IBAN immediately?
- How is a safe migration reconciled with the “one signature ever” promise?

### F15 — Compliance and data-protection architecture is incomplete

**Priority:** P1  
**Affected PRD sections:** §5.1, §6.1, §10, Q6, Q7

#### Concern

The whitelabel flow makes Vortex responsible for handling or orchestrating sensitive identity, banking, and wallet data. The PRD does not define:

- personal-only versus corporate scope;
- KYC sharing versus KYC reliance prerequisites;
- controller/processor roles and DPA terms;
- retention and deletion rules;
- encryption and access control for IBAN/profile data;
- log redaction and support tooling;
- sanctions and destination screening;
- periodic re-screening of a static destination;
- profile suspension, re-KYC, or closure behavior;
- SEPA recall/fraud claim allocation after EURe has been swapped and forwarded;
- legacy profile migration consent;
- source-of-funds and expected-volume monitoring;
- travel-rule and third-party destination consequences.

#### Required resolution

For v1, strongly consider personal, newly onboarded users only. Add a data-flow diagram and retention/access table. Obtain explicit MSA answers for recalls, fraud, compliance holds, profile suspension, IBAN changes, and losses after immediate conversion.

Do not present the legal non-custody or MiCA conclusion as established until counsel has assessed both on-chain module authority and Monerium control-plane authority.

#### Questions for the author

- Is corporate onboarding genuinely in v1 scope?
- Who bears loss if a SEPA transfer is later recalled or alleged fraudulent?
- Can Vortex continue converting while a profile is under review or suspended?
- Who screens and re-screens the destination?

### F16 — Dust, gas griefing, and destination edge cases break the automatic promise

**Priority:** P1  
**Affected PRD sections:** §3, §5.1, §5.2, §7.3, §9, §11

#### Concern

The headline says any EUR wired to the IBAN is automatically converted and forwarded. The €25 minimum means a smaller transfer may remain indefinitely as EURe. Mainnet gas can also make €25 uneconomical.

A user can create recurring keeper costs by sending many small transfers. Vortex cannot prevent transfers to an already issued IBAN, so API-side rate limiting is insufficient.

Destination risks include:

- zero/burn/token/router/module addresses;
- wrong chain despite a valid EVM address;
- a contract with no method to recover received ERC-20s;
- exchange minimum-deposit thresholds;
- exchange address rotation or closure;
- destination sanctions/blacklisting after onboarding;
- destination equal to the Safe, where forwarding is redundant;
- loss of access to the destination despite continued automatic transfers.

#### Required resolution

- State a minimum deposit and maximum processing delay in user-facing terms.
- Define whether dust is refunded, accumulated, or held indefinitely.
- Make the operational threshold responsive to gas while retaining an immutable safety ceiling/floor where necessary.
- Batch deposits deliberately and disclose batching latency.
- Define destination validation and denylist rules.
- Warn that Vortex cannot prove recoverability of arbitrary contracts or exchange deposits.
- Monitor destination blacklist/sanctions state and define what happens to future deposits.

#### Questions for the author

- Who pays gas when fees are below execution cost?
- What happens to a €1 deposit if no further transfer arrives?
- What happens if the destination exchange raises its minimum deposit above the user's normal amount?

### F17 — Failure-mode statements need correction and sharper scope

**Priority:** P2  
**Affected PRD sections:** §5.2, §8.5, §11

#### Concern

Several statements should be corrected or qualified:

1. If swap and USDC forwarding are one atomic transaction, a Circle-blacklisted destination should make the final transfer revert and roll back the swap. Newly acquired USDC should not remain in the Safe from that execution.
2. “Vortex can censor, not execute” is inaccurate if Vortex controls a module capable of causing swap and transfer. The intended distinction is that Vortex can execute only the constrained policy.
3. “Cannot withhold” conflicts with acknowledged keeper censorship, registry route removal, and possible Monerium control-plane changes. Prefer “cannot redirect already-minted assets outside the enumerated policy under stated assumptions.”
4. “Maximum extractable value is 1.15%” is relative to the oracle model, excludes fees, stablecoin basis, provisioning, Monerium authority, other Safe assets/allowances, and oracle failure.
5. Passkeys may be synced; they are not universally cloud-synced by default.
6. Mainnet EIP-7951 is already live as of this PRD date; the spike should benchmark the exact chosen Safe/passkey implementation rather than treat post-Fusaka support as hypothetical.

#### Required resolution

Replace absolute language with a matrix of guarantees and assumptions. Every user-facing security claim should specify:

- asset and lifecycle stage;
- trusted dependencies;
- authorized Vortex actions;
- excluded compromise classes;
- liveness versus theft protection;
- recovery requirements.

### F18 — v1 combines too many overlapping extension mechanisms

**Priority:** P2  
**Affected PRD sections:** §6, §7.4, §8.4, §12

#### Concern

The proposed v1/v2 path requires engineers and auditors to reason simultaneously about:

- Safe owner signatures;
- WebAuthn encoding and P-256 verification;
- ERC-4337 module/fallback behavior;
- a custom swap module;
- a router registry and timelock;
- a custom recovery EIP-1271 policy;
- potentially an extensible fallback handler;
- potentially ComposableCoW;
- a custom account factory;
- a persistent off-chain state machine.

Much of the underlying problem is intrinsically complex, but the proposed expression adds avoidable cross-product complexity. In particular, recovery, ERC-4337, and CoW all touch Safe extension/fallback behavior, while the generic registry attempts to make materially different execution models look interchangeable.

#### Required resolution

Apply design sacrifice to v1:

- one exact Safe deployment path;
- one passkey owner plus one independent recovery owner;
- one per-Safe swap module topology;
- one hard-coded Uniswap adapter;
- no generic aggregator calldata;
- no CoW;
- no automatic redeem validator;
- no mutable fee until finalized;
- one persistent-account/deposit/execution data model.

Add complexity only after a concrete operational need and a new threat model justify it.

## 6. Proposed reduced v1 architecture

This is a strawman for discussion, not a final specification.

### 6.1 Scope

- Personal profiles only.
- Newly onboarded users only; legacy migration deferred.
- Ethereum mainnet only.
- EURe V2 → EURC → USDC through one Uniswap v3 route.
- One destination configured at onboarding.
- Explicit minimum deposit and processing SLA.
- No automated offramp/redeem.
- No CoW or generic aggregators.

### 6.2 Monerium prerequisite

Do not proceed unless Monerium provides an enforceable mechanism under which the IBAN association cannot be moved and no alternative mint destination can be added or selected without authorization from the currently linked Safe.

If that is unavailable, preserve the product but change the security claim to acknowledge Vortex trust before mint.

### 6.3 Safe

- Pin exact canonical Safe contracts and runtime hashes.
- Passkey signer as one owner.
- Independent user-controlled recovery owner from launch.
- Threshold/recovery structure explicitly documented.
- Canonical Safe deployment components preferred over a custom factory unless atomic custom deployment is demonstrably necessary.
- Publish a configuration manifest and verifier.

### 6.4 Swap policy

- One per-Safe immutable module clone.
- Module constructs Uniswap calldata internally.
- Permissionless trigger if timing-grief analysis accepts it; otherwise a narrowly authorized keeper with a liveness fallback.
- `CALL` only, `value == 0`.
- Exact EURe approval, exact path, Safe recipient, module-derived `minOut`, short deadline.
- Atomic swap, approval reset, output check, fee calculation if any, and final transfer.
- Immediate route disable; no new route types in v1.

### 6.5 Pricing

- Exact Chainlink feed address and decimal handling.
- Explicit USDC/USD assumption or second feed.
- Immutable maximum staleness and maximum slippage.
- Weekend policy.
- Reproducible rounding and overflow behavior.

### 6.6 Backend

- Persistent `MoneriumAccount`.
- One `FiatDeposit` per Monerium issue order.
- One `ConversionExecution` per swap or intentional batch.
- Atomic per-Safe job serialization.
- HMAC-verified, deduplicated Monerium webhooks.
- On-chain watcher as reconciliation and trigger backup.
- Explicit reorg/finality policy.

### 6.7 Recovery and migration

- User or independent recovery owner signs any Safe exit or Monerium redeem order.
- No Vortex-only EIP-1271 redemption bypass.
- Public, tested disaster-recovery tooling.
- Immediate account/route pause and user notification during incidents.
- Owner-authorized module or account migration.

### 6.8 Fees

Prefer zero fee or off-chain billing for the first pilot. If an on-chain fee is required, finalize it before audit and include its immutable recipient and maximum in the signed configuration and contract invariants.

## 7. Required acceptance gates

The design should not advance from architecture review until all of the following are complete:

- [ ] Monerium confirms IBAN/address reassociation authorization and memo-routing controls in writing and sandbox.
- [ ] The trust model is split by lifecycle stage and compromise class.
- [ ] One concrete module topology and storage layout is selected.
- [ ] The onboarding signature model honestly addresses configuration and destination consent.
- [ ] Recovery is redesigned or removed from v1.
- [ ] Router calldata is constructed or fully semantically validated on-chain.
- [ ] CoW is removed from the same-interface claim or specified separately.
- [ ] The backend uses persistent accounts plus per-deposit/per-execution records.
- [ ] Oracle pseudocode, decimals, staleness, weekend behavior, and rounding are finalized.
- [ ] Fee behavior is finalized and added to invariants.
- [ ] A Vortex-independent user recovery path is demonstrated.
- [ ] Liquidity measurements are reproducible and continuously monitored.
- [ ] Webhook, reorg, concurrency, and idempotency behavior is specified.
- [ ] Incident pause, module migration, and IBAN migration procedures are documented.
- [ ] Legal, compliance, privacy, sanctions, and payment-reversal responsibilities are signed off.
- [ ] User-facing minimums, timing, rate basis, fees, and failure behavior are drafted.
- [ ] Exact dependency versions, addresses, runtime hashes, and audit artifacts are pinned.

## 8. Requested author response

Please respond by copying this table and filling in the final two columns.

| ID | Disposition (`Accept`, `Reject`, `Modify`, `Needs validation`) | Author response / proposed PRD change |
|---|---|---|
| F01 |  |  |
| F02 |  |  |
| F03 |  |  |
| F04 |  |  |
| F05 |  |  |
| F06 |  |  |
| F07 |  |  |
| F08 |  |  |
| F09 |  |  |
| F10 |  |  |
| F11 |  |  |
| F12 |  |  |
| F13 |  |  |
| F14 |  |  |
| F15 |  |  |
| F16 |  |  |
| F17 |  |  |
| F18 |  |  |

The most important requested answer is not whether each mechanism can be implemented individually. It is whether the revised composition supports a precise, end-to-end security statement that remains true under every authority Vortex actually holds.

## 9. Primary references

- [Monerium Whitelabel documentation](https://docs.monerium.com/whitelabel/)
- [Safe smart-account modules](https://docs.safe.global/advanced/smart-account-modules)
- [Safe fallback handlers](https://docs.safe.global/advanced/smart-account-fallback-handler)
- [Safe and ERC-4337](https://docs.safe.global/advanced/erc-4337/4337-safe)
- [Safe and passkeys](https://docs.safe.global/advanced/passkeys/passkeys-safe)
- [Safe passkey signer guidance](https://docs.safe.global/sdk/signers/passkeys)
- [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/)
- [EIP-7951 P-256 precompile](https://eips.ethereum.org/EIPS/eip-7951)
- [Ethereum Fusaka overview](https://ethereum.org/roadmap/fusaka/)
- [Chainlink Ethereum EUR/USD feed](https://data.chain.link/feeds/ethereum/mainnet/eur-usd)
- [ComposableCoW architecture](https://cowswap.mintlify.app/composable-cow/architecture)
- [Vortex state-machine security specification](../security-spec/03-ramp-engine/state-machine.md)
- [Historical Vortex Monerium security specification](../security-spec/05-integrations/monerium.md)
