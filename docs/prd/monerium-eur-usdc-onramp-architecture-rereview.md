# Architecture Re-review: Quoteless EUR → USDC Onramp via Monerium

**Reviewed document:** [monerium-eur-usdc-onramp.md](./monerium-eur-usdc-onramp.md) v2.0  
**Prior review:** [monerium-eur-usdc-onramp-architecture-review.md](./monerium-eur-usdc-onramp-architecture-review.md)  
**Review date:** 2026-07-13  
**Review status:** Materially improved; five blocking design gaps remain  
**Recommended decision:** **No-go for production implementation freeze or security audit until R01–R05 are resolved in the specification.** G0 prototypes may proceed; external gates G0–G4 must still pass before launch.

## 1. Executive conclusion

Version 2 is a serious improvement. It retracts the unsafe end-to-end non-custody claim, removes the generic router, CoW, ERC-4337, and automatic redeem validator, chooses one module topology, and models the IBAN as a persistent account rather than a terminal ramp. The resulting v1 is credible and auditable in principle.

The revised composition is nevertheless not ready to implement exactly as written. The remaining blockers are narrower than in v1, but concrete:

1. the configuration manifest has no trust root independent of the provisioning system it is supposed to detect;
2. a second passkey is incorrectly treated as RP-independent recovery;
3. the delayed permissionless fallback cannot determine when an ERC-20 balance crossed the threshold from the proposed state;
4. a live-balance sweep can consume deposits that the database has not attributed, so the proposed pro-rata accounting is not yet deterministic;
5. the contract state does not contain the per-account guardian pause required by the incident, sanctions, limit, and permissionless-fallback behavior.

The core on-chain safety direction is now sound: fixed token addresses, a fixed path and router, module-constructed calldata, oracle-derived `minOut`, `CALL` only, exact approvals, delta checks, atomic fee/forwarding, and owner-authorized migration. The remaining work is mostly about making the surrounding claims and state transitions match what the system can actually enforce.

## 2. Cognitive-load assessment

The revised v1 is now mostly `🧠`: one Safe deployment path, one conversion module, one route, one fallback handler, and one persistent backend model. The largest remaining `🤯` area is the interaction among live ERC-20 balances, Monerium orders, webhook ordering, permissionless execution, compliance holds, and accounting attribution. Those facts currently live in separate sections, but correctness depends on reasoning about all of them at once. R03–R06 propose one explicit lifecycle that reduces that cross-section load.

## 3. Disposition of the original findings

| Original | Re-review status | Comment |
|---|---|---|
| F01 | **Resolved at claim level; external gate open** | S1 now admits Vortex/Monerium authority. G1 remains a genuine launch gate, not an implementation detail. |
| F02 | **Partially resolved** | The stage-based trust model is good. The manifest/verifier does not yet make provisioning fraud independently detectable; see R01. |
| F03 | **Mostly resolved** | The link signature is no longer described as configuration consent. Opaque owner-signature risk after onboarding remains under-modeled; see R08. |
| F04 | **Mostly resolved** | Singleton plus Safe-keyed configuration is coherent. Pause state and parameter governance need completion; see R05 and R10. |
| F05 | **Resolved** | The automatic redeem validator and custom fallback behavior are removed. |
| F06 | **Mostly resolved** | Internal calldata and a pinned route establish the intended swap constraint. The liveness fallback is not implementable from the specified state; see R03. |
| F07 | **Resolved** | CoW is correctly deferred to a separate design. |
| F08 | **Partially resolved** | Long-lived account/deposit/execution objects are correct. The execution-to-deposit ledger is not yet race-safe; see R04. |
| F09 | **Resolved in design; validation open** | Math, rounding direction, assumptions, and loss wording are materially improved. Feed pinning and weekend behavior correctly remain in G0. |
| F10 | **Resolved** | Fee recipient, ceiling, per-account value, and pilot behavior are structurally defined. |
| F11 | **Partially resolved** | A recovery owner is mandatory, but one allowed choice is not RP-independent; see R02. |
| F12 | **Resolved in design; validation open** | Caps are correctly treated as availability controls and executable-depth measurement is required. |
| F13 | **Partially resolved** | Webhook authentication, deduplication, reorg policy, and database locking are covered. Durable receipt and attribution races remain; see R04 and R06. |
| F14 | **Partially resolved** | Migration is credible. The specified contract does not implement the claimed per-account guardian pause; see R05. |
| F15 | **Partially resolved** | G1/G2 are appropriate. Unsolicited EURe, the operational limit, and permissionless execution during a hold need explicit treatment; see R04 and R05. |
| F16 | **Mostly resolved** | Minimums, accumulation, gas cost, and destination validation are now explicit. Full-balance USDC behavior still needs a product rule; see R09. |
| F17 | **Mostly resolved** | Most absolute wording is corrected. S4 and the final statement still need the owner-signature caveat; see R08 and R11. |
| F18 | **Resolved** | The design sacrifice was applied effectively. |

