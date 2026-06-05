# Backend Client Observability Implementation Plan

## Context

We want backend-side observability for Vortex partner/API-client issues before adding alerts and dashboards. The immediate goal is to record reliable metrics and structured logs for partner-facing API flows without changing existing quote/ramp behavior.

Primary flows to observe:

- Quote creation and retrieval
- Ramp register
- Ramp update
- Ramp start
- Ramp status
- Ramp error log retrieval
- Auth/config failures around these flows

The monitoring should help answer:

- Which partner/API client is having issues?
- Which operation is failing?
- Is the issue auth/config, validation, expired quote, missing presigned transactions, backend error, or async ramp execution?
- Is this isolated to one partner or global?
- Which request IDs, quote IDs, and ramp IDs can be used for debugging?

## Core Design Principle

Observability must run alongside existing flows and must not affect business behavior.

Rules:

1. Do not change controller/service response bodies.
2. Do not change HTTP statuses.
3. Do not introduce retries or new side effects in quote/ramp flows.
4. Do not block API responses on metric/log persistence.
5. Do not allow observability failures to throw into request handling.
6. Do not log secrets or sensitive user/payment/KYC data.

All observability writes must be best-effort. If persistence fails, the API request should continue exactly as it does today.

## Persistence Decision

### Recommendation

Use an append-only database table for persistent operational events, plus existing Winston logs for detailed application logging. Do not use Supabase Storage as the primary metrics store.

### Why not only in-memory metrics?

In-memory counters reset on server restart and are not enough if we want historical partner health, later dashboarding, or investigation across deployments. They are still useful for Prometheus-style scraping later, but they should not be the only source of partner health history.

### Supabase Storage bucket option

Supabase Storage is better for raw archive files, such as daily NDJSON log exports. It is not ideal as the primary backend monitoring store because:

- querying by partner, operation, status, and time window is awkward
- alert/dashboard queries require downloading/parsing files or secondary indexing
- concurrent append patterns are less natural than database inserts
- retention and aggregation become custom jobs

Storage can be added later as a cold archive, but not as the main operational source.

### Extra table option

An append-only table is better for this phase because:

- it survives restarts
- it supports per-partner dashboard queries
- it supports alert queries over time windows
- it is easy to join conceptually with partner/quote/ramp identifiers
- it can be indexed by `createdAt`, `partnerId`, `operation`, `status`, and `errorType`

### Important caveat

Do not write one table row for every noisy low-value event forever without retention. Start with partner-facing operations only, and add retention/aggregation before traffic grows significantly.

Recommended initial retention:

- raw operational events: 30-90 days
- later aggregated daily/hourly summaries: longer retention if needed

## Proposed Data Model

Create a new Sequelize model and migration for an append-only table, tentatively named `ApiClientEvent`.

Suggested table: `api_client_events`

Fields:

```text
id UUID primary key
request_id string nullable/indexed
operation string indexed
status string indexed                 # success | failure
http_status integer nullable indexed
error_type string nullable indexed
error_message string nullable          # sanitized, short message only
partner_id UUID nullable indexed
partner_name string nullable indexed
api_key_prefix string nullable indexed # never secret key value
user_id UUID nullable indexed
quote_id UUID nullable indexed
ramp_id UUID nullable indexed
ramp_type string nullable
network string nullable
payment_method string nullable
duration_ms integer nullable
metadata jsonb nullable                # sanitized low-volume details only
created_at timestamp indexed
updated_at timestamp
```

Notes:

- `quote_id` and `ramp_id` are acceptable in the table, but should not be metric labels.
- `error_message` must be sanitized and short. Prefer stable `error_type` for dashboards.
- `metadata` must never contain request bodies, raw headers, tax IDs, PIX keys, QR codes, KYC data, API secrets, or ephemeral secrets.
- Use partner name/ID and API key prefix only for attribution.

## Metrics Shape

