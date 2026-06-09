# Client Observability

## What This Does

Backend client observability records sanitized operational events for partner-facing API activity. It is designed to help operators identify when one API client or partner integration is having problems without changing quote, ramp, authentication, or phase-processing behavior.

The observed surface includes:

- API key, public key, dual-auth, and ownership failures.
- Quote create, best-quote create, and quote retrieval.
- Ramp register, update, start, status, and error-log retrieval.
- Request correlation through `X-Request-ID` / `X-Correlation-ID` and response `X-Request-ID`.

Events are persisted in `api_client_events` and structured logs are emitted through the existing backend logger. The event table is an operational telemetry store, not a source of truth for ramp state. Ramp execution failures remain in `RampState.errorLogs`; client observability events are request-level records used for alerting and incident investigation.

Internal operators can inspect these events through `GET /v1/admin/api-client-events`, which is protected by the dedicated `Authorization: Bearer <METRICS_DASHBOARD_SECRET>` middleware. `METRICS_DASHBOARD_SECRET` must be different from `ADMIN_SECRET` to reduce blast radius.

## Security Invariants

1. **Observability MUST NOT affect API behavior** — Event persistence, structured logging, and metric hooks must be best-effort. Failures in the observability layer must not change response bodies, HTTP statuses, ramp state, quote state, or retry behavior.
2. **Events MUST be sanitized before persistence** — Only approved scalar fields may be stored. Failure events may include allowlisted request-derived scalar summaries in `metadata` (for example method, templated path shapes, selected quote/ramp IDs, selected quote inputs, query flags, array counts, and object-presence flags). Raw request bodies, raw headers, concrete path identifiers, nested metadata objects, and sensitive keys must be dropped before inserting `api_client_events` rows.
3. **Secrets MUST NOT be logged or persisted** — `X-API-Key`, bearer tokens, secret API keys, provider credentials, private keys, seeds, ephemeral private material, and signed transaction payloads must not appear in logs or observability events.
4. **Sensitive user/payment data MUST NOT be logged or persisted** — Tax IDs, PIX destinations, QR codes, KYC data, bank details, and raw payment credentials must be excluded from observability metadata.
5. **Request correlation MUST be non-secret** — `requestId`, `quoteId`, and `rampId` may be stored for debugging, but they must not be used as high-cardinality metric labels. They are correlation identifiers, not authentication material.
6. **Partner attribution MUST use safe identifiers** — Events may store `partnerId`, `partnerName`, and short API key prefixes capped at 16 characters. Full secret keys and raw auth headers are forbidden.
7. **Operational metrics MUST remain low-cardinality** — Future metric exporters must group by bounded labels such as operation, partner, status, HTTP status, and error type. They must not label by user ID, wallet address, request ID, quote ID, ramp ID, tax ID, PIX key, or free-form request values.
8. **Event persistence SHOULD have automated retention before production operational use** — Raw operational events are useful for investigation but must not be retained indefinitely without aggregation or cleanup. The backend retention worker keeps the current UTC calendar day plus the previous six full UTC calendar days and removes older `api_client_events` rows on startup and daily.
9. **Client observability access MUST go through metrics-dashboard-authenticated backend APIs** — Internal consumers must call protected backend endpoints and must not ship database credentials, Supabase service-role keys, Metabase embed secrets, or other server-only credentials to client-side code.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Observability database leak** — An attacker gains read access to `api_client_events` | Store only minimal sanitized event fields and allowlisted request summaries. Do not persist secrets, raw request bodies, tax IDs, PIX data, KYC data, or private key material. Treat the table as operationally sensitive even after redaction. |
| **API key/header capture** — Instrumentation accidentally records `X-API-Key`, bearer tokens, or raw headers | Use an allowlist-shaped event schema and denylist sensitive metadata keys before persistence. Store only short 16-character API key prefixes when explicitly safe. |
| **PII leakage through metadata** — Client-provided `additionalData` or error messages include tax IDs, PIX keys, or bank details | Do not persist nested metadata objects. Keep metadata scalar-only and sanitized. Pass only allowlisted request-derived fields to observability helpers; use counts or presence flags for arrays/objects such as presigned transactions, signing accounts, and `additionalData`. Truncate error messages and prefer stable `errorType` categories. |
| **Business flow disruption** — Database/logging outage causes quote/ramp requests to fail | Observability writes are fire-and-forget/best-effort and catch their own errors. The request path must proceed exactly as it would without observability. |
| **Missing correlation during incidents** — Operators cannot connect a partner report to backend logs | Generate or propagate `requestId` for all requests and return it via `X-Request-ID`. Persist request IDs alongside quote/ramp IDs when available. |
| **High-cardinality metric explosion** — Future observability metrics use ramp IDs or user IDs as labels | Keep high-cardinality identifiers in logs/event rows only. Export aggregate metrics using bounded labels. |
| **Unbounded telemetry retention** — Raw event rows grow indefinitely | Use the backend retention worker to delete `api_client_events` older than the 7-day UTC calendar retention window. The cleanup runs on startup and daily, uses advisory locking, and deletes in bounded batches. |
| **Internal metrics client exposure** — An internal metrics consumer is reachable by outsiders | Require the dedicated backend metrics dashboard bearer token for all event data. Do not rely on obscurity of client URLs. |
| **BI embed secret leak** — A future Metabase embed is generated in client-side code | Generate signed embed URLs only from the backend. Do not place Metabase signing secrets in publicly exposed environment variables. |

## Audit Checklist

- [ ] Verify `requestContext` assigns `requestId` and `requestStartedAt` before request logging and route handling.
- [ ] Verify `X-Request-ID` is returned on API responses and incoming `X-Request-ID` / `X-Correlation-ID` values are treated only as correlation IDs.
- [ ] Verify `api_client_events` stores only the approved fields: operation, status, HTTP status, error type/message, safe partner attribution, quote/ramp IDs, duration, and sanitized metadata.
- [ ] Verify event persistence helpers catch their own errors and cannot throw into controller or middleware responses.
- [ ] Verify auth, quote, and ramp request instrumentation does not alter existing response bodies or HTTP status codes.
- [ ] Verify failure-event metadata contains only allowlisted scalar request summaries and no `X-API-Key`, bearer tokens, raw headers, raw request bodies, tax IDs, PIX destinations, QR codes, KYC data, private keys, seeds, ephemeral secrets, or signed transaction payloads.
- [ ] Verify error messages are truncated and alerts/consumers use stable `errorType` categories rather than raw messages.
- [ ] Verify future metric exporters do not use request ID, quote ID, ramp ID, user ID, wallet address, tax ID, or PIX key as metric labels.
- [ ] Verify `GET /v1/admin/api-client-events` uses `metricsDashboardAuth` and returns only sanitized event fields.
- [ ] Verify the API client events retention worker runs on backend startup and daily, and deletes `api_client_events` older than the 7-day UTC calendar retention window in bounded batches.