## 4. Priority summary

| ID | Priority | Finding | Blocks |
|---|---|---|---|
| R01 | P0 | The manifest verifies consistency, not honest provisioning | S0 fraud-detection claim, audit scope |
| R02 | P0 | A second passkey is not RP-independent recovery | Recovery guarantee, onboarding UX |
| R03 | P0 | The delayed permissionless fallback has no enforceable start time | Contract design, liveness claim |
| R04 | P0 | Live balance sweeps race deposit attribution | Financial accounting, API correctness |
| R05 | P0 | Per-account guardian pause and operational-limit semantics are absent | Compliance holds, incident response |
| R06 | P1 | Webhooks must be durably accepted before returning `200` | Event loss, reconciliation |
| R07 | P1 | Mutable owner configuration conflicts with continuous manifest verification | Monitoring, false incident alerts |
| R08 | P1 | Opaque passkey owner signatures are omitted from the post-mint threat model | Security statement, user compromise |
| R09 | P1 | Full-USDC sweep and unsolicited EURe lack product/accounting rules | User expectations, ledger correctness |
| R10 | P1 | Operational parameter and role invariants are incomplete | Contract auditability, liveness |
| R11 | P2 | “Always exit” remains stronger than the stated assumptions | Specification accuracy |
| R12 | P2 | The response appendix obscures the normative specification | Maintainability |

## 5. Detailed findings

### R01 — The manifest verifies consistency, not honest provisioning

**Priority:** P0  
**Affected PRD lines:** 64, 81, 130–132

#### Concern

The PRD says a hostile provisioning pipeline is detectable because an open-source verifier checks the deployed Safe against a manifest published in a repository and API. That proves only:

> deployed state == Vortex-published manifest

It does not prove:

> deployed state == independently approved Vortex policy + the user's intended destination and recovery owner

If the frontend, backend, deployment path, and manifest publisher are compromised together—the S0 scenario—the attacker can deploy a hostile Safe and publish a matching hostile manifest. A verifier operated by the same onboarding backend will report success. A repository plus API is also not necessarily append-only, independently witnessed, or resistant to equivocation between users.

#### Required resolution

Choose one honest claim and implement its prerequisites:

**Option A — independent detection:**

1. Define a canonical policy schema with allowed Safe singleton/factory/handler/module/signer code hashes, threshold rules, immutable contract coordinates, and parameter bounds.
2. Have releases signed by keys outside the provisioning path, preferably an audit/release multisig with at least one independently operated signer.
3. Publish account manifests to an append-only, externally witnessed log; prevent presenting different histories to different observers.
4. Make the verifier compare live state both to the account manifest **and** to the independently signed policy release.
5. Define how destination and recovery-owner intent enter the trust root. A Vortex-controlled page displaying Vortex-controlled data is not an independent confirmation.
6. Specify who operates the independent check and what causes onboarding to halt if the provisioning backend itself is compromised.

**Option B — narrower claim:** replace “fraud is detectable before first deposit” with “the deployed configuration is publicly auditable against a Vortex-published record.” Do not count this as a control against full provisioning compromise.

### R02 — A second passkey is not RP-independent recovery

**Priority:** P0  
**Affected PRD lines:** 43, 77–78, 96–97, 184–188, 270, 288

#### Concern