Persistent events support historical querying. In addition, expose or prepare metric-style counters/histograms through a small abstraction so a Prometheus/Grafana or Datadog integration can be added later.

Metric names to prepare:

```text
vortex_api_client_requests_total{operation,partner,status,http_status,error_type}
vortex_api_client_request_duration_seconds{operation,partner,status}
vortex_api_auth_failures_total{route,auth_error_type,partner}
vortex_ramp_operation_failures_total{partner,operation,error_type}
```

Metric label rules:

- OK: partner slug/name/id, operation, status, HTTP status, error type, environment
- Not OK: ramp ID, quote ID, user ID, wallet address, tax ID, PIX key, request ID

High-cardinality identifiers belong in structured logs and the persistent event table, not labels.

## Structured Logging Shape

Use the existing backend logger. Add one structured warning/error log for failed partner-facing operations and optionally one compact info log for successful operations.

Failure log shape:

```ts
logger.warn("Partner API operation failed", {
  requestId,
  operation,
  partnerId,
  partnerName,
  apiKeyPrefix,
  userId,
  quoteId,
  rampId,
  httpStatus,
  errorType,
  errorMessage,
  durationMs
});
```

Success log shape:

```ts
logger.info("Partner API operation completed", {
  requestId,
  operation,
  partnerId,
  partnerName,
  apiKeyPrefix,
  userId,
  quoteId,
  rampId,
  durationMs
});
```

Logging guidance:

- Always log failures.
- Success logs can be sampled or omitted later if volume is too high.
- Never log raw request bodies or headers.
- Never log API secret keys, KYC data, PIX data, QR codes, tax IDs, or ephemeral secret material.

## Error Classification

Add a helper that maps known errors into stable `error_type` values. Dashboards and alerts should use these stable categories instead of raw error messages.

Initial categories:

```text
none
validation_error
auth_missing_api_key
auth_invalid_api_key
auth_invalid_public_key
auth_partner_mismatch
auth_inactive_partner
ownership_denied
quote_not_found
quote_expired
quote_consumed
invalid_ephemerals
invalid_presigned_transactions
missing_presigned_transactions
time_window_exceeded
ramp_not_found
ramp_not_updatable
ramp_not_in_initial_state
service_unavailable
provider_error
internal_error
unknown_error
```

Classification should be conservative. If unsure, classify as `unknown_error` or `internal_error` rather than parsing sensitive details.

## Proposed Module Layout

Add a small observability module under the API app:

```text
apps/api/src/api/observability/
  requestContext.ts
  apiClientEvents.model.ts        # or place model under apps/api/src/models/
  apiClientEvent.service.ts
  metrics.ts
  operationLogger.ts
  errorClassifier.ts
  types.ts
```

Preferred model location should follow existing repo patterns. Since existing Sequelize models live in `apps/api/src/models`, the actual model should likely be:

```text
apps/api/src/models/apiClientEvent.model.ts
```

and exported from:

```text
apps/api/src/models/index.ts
```

Responsibilities:

- `requestContext.ts`: generate/propagate request ID and timing context.
- `apiClientEvent.service.ts`: best-effort event persistence.
- `metrics.ts`: safe counters/histogram helpers or placeholders for future exporter integration.
- `operationLogger.ts`: structured success/failure logs.
- `errorClassifier.ts`: stable error category mapping.
- `types.ts`: shared operation/status/event types.

Every public observability function should catch and swallow its own failures after logging a local debug/warn message if appropriate.

## Request Context Middleware

Add middleware early in Express setup to:

- read an incoming request/correlation ID header if present
- generate a request ID if absent
- attach it to `req`
- add `X-Request-ID` to the response
- record `startedAt` for duration calculation

Candidate headers to accept:

```text
X-Request-ID
X-Correlation-ID
```

If both exist, prefer `X-Request-ID`.

The middleware must not require any new client behavior.

## Instrumentation Points

### Auth/config failures

