# XCM Transfers

## What This Does

XCM moves assets between Pendulum, Moonbeam, and AssetHub for the cataloged
BRL/AssetHub recovery flows. Public BRL↔AssetHub quote creation is currently
disabled, but the flows remain cataloged so persisted ramps have deterministic
transaction preparation and executors. The former Hydration topology is not
cataloged or registered.

**Block phases:**
- `phases/blocks/phases/moonbeam-to-pendulum-xcm/` submits the presigned Moonbeam XCM and waits for a positive Pendulum token balance.
- `phases/blocks/phases/avenia-pendulum-offramp/` submits Pendulum→Moonbeam XCM, waits for the trusted Avenia wallet balance, then runs the BRLA payout.
- `phases/blocks/phases/pendulum-to-assethub-xcm/` submits the presigned Pendulum XCM and persists its hash.
- `phases/blocks/phases/assethub-offramp-source/` prepares the AssetHub→Pendulum user-wallet blueprint; `FundEphemeralExecutor` verifies its authority fields before platform-funded phases run.

Moonbeam XCM transaction intents declare `nonceSpan: 2`, preserving the next
usable Moonbeam nonce for cleanup. The AssetHub off-ramp keeps fee distribution,
Nabla, Pendulum→Moonbeam, and Pendulum cleanup in one contiguous Substrate
nonce sequence.

## Security Invariants

1. **Moonbeam→Pendulum XCM MUST rotate RPCs after an execution error** — `MoonbeamToPendulumXcmExecutor` uses `ApiManager.getApiWithShuffling("moonbeam", rampId)` after a prior phase error and raises `RecoverablePhaseError` with a 30-minute wait when all RPC options are exhausted.
2. **Moonbeam→Pendulum MUST wait for Pendulum arrival** — The executor checks the phase-owned Pendulum currency balance before submission and waits after submission. The current greater-than-zero test is an inherited completion-evidence weakness documented in `INHERITED-ISSUES.md`.
3. **Pendulum→Moonbeam MUST avoid duplicate submission when recovery evidence exists** — A persisted hash or source balance below the planned transfer suppresses a fresh submission. The balance-depletion inference is an inherited liveness risk documented in `INHERITED-ISSUES.md`.
4. **Pendulum→Moonbeam MUST verify Avenia-wallet arrival with a bounded timeout** — The executor polls for the planned BRLA amount for two minutes and raises a recoverable error on timeout.
5. **Pendulum→AssetHub MUST persist the submitted hash before advancing** — Re-entry with `pendulumToAssethubXcmHash` skips resubmission. Hash presence without source status or destination-arrival proof remains an inherited issue.
6. **Moonbeam XCM nonce consumption MUST be represented structurally** — The transaction intent declares `nonceSpan: 2`; cleanup receives Moonbeam nonce 2 without a dummy transaction.
7. **Catalog presence MUST NOT bypass BRL↔AssetHub eligibility** — Either flow may resolve for persisted recovery and flow/transaction tests, but public quote creation rejects both directions while disabled.
8. **AssetHub→Pendulum authority MUST remain with the user** — `assethubToPendulum` is a server-issued blueprint signed and broadcast by the user's AssetHub wallet. It is not accepted as an ephemeral presigned transaction; the reported hash, blueprint network, and signer must be present before platform funding.
9. **AssetHub off-ramp Pendulum nonces MUST remain contiguous** — Fee distribution, Nabla approve/swap, and Pendulum→Moonbeam use nonces 0–3; post-complete Pendulum cleanup uses nonce 4. Backup extrinsics derive from the primary blueprints and must pass Substrate call-equivalence validation.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Duplicate XCM after a crash** | Executors check destination balance, persisted hash, or source depletion before submitting. The evidence gaps are tracked in `INHERITED-ISSUES.md`. |
| **Moonbeam RPC failure** | Retry uses a shuffled Moonbeam RPC; exhaustion becomes a recoverable error with a 30-minute wait. |
| **False-positive destination balance** | Ephemerals are single-use, reducing unrelated deposits, but greater-than-zero/balance-threshold checks do not prove transfer provenance. |
| **Pendulum→AssetHub submission fails after hash persistence** | **KNOWN RISK:** current executor does not verify source success or AssetHub arrival before advancing. |
| **Nonce desynchronization** | Flow-level transaction intents allocate contiguous lanes; transaction tests pin the expected nonces. |

## Audit Checklist

- [x] Moonbeam→Pendulum retries use `getApiWithShuffling` after a prior phase error. **PASS** — `phases/blocks/phases/moonbeam-to-pendulum-xcm/execution.ts`.
- [x] Exhausted Moonbeam RPC options raise a recoverable error with a 30-minute wait. **PASS**.
- [x] Moonbeam→Pendulum waits for Pendulum token arrival after submission. **PASS**, with the inherited greater-than-zero weakness documented.
- [x] Pendulum→Moonbeam checks persisted hash/source depletion before fresh submission and waits up to two minutes for Avenia-wallet arrival. **PASS** — `phases/blocks/phases/avenia-pendulum-offramp/execution.ts`.
- [PARTIAL] Pendulum→AssetHub prevents duplicate submission when a hash exists but does not prove source success or destination arrival. **OPEN inherited issue** — `phases/blocks/phases/pendulum-to-assethub-xcm/execution.ts`.
- [x] Moonbeam preparation reserves two nonces structurally. **PASS** — flow transaction tests.
- [x] Disabled BRL↔AssetHub quote eligibility is separate from catalog resolution. **PASS**.
- [x] AssetHub→Pendulum remains a user-wallet blueprint and is rejected as an ephemeral presign. **PASS**.
- [x] No active Hydration XCM/swap executor is cataloged or registered. **PASS**.