The PRD permits “a second passkey on another device” as the mandatory independent recovery owner and later describes `(EOA/hardware/second passkey)` as RP-independent. A WebAuthn credential is scoped to its RP ID. A second device protects against loss of the first device; it does not protect against loss of control of the Vortex RP domain, browser origin, or domain-continuity infrastructure.

The static recovery page also works only if it can be served from an origin accepted for the original RP ID. “Self-hostable” does not mean domain-independent.

#### Required resolution

1. Remove a same-RP passkey from the choices that satisfy the **independent** recovery requirement.
2. Require at least one RP-independent owner: hardware wallet, existing EOA, or offline recovery key.
3. A second passkey may remain as an additional convenience owner, but label it “device-redundant, RP-dependent.”
4. Threat-model the printable EOA: compromised-generation page, screenshots/cloud backup, printing, theft, inheritance, verification that the public address matches the paper secret, and rotation after suspected exposure.
5. Make the fork recovery test exercise the RP-independent owner with every Vortex service and the Vortex domain unavailable. Test the passkey/domain-continuity path separately.

The W3C WebAuthn specification states that a credential can only be used with the RP ID for which it was registered. Device diversity does not alter that scope.

### R03 — The delayed permissionless fallback has no enforceable start time

**Priority:** P0  
**Affected PRD lines:** 107–120, 136–143, 267

#### Concern

The module permits anyone to call only after the Safe's balance has exceeded `minSwapAmount` for `LIVENESS_FALLBACK_DELAY`. The proposed storage contains `initializedAt`, but no timestamp recording when a balance crossed the threshold. An ERC-20 transfer does not call the receiving Safe or module, so the module cannot observe and timestamp the crossing automatically.

`initializedAt` cannot substitute for this: after an account is older than 24 hours, every new deposit would be immediately permissionless.

#### Required resolution

Select and specify one implementable policy:

**Simplest:** make `swapAndForward` permissionless at all times. The fixed route and `minOut` already bound caller-controlled timing, but legal/compliance must accept that any observer may trigger conversion.

**Delayed fallback:** add an explicit state machine:

```text
arm(safe):
  require(balance >= minSwapAmount)
  if eligibleSince[safe] == 0: eligibleSince[safe] = block.timestamp

swapAndForward(safe):
  authorized keeper may execute immediately
  other caller requires eligibleSince != 0
  other caller requires block.timestamp >= eligibleSince + delay
  successful execution resets eligibleSince
  a balance below threshold resets it without allowing a caller to move it forward
```

Define who may arm, whether arming itself is permissionless, how cap-sized partial executions re-arm residual balances, and how threshold/parameter changes affect an existing timer. Add these transitions to invariant and fuzz tests.

### R04 — Live balance sweeps race deposit attribution

**Priority:** P0  
**Affected PRD lines:** 88–91, 140–149, 220–242

#### Concern

The database lock serializes Vortex keeper workers, but it cannot serialize external EURe transfers. Consider:

1. the worker locks the Safe and selects deposits A and B;
2. deposit C mints on-chain before the keeper transaction executes, while its webhook/indexer record is delayed;
3. the module reads the live balance and sweeps A+B+C (subject to the cap);
4. `ConversionExecution.includedDepositIds` contains only A and B;
5. the PRD allocates all output pro-rata to A and B.

The execution is safe on-chain but wrong in the accounting/API layer. The same problem occurs with direct third-party EURe transfers, delayed order-to-mint reconciliation, cap-sized partial consumption, and multiple issue orders sharing a batch. “On-chain balance is the safety source” does not by itself define accounting ownership.

#### Required resolution

Model funding and consumption as an event-sourced asset ledger:

1. Record every EURe credit as a `FundingLot` keyed by `(chainId, txHash, logIndex)`, including amount, block position, source address, and classification `monerium_issue | direct_transfer | unresolved`.
2. Link Monerium orders to funding lots when evidence becomes available; do not require webhook arrival before the on-chain event can exist.
3. Create `ConversionExecution` from the confirmed execution receipt and emitted `amountIn/usdcOut/fee`, not from the pre-submission plan.
4. Consume funding lots in one documented order—FIFO by canonical block/transaction/log position is simpler than ad hoc pro-rata—and support partial lot consumption at `perSwapCap`.
5. If a consumed lot is not yet linked to a Monerium order, place its output in an accounting suspense bucket and reconcile later. Never silently allocate it to known deposits.
6. Handle execution reorgs by reversing ledger consumption and rebuilding from canonical logs.
7. Specify whether unsolicited EURe is converted, quarantined operationally, or merely classified after unavoidable conversion.

