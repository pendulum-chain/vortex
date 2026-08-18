# XCM Transfers

## What This Does

The catalog retains historical XCM definitions between Pendulum, Moonbeam, and
AssetHub so persisted BRL/AssetHub records remain decodable. Because Moonbeam is
unavailable, these definitions are not an automatic recovery path: quote
registration and ramp start return unavailable, and the phase processor holds
Moonbeam-dependent state before invoking an executor. The former Hydration
topology is not cataloged or registered.

**Dormant block phases (compatibility only):**
- `phases/blocks/phases/moonbeam-to-pendulum-xcm/` submits the presigned Moonbeam XCM, waits for source finalization, persists the finalized block hash, and waits for the phase-owned output amount on Pendulum.
- `phases/blocks/phases/avenia-pendulum-offramp/` submits Pendulum→Moonbeam XCM, waits for the trusted Avenia wallet balance, then runs the BRLA payout.
- `phases/blocks/phases/pendulum-to-assethub-xcm/` submits the presigned Pendulum XCM and persists its hash.
- `phases/blocks/phases/assethub-offramp-source/` prepares the AssetHub→Pendulum user-wallet blueprint; `FundEphemeralExecutor` verifies its authority fields before platform-funded phases run.

Historical Moonbeam XCM transaction intents declare `nonceSpan: 2`, preserving
the stored transaction plan and its following cleanup nonce. These structural
definitions MUST NOT be treated as permission to prepare, submit, or recover the
flow while the runtime guard is active.

## Security Invariants

1. **Moonbeam-dependent flows MUST remain runtime-disabled** — Registration and start fail before network/provider work, and phase processing returns before lock acquisition or handler execution. Re-enablement requires the RISK-020 exit criteria.
2. **Dormant Moonbeam→Pendulum evidence rules MUST remain documented** — If re-enabled, the executor rotates RPCs after errors and waits for the planned Pendulum amount rather than unrelated dust. These rules are preserved for review, not executed recovery.
3. **Dormant Pendulum→Moonbeam evidence rules MUST remain documented** — If re-enabled, persisted-hash/source-depletion inference and bounded Avenia arrival polling require reconciliation under RISK-009.
4. **Pendulum→AssetHub retains a dormant evidence exception** — Re-entry trusts an internally persisted finalized source block and does not prove AssetHub arrival. Destination receipt/balance-delta evidence and durable ambiguous-broadcast recovery are release blockers before re-enabling execution.
5. **Moonbeam XCM nonce consumption MUST remain represented structurally** — The historical transaction intent declares `nonceSpan: 2`; keeping it prevents persisted transaction-plan drift.
6. **Catalog presence MUST NOT bypass runtime retirement** — Both flows may resolve for persisted decoding and flow/transaction tests, but quote registration, start, and phase processing block automatic execution.
7. **AssetHub→Pendulum authority definitions MUST remain intact** — The dormant `assethubToPendulum` transaction remains a user-wallet blueprint rather than an ephemeral presign, preserving historical validation semantics.
8. **Historical AssetHub off-ramp Pendulum nonces MUST remain contiguous** — Fee distribution, Nabla approve/swap, and Pendulum→Moonbeam use nonces 0–3; post-complete Pendulum cleanup uses nonce 4.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Accidental Moonbeam execution after retirement** | Registration/start reject Moonbeam-dependent ramps and phase processing returns before lock/handler execution. Regression tests cover direct Moonbeam and internally Moonbeam-dependent flow IDs. |
| **Historical XCM left nonterminal** | Persisted flow identities and transaction plans are retained for inspection/manual reconciliation rather than being terminalized or deleted; residual-fund risk is deferred under RISK-020. |
| **False-positive Moonbeam→Pendulum destination balance** | The exact phase-owned `outputAmountRaw` is required instead of a positive-balance test. Ephemeral single-use further reduces unrelated deposits, although balance still does not cryptographically prove provenance. |
| **Pendulum→AssetHub submission fails after hash persistence** | **KNOWN RISK:** current executor does not verify source success or AssetHub arrival before advancing. |
| **Nonce desynchronization** | Flow-level transaction intents allocate contiguous lanes; transaction tests pin the expected nonces. |

## Audit Checklist

- [x] Moonbeam-dependent registration, start, and phase execution are guarded before network access. **PASS**.
- [x] Dormant executor and transaction definitions remain cataloged for persisted decoding/history compatibility. **PASS**.
- [ ] Pendulum→AssetHub does not prove AssetHub arrival on re-entry. **DEFERRED RISK RISK-009** — this is a release blocker before re-enabling execution or automatic recovery.
- [x] Historical Moonbeam preparation reserves two nonces structurally. **PASS** — flow transaction tests.
- [x] AssetHub→Pendulum remains a user-wallet blueprint and is rejected as an ephemeral presign. **PASS**.
- [x] No active Hydration XCM/swap executor is cataloged or registered. **PASS**.
