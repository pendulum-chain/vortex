---
applyTo: "apps/api/**/*.ts,apps/api/**/*.sql"
---

# API and payment-engine review instructions

- Validate request bodies, query values, headers, webhook payloads, database JSON, and provider responses at runtime before property access or string/array methods. A TypeScript annotation does not validate external data.
- Derive authentication and authorization from trusted middleware state. Check profile, customer-entity, credential, partner, and resource ownership independently; never authorize from a client-supplied identifier alone.
- Treat read-then-write limits, uniqueness checks, allocation, revocation, and state transitions as concurrency-sensitive. Require a database constraint, transaction/lock, compare-and-set, or other atomic guarantee when parallel requests can violate the invariant.
- Keep monetary values as decimal strings, `Big`, or integer raw units. Never use binary `number` arithmetic for amounts, fees, limits, rates, or percentages that influence behavior. Apply token precision and rounding once at an explicit boundary.
- For ramp phases, workers, and webhooks, verify idempotency across retries, crashes, duplicate delivery, and concurrent execution. Persist or reconcile external operation identifiers and transaction receipts before repeating a side effect.
- Check BUY and SELL, direct/same-chain and cross-chain routes, all supported currencies and destination networks, legacy in-flight records, and failure/recovery paths affected by a routing or flow-version change.
- For provider integrations, verify timeouts, retry classification, fallback order, provider-status normalization, sanitized logging, and partial or malformed responses. An outage must not silently become success or switch to an invalid corridor.
- Remember that pending Sequelize migrations run automatically at API startup. Review backward compatibility with old application instances and staged rollout order; irreversible drops require an independently enforceable gate or a later deployment.
- Review dates and reporting boundaries with explicit timezone and inclusive/exclusive semantics. Use the event timestamp named by the business rule, not a nearby creation/update timestamp.
- Production reconciliation and migration scripts need the same scrutiny as services: safe parsing, dry-run or fail-closed behavior, bounded retries, secret/PII handling, atomic output, and focused tests for destructive decisions.
- Cross-check changed API behavior against the relevant OpenAPI source, partner guide, integration skill, and security specification. Generated declarations alone are not the source of truth.