An optional simplification is to let the keeper pass a bounded `amountIn` selected from its canonical snapshot while the module still constructs every destination/router/path field. This does not remove the need for receipt-based reconciliation, but it reduces accidental inclusion of a just-arrived deposit.

### R05 — Per-account guardian pause and operational-limit semantics are absent

**Priority:** P0  
**Affected PRD lines:** 116–120, 138–142, 175–178, 214–216, 248–262

#### Concern

The incident section says the guardian can pause globally or per account, and destination screening says a hit causes a conversion pause. The proposed storage and execution checks contain only:

- `Config.userPaused`, controlled by the Safe; and
- `globalPaused`, controlled by Vortex.

There is no guardian-controlled per-Safe pause. Reusing `userPaused` would be unsafe semantically: the guardian must not clear a user's pause, and an owner action must not accidentally clear a compliance/incident hold.

The pilot's “€1k/user/day operational limit” is also not a control as written. Vortex cannot stop an incoming SEPA payment, `perSwapCap` is proposed at €5–10k, and the permissionless fallback can execute without keeper policy. The document must say whether the limit is Monerium-enforced, contract-enforced, or merely monitored.

#### Required resolution

1. Add independent pause domains:

```solidity
Config { ...; bool userPaused; }
mapping(address safe => bool) guardianPaused;
bool globalPaused;
```

2. Require all three to be false before conversion.
3. Define role-specific transitions: Safe owners control only `userPaused`; guardian controls only `guardianPaused` and `globalPaused`.
4. Define whether guardian unpause requires a second role, delay, resolved compliance state, or multisig policy. “Unpause is safe” is true for principal routing but not necessarily for sanctions/compliance obligations.
5. Make the delayed permissionless path honor both guardian pause levels.
6. Replace the ambiguous daily limit with an enforceable rule: a Monerium account limit, an on-chain rolling conversion limit, or an explicitly labeled monitoring/hold threshold. Define behavior for excess deposits and how the user exits.
7. Define the screening window between mint and permissionless eligibility. If the design promises a compliance hold, it needs enough deterministic time to set `guardianPaused` before fallback execution.

### R06 — Webhooks must be durably accepted before returning `200`

**Priority:** P1  
**Affected PRD line:** 234

#### Concern

“Immediate `200` + async processing” is safe only if the verified event is committed durably before the response. If the API returns `200` and then crashes before persistence or queue publication, Monerium treats delivery as successful and will not retry it.

#### Required resolution

Specify the inbox transaction explicitly:

1. read raw bytes and required signature headers;
2. validate timestamp/replay window and HMAC using constant-time comparison;
3. insert `{webhookId, webhookTimestamp, rawBody, signatureVersion, receivedAt, processingStatus}` under a unique constraint;
4. commit;
5. return `200` for a committed new event or already-committed duplicate;
6. return non-2xx if verification or durable insertion fails;
7. let a retryable worker process the inbox row and retain an error/dead-letter history.

Monerium's current documentation signs `webhook-id`, `webhook-timestamp`, and the raw body and retries failed deliveries with the same ID. The PRD's desired controls match the provider; the missing point is ACK ordering.

### R07 — Mutable owner configuration conflicts with continuous manifest verification

**Priority:** P1  
**Affected PRD lines:** 123–132, 248–253

#### Concern

The owner may change `destination`, while the manifest contains the “full config” and a continuous verifier checks live state against it. After a legitimate owner change, either:

- the verifier reports a security incident forever;
- Vortex silently rewrites the manifest, weakening its historical value; or
- the owner must somehow publish an authenticated manifest revision, which is not specified.

The same issue applies to owner/module changes performed through the disaster-recovery tool.

#### Required resolution

Split immutable and mutable evidence:

- `DeploymentManifest`: immutable setup transaction, code hashes, initial owners/threshold/modules/config, signed policy release.
- `ConfigHistory`: append-only projection of canonical Safe/module events with block/log coordinates and reorg handling.
- `CurrentState`: derived from chain, with a classification of `authorized owner change`, `approved migration`, `unexpected code/state`, or `reorg pending`.