Instrument auth-related failure branches in:

- `apps/api/src/api/middlewares/apiKeyAuth.ts`
- `apps/api/src/api/middlewares/publicKeyAuth.ts`
- `apps/api/src/api/middlewares/dualAuth.ts`
- `apps/api/src/api/middlewares/ownershipAuth.ts`

Record events for:

- missing API key
- invalid API key format
- invalid API key
- invalid public key
- partner mismatch
- inactive/expired key if distinguishable
- ownership denied

These events may not have quote/ramp context yet. Use route, partner if known, key prefix if safe, and request ID.

### Quote controller

Instrument:

- `createQuote`
- `createBestQuote`
- `getQuote`

Relevant files:

- `apps/api/src/api/controllers/quote.controller.ts`
- `apps/api/src/api/services/quote/index.ts`
- quote finalization/persistence service where `QuoteTicket` is created

Capture:

- operation
- partner ID/name if known
- public API key or prefix if already stored as safe public key
- quote ID on success
- ramp type
- network
- payment method
- duration
- status/error type

### Ramp controller/service

Instrument:

- `registerRamp`
- `updateRamp`
- `startRamp`
- `getRampStatus`
- `getRampErrors`

Relevant files:

- `apps/api/src/api/controllers/ramp.controller.ts`
- `apps/api/src/api/services/ramp/ramp.service.ts`

Capture:

- operation
- partner ID/name from authenticated request if available
- partner ID/name via `RampState -> QuoteTicket` or `QuoteTicket` after records are loaded
- quote ID
- ramp ID
- ramp type if available
- network/payment method if available
- duration
- status/error type

Do not alter existing service behavior. Add observation around existing success/catch paths only.

### Async phase execution

Do not mix async phase execution failures with synchronous partner API call failures in the first pass.

Existing phase errors are already stored in `RampState.errorLogs`. Later, phase failures can emit their own separate events such as:

```text
operation = ramp_phase_execution
phase = nablaSwap | performBrlaPayout | ...
```

For this initial plan, focus on partner-facing request operations.

## Event Recording Pattern

Use a best-effort helper instead of direct model writes in controllers.

Example shape:

```ts
await recordApiClientEventSafe({
  requestId,
  operation: "ramp_start",
  status: "failure",
  httpStatus,
  errorType,
  partnerId,
  partnerName,
  quoteId,
  rampId,
  durationMs
});
```

The helper must internally catch errors:

```ts
export async function recordApiClientEventSafe(event: ApiClientEventInput): Promise<void> {
  try {
    await ApiClientEvent.create(sanitizeEvent(event));
  } catch (error) {
    logger.warn("Failed to record API client event", { error: error instanceof Error ? error.message : String(error) });
  }
}
```

If we are concerned about adding DB write latency to the request path, make the helper fire-and-forget:

```ts
void recordApiClientEventSafe(event);
```

Preferred initial approach:

- use fire-and-forget persistence for event rows
- make observability failures impossible to surface to clients
- keep event payload small

Tradeoff: fire-and-forget can lose events if the process exits immediately. That is acceptable for non-critical observability and safer than blocking ramp flows.

## Migration and Model Plan

1. Add Sequelize migration for `api_client_events`.
2. Add `ApiClientEvent` model.
3. Export model from `apps/api/src/models/index.ts`.
4. Add indexes:
   - `created_at`
   - `partner_id, created_at`
   - `partner_name, created_at`
   - `operation, created_at`
   - `status, created_at`
   - `error_type, created_at`
   - `request_id`
   - `quote_id`
   - `ramp_id`
5. Consider retention cleanup in a later migration/worker, not in the first implementation unless there is an existing cleanup pattern that makes it trivial.

## Rollout Steps

### Step 1: Foundation

- Add request context middleware.
- Add request ID response header.
- Add observability types, error classifier, event service, and structured logging helper.
- Add model/migration for `api_client_events`.

Verification:

- Existing API tests pass.
- Manual request receives `X-Request-ID`.
- No response body/status changes.

### Step 2: Auth events

- Instrument auth/config failure branches.
- Record persistent events and structured logs for failures only.

Verification:

- Existing auth failures still return the same status/body.
- Event rows are created for invalid/missing keys.
- No secret key is logged or stored.

### Step 3: Quote events

- Instrument quote create/best/get success and failure.
- Persist compact events.
- Log failures.

Verification:

- Existing quote behavior unchanged.
- Success/failure rows include operation, partner when known, quote ID on success, duration.

### Step 4: Ramp request events

- Instrument ramp register/update/start/status/errors success and failure.
- Enrich partner attribution from `QuoteTicket`/`RampState` where available.

Verification:

- Existing ramp behavior unchanged.
- Event rows include ramp/quote IDs where available.
- Expected error categories are stable.

### Step 5: Metric abstraction

- Add safe metric helper functions mirroring event writes.
- Keep implementation simple initially: either no-op counters plus persistent events, or in-process counters if a metrics endpoint already exists.
- Do not block on full Prometheus/Grafana setup in this phase.

Verification:

- Metric helper calls cannot throw.
- Label values are low-cardinality.

### Step 6: Follow-up foundation for alerts/dashboard

- Add simple query helpers for partner health if needed.
- Example queries:
  - failures by partner/operation over last 15 minutes
  - zero success despite traffic
  - top error types by partner over last 24 hours
  - recent failed ramp IDs for partner

This step can be done just before implementing alerts/dashboard.

## Testing Plan

Add focused tests where practical:

- `errorClassifier` maps known errors/statuses to stable categories.
- `sanitizeEvent` removes or rejects sensitive fields.
- `recordApiClientEventSafe` swallows persistence errors.
- request context middleware sets request ID and response header.

Regression checks:

- Existing quote tests pass.
- Existing ramp tests pass.
- Existing auth tests pass, if present.
- `bun lint:fix`
- `bun typecheck`
- `bun build:backend`

Follow repo guidance:

- Always use `bun`.
- Run `bun lint:fix` after code changes.
- If shared package changes are made, run `bun build:shared` first. This plan should avoid shared changes unless necessary.

## Privacy and Safety Checklist

Before merging implementation, verify:

- No `secretKey` or `X-API-Key` values are stored/logged.
- No raw request headers are stored/logged.
- No raw request bodies are stored/logged.
- No tax IDs are stored/logged.
- No PIX keys/destinations are stored/logged.
- No QR codes/payment payloads are stored/logged.
- No KYC data is stored/logged.
- No ephemeral private keys or signed transaction payloads are stored/logged.
- Metrics labels do not include request ID, quote ID, ramp ID, user ID, wallet addresses, or any free-form user data.
- Observability write failures cannot affect API responses.

## Open Questions for Implementation Time

Resolve these by reading current code before editing:

1. Exact migration naming/date convention in `apps/api/src/database/migrations`.
2. Whether a `/metrics` endpoint or Prometheus client already exists.
3. Exact Express request type augmentation pattern in this repo.
4. Existing tests around quote/ramp controllers and whether event persistence should be mocked.
5. Whether success events should be recorded for all operations initially, or only failures plus aggregate counters.

Default answer for item 5: record both success and failure for partner-facing operations initially, because the dashboard needs denominators. If volume becomes an issue, add retention/aggregation rather than removing success visibility prematurely.

## Success Criteria

The implementation is complete when:

- Partner-facing quote/ramp/auth operations create persistent sanitized operational events.
- Failures create structured logs with request ID, operation, partner attribution when available, stable error type, and duration.
- Existing API behavior is unchanged.
- Event persistence failures are swallowed and cannot break quote/ramp flows.
- Sensitive fields are not stored or logged.
- The resulting table can answer per-partner failure-rate and recent-failure queries needed for future alerts/dashboard work.
