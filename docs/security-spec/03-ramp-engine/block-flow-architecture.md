# Versioned Block-Flow Architecture

## What This Does

The block-flow engine is the executable financial program behind a quote. A catalog
selects one flow, simulation produces phase-owned metadata, registration produces
phase-owned facts, preparation creates a transaction plan, and the phase processor
executes the persisted phase sequence.

This module defines the boundary between compile-time composition and persisted runtime
data. TypeScript adjacency checks help developers compose compatible blocks, but they do
not authenticate JSONB loaded after a deployment. Persisted identity, version dispatch,
runtime validation, and startup wiring checks therefore remain mandatory.

## Security Invariants

1. **Exactly one catalog match.** Quote resolution MUST evaluate every registered
   definition. Zero matches are an unsupported request; more than one match is an
   internal configuration error. Definition order MUST NOT select a financial route.
2. **Immutable persisted identity.** Every new quote MUST persist:
   - stable flow ID and immutable flow version;
   - catalog version;
   - ordered-topology hash;
   - global metadata, registration-facts, state, and transaction-plan schema versions;
   - the schema version for every namespaced block context.
3. **Version dispatch.** Registration, preparation, start, and recovery MUST dispatch
   using the persisted flow identity. Resolving the current catalog by request and then
   silently accepting a different identity is forbidden.
4. **Recovery support.** A flow version MUST remain registered while any nonterminal
   ramp references it. A deployment may remove a version only after a database check
   proves no pending quote or nonterminal ramp depends on it. Rollback MUST retain every
   version introduced by the deployment being rolled back.
5. **Legacy adoption.** Unversioned quotes may be adopted by the current version only
   when their request and exact block-key set match that version. Their registration
   MUST persist the adopted identity. An unversioned ramp's stored phase sequence may be
   adopted only when it exactly equals the selected version's sequence; otherwise it
   requires manual recovery.
6. **Topology binding.** The topology hash MUST cover flow ID/version, catalog version,
   ordered phases, permitted transition edges, and block schema versions. Any mismatch
   MUST stop execution before a lifecycle hook or side effect.
7. **Enumerated transitions.** Normal and exceptional edges MUST be registered per flow
   version. A handler may not jump to a phase outside those edges. The current universal
   exceptional edge is a transition from a nonterminal phase to `failed`.
8. **Unique phase instances.** A flow version MUST NOT contain a duplicate phase name.
   Repeated behavior requires a distinct phase-instance identity before it can be added.
9. **Executor bijection.** Construction and startup MUST require:
   - one executor for every execution phase;
   - executor and phase names equal at the same index;
   - no incompatible executor for the same phase;
   - no registry overwrite; and
   - a registered handler for every phase in every enabled or recovery-supported flow.
10. **Versioned runtime envelopes.** Quote metadata, registration facts, block state,
    and transaction plans MUST be object-shaped, namespaced by a context belonging to
    the persisted flow, and validated before use. Missing or unknown contexts, invalid
    schema versions, malformed phase sequences, and malformed transaction-plan maps
    MUST fail closed.
11. **Schema evolution.** A change that reinterprets a persisted field MUST increment
    its schema version and either retain its old reader or provide an explicit,
    one-directional migration. Missing fields MUST NOT silently acquire a new meaning.
12. **Namespaced ownership.** Blocks MUST read their own metadata and state by context
    key. Compatibility projection into legacy top-level `StateMetadata` or API response
    fields MUST reject conflicting destinations. New executor dependencies MUST use
    namespaced state rather than add another generic projection.
13. **Compile-time claims are limited.** TypeScript establishes block IO adjacency and
    context-key typing only. Startup checks establish catalog/registry construction.
    Runtime validation establishes persisted-data compatibility. Tests are evidence of
    these controls, not substitutes for them.
14. **Durable external-operation identity.** Every provider order, ticket, payout,
    subsidy, swap, bridge broadcast, gas payment, or settlement transfer MUST claim a
    unique `financial_operations` row before the external call. Its operation key is
    derived from scope type/ID, persisted flow ID/version, phase instance, and attempt
    class; its request hash binds the financial inputs.
15. **Outcome-aware retry.** Financial-operation status MUST distinguish
    `not_started`, `submitted`, `confirmed`, `failed`, and `unknown`. A confirmed
    result is replayed locally without another provider call. A definitive rejection
    may be retried with corrected inputs. A submitted or ambiguous result MUST halt for
    reconciliation and MUST NOT be repeated automatically.
16. **Upstream idempotency preference.** The stable operation key MUST be sent as the
    provider idempotency key when the provider supports one. When the integration does
    not expose such a facility, the local claim plus fail-closed reconciliation policy
    is mandatory; an ambiguous timeout is not a retryable error.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| A deployment changes a predicate or block order while a ramp is active | Persisted version dispatch and topology hash; retain referenced versions |
| A new corridor overlaps an existing predicate | Resolve all candidates and fail on ambiguity |
| A handler bug skips an accounting or delivery phase | Per-version transition graph rejects undeclared edges |
| A repeated phase name advances from the wrong occurrence | Duplicate phase names are rejected at construction |
| A block adds a phase without its executor | Construction and startup executor-bijection checks |
| A registry registration silently replaces another handler | Duplicate registration is rejected |
| Old or manually edited JSONB is cast into a new TypeScript type | Versioned envelope validation before registration, start, or recovery |
| Two blocks flatten different values into one legacy field | Compatibility merge rejects conflicting values |
| An old flow implementation is removed too early | Deployment/removal check against pending quotes and nonterminal ramps |
| A provider accepts an order and the database transaction later rolls back | Independent durable financial-operation claim; retry reuses the confirmed response or halts on ambiguity |
| Two workers attempt the same external side effect | Unique operation key and atomic `not_started` → `submitted` claim |
| A provider has no idempotency-key API | Unknown outcomes require reconciliation; automatic repetition is forbidden |

## Audit Checklist

- [x] Catalog resolution rejects zero and multiple matches.
- [x] New quotes persist flow identity, topology hash, and schema versions.
- [x] Registration and start verify the persisted identity rather than request-only
      current-catalog resolution.
- [x] Flow construction rejects duplicate phases and phase/executor mismatch.
- [x] The phase registry rejects overwrites and startup verifies complete coverage.
- [x] Handler overrides are checked against the persisted version's transition graph.
- [x] Runtime envelopes and exact block-key sets are checked before lifecycle hooks.
- [x] Compatibility projection rejects conflicting duplicate destinations.
- [x] Provider lifecycle hooks that create orders or tickets are declared as external
      operations and use a durable claim outside the ramp registration transaction.
- [x] Confirmed operation responses are replayed locally; ambiguous outcomes halt
      without calling the provider again.
- [ ] Current Avenia, Mykobo, and AlfredPay clients do not expose a documented
      idempotency-key parameter. Their operation keys are retained locally and the
      fail-closed reconciliation fallback applies until provider support is available.
- [ ] Block-local schemas currently validate their versioned object envelopes and exact
      ownership keys; field-by-field schemas must be added when a block changes persisted
      shape. Until then, a version bump is mandatory for any such change.
- [ ] Deployment automation must query for referenced versions before permitting their
      removal; the runtime fails closed if an unsupported version reaches it.