The verifier should alarm on violations of policy and unexplained state transitions, not on every difference from genesis. Define how owner-authorized changes are authenticated and how the public record preserves old versions.

### R08 — Opaque passkey owner signatures are omitted from the post-mint threat model

**Priority:** P1  
**Affected PRD lines:** 64–68, 77–82, 93–97, 280, 297

#### Concern

Appendix A correctly rejects the claim that an extra WebAuthn signature provides meaningful what-you-see-is-what-you-sign consent under a compromised frontend. The same limitation applies later: the passkey is a threshold-1 Safe owner that can disable the module, replace owners, change the destination, or transfer assets. A compromised Vortex origin can ask the user for an opaque passkey ceremony while presenting misleading UI.

That is not unilateral Vortex authority—the attacker still needs user presence/verification—but it is a material route around the module policy and should not disappear from the S2/S4 threat model.

#### Required resolution

1. Add a residual risk: a compromised approved RP origin may induce a user to authorize a malicious Safe owner transaction because the authenticator does not display decoded Ethereum intent.
2. Make routine deposit/status flows never request a passkey assertion. Reserve owner signing for a visibly separate management/recovery flow.
3. Display decoded Safe transaction data, simulation, target code identity, and before/after owners/modules/destination in at least one independently implemented confirmation surface where feasible.
4. Decide whether dangerous owner operations need the RP-independent recovery owner as a second signature. If threshold 1 is retained, state the trade-off explicitly rather than treating the module as the only post-mint path.
5. Add an assumption to the final security statement: the user has not authorized a malicious owner transaction.

### R09 — Full-USDC sweep and unsolicited EURe lack product/accounting rules

**Priority:** P1  
**Affected PRD lines:** 143–151, 196–198, 204–216, 230–242

#### Concern

The module charges the fee on `usdcDelta` but forwards the Safe's **full** remaining USDC balance. Therefore pre-existing or accidentally sent USDC is swept to `destination` without appearing in the conversion gross/net accounting. Likewise, anyone can send EURe to the public Safe; the module cannot know whether it came from the user's IBAN.

This is not necessarily a principal-safety bug—the configured destination receives the assets—but it contradicts the impression that each forwarded amount maps cleanly to Monerium deposits and can create compliance and partner-API discrepancies.

#### Required resolution

Choose explicit rules:

- Prefer forwarding exactly `usdcDelta - fee`, leaving pre-existing USDC under owner control; or state prominently that the Safe is an auto-sweeping account for **all** USDC.
- Treat direct EURe/USDC transfers as first-class ledger events, with source classification and an API representation.
- Decide whether direct EURe is supported, quarantined in accounting, or a disclosed unsupported action that may still convert because the contract cannot distinguish its provenance.
- Add tests with non-zero pre-swap USDC, direct EURe, fee-on/off, capped partial swaps, and late-arriving transfers.

### R10 — Operational parameter and role invariants are incomplete

**Priority:** P1  
**Affected PRD lines:** 111–124, 138, 173–178

#### Concern

The storage sketch does not fully define whether operational parameters and keepers are global or per Safe, who may change each value, or which directions are delayed. It also permits contradictory values unless additional invariants are intended—for example `minSwapAmount > perSwapCap`, which permanently prevents execution.

“Lowering instant, raising behind the timelock” is ambiguous because protective direction differs by parameter: lowering `perSwapCap` is protective, while lowering `minSwapAmount` causes more/smaller executions.

#### Required resolution

Define the complete setter table before audit:

| Parameter | Scope | Invariant | Instant direction | Delayed direction | Role |
|---|---|---|---|---|---|
| `minSwapAmount` | global or per Safe | `MIN_SWAP_FLOOR <= minSwapAmount <= perSwapCap` | explicitly decide | explicitly decide | guardian/timelock |
| `perSwapCap` | global or per Safe | `minSwapAmount <= perSwapCap <= CAP_CEILING` | decrease | increase | guardian/timelock |
| keeper set | global | non-empty unless permissionless-only | removal during incident | addition/rotation policy | multisig/timelock |
| fallback delay | immutable or governed | bounded range | explicitly decide | explicitly decide | constructor/timelock |

Specify pending-update cancellation, events, timelock identity, guardian rotation, lost-key response, and whether a global singleton creates an accepted all-account blast radius. Add invariant tests for every cross-parameter relationship.

### R11 — “Always exit” remains stronger than the stated assumptions

**Priority:** P2  
**Affected PRD lines:** 68, 93–97

#### Concern

S4 says the user can “always exit with assets” given an owner credential, RPC, and funded relayer. Owner control guarantees the ability to authorize and submit a Safe transaction; it does not guarantee that EURe/USDC transfers or Monerium redemption will succeed under issuer freeze, blacklist, token pause/upgrade, chain censorship, or Monerium refusal.

#### Required resolution

Change the guarantee to:

> Given a valid owner credential and transaction-submission path, the user can authorize arbitrary Safe transactions without Vortex and Vortex cannot veto them. Successful asset exit still depends on Ethereum, token contracts/issuers, and—when redeeming—Monerium.

Add token/issuer restrictions to the S4 residual column.

### R12 — The response appendix obscures the normative specification

**Priority:** P2  
**Affected PRD lines:** 274–297

#### Concern

The appendix is valuable review history, but it repeats security decisions and sometimes adds nuance not present in the normative sections. A future implementer now has to decide whether §1–§14 or Appendix A is authoritative. That is avoidable `🧠 → 🤯` load in an already cross-disciplinary specification.

#### Required resolution

After this review cycle:

1. keep the PRD normative and self-contained;
2. move the response matrix to a separate decision/review log or mark it explicitly non-normative;
3. convert every accepted nuance into the applicable normative section;
4. add a compact invariant/role/state-transition appendix generated from the final design.

## 6. Required acceptance gates for v3

Before production implementation freeze or security audit (G0 prototypes may proceed):

- [ ] R01: manifest trust root and independent-verification claim are made precise.
- [ ] R02: recovery choices guarantee at least one RP-independent owner.
- [ ] R03: permissionless-fallback state machine is implementable and tested on paper.
- [ ] R04: funding-lot and execution-consumption ledger handles late/direct/reorged transfers.
- [ ] R05: user, guardian-account, and global pause domains are represented in storage and transitions.
- [ ] R06: webhook ACK occurs only after durable inbox commit.
- [ ] R07: manifest/config history handles legitimate owner changes.
- [ ] R08: opaque passkey owner-signature risk is included in the threat model and UX.
- [ ] R09: full-USDC and direct-token behavior is an explicit product rule.
- [ ] R10: all roles, setters, bounds, and timelock directions are specified.
- [ ] R11: S4 wording describes transaction authority rather than guaranteed asset exit.
- [ ] G0–G4 remain blocking for their stated implementation/launch stages.

## 7. Requested author response

Please respond with a disposition and proposed change for each item:

| ID | Disposition (`Accept`, `Reject`, `Modify`, `Needs validation`) | Author response / proposed PRD change |
|---|---|---|
| R01 |  |  |
| R02 |  |  |
| R03 |  |  |
| R04 |  |  |
| R05 |  |  |
| R06 |  |  |
| R07 |  |  |
| R08 |  |  |
| R09 |  |  |
| R10 |  |  |
| R11 |  |  |
| R12 |  |  |

The key requested answer is now narrower than in the first review: can the team define one deterministic lifecycle from “Monerium or direct EURe credit observed” through “eligible/paused,” “on-chain execution,” “canonical receipt,” and “deposit/output ledger allocation,” while preserving an independently recoverable owner and an independently meaningful provisioning record?

## 8. Primary references checked during re-review

- [Monerium Whitelabel webhooks](https://docs.monerium.com/whitelabel/)
- [Monerium API](https://docs.monerium.com/api/)
- [Safe fallback handler](https://docs.safe.global/advanced/smart-account-fallback-handler)
- [Safe and passkeys](https://docs.safe.global/advanced/passkeys/passkeys-safe)
- [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/)
- [Uniswap v3 SwapRouter source](https://github.com/Uniswap/v3-periphery/blob/main/contracts/SwapRouter.sol)
