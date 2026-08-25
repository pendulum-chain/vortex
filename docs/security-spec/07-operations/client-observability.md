# Client Observability

## What This Does

Backend client observability records sanitized operational events for partner-facing API activity. It is designed to help operators identify when one API client or partner integration is having problems without changing quote, ramp, authentication, or phase-processing behavior.

The observed surface includes:

- Public/secret credential validation, credential mismatch, dual-auth, and ownership failures.
- Quote create, best-quote create, and quote retrieval.
- Ramp register, update, start, status, and error-log retrieval.
- Request correlation through `X-Request-ID` / `X-Correlation-ID` and response `X-Request-ID`.

Avenia standard-KYC and token-import controller/provider operations are not currently emitted to `api_client_events`. A sanitized `auth_dual` failure may still be emitted by authentication before the route-local KYC body parser runs. Identity payloads, raw tokens, request bodies, fingerprints, consent data, and provider details remain strictly excluded from all observability channels.

Events are persisted in `api_client_events` and structured logs are emitted through the existing backend logger. The event table is an operational telemetry store, not a source of truth for ramp state. Ramp execution failures remain in `RampState.errorLogs`; client observability events are request-level records used for alerting and incident investigation.

Internal operators can inspect these events through `GET /v1/admin/api-client-events`, which is protected by the dedicated `Authorization: Bearer <METRICS_DASHBOARD_SECRET>` middleware. `METRICS_DASHBOARD_SECRET` must be different from `ADMIN_SECRET` to reduce blast radius.

## Security Invariants

1. **Observability MUST NOT affect API behavior** — Event persistence, structured logging, and metric hooks must be best-effort. Failures in the observability layer must not change response bodies, HTTP statuses, ramp state, quote state, or retry behavior.
2. **Events MUST be sanitized before persistence** — Only approved scalar fields may be stored. Failure events may include allowlisted request-derived scalar summaries in `metadata` (for example method, templated path shapes, selected quote/ramp IDs, selected quote inputs, query flags, array counts, and object-presence flags). Raw request bodies, raw headers, concrete path identifiers, nested metadata objects, and sensitive keys must be dropped before inserting `api_client_events` rows.
3. **Secrets MUST NOT be logged or persisted** — `X-API-Key`, bearer tokens, secret API keys, provider credentials, private keys, seeds, ephemeral private material, and signed transaction payloads must not appear in logs or observability events.
4. **Sensitive user/payment data MUST NOT be logged or persisted** — Tax IDs, PIX destinations, QR codes, KYC data, bank details, and raw payment credentials must be excluded from observability metadata.
5. **Request correlation MUST be non-secret** — `requestId`, `quoteId`, and `rampId` may be stored for debugging, but they must not be used as high-cardinality metric labels. They are correlation identifiers, not authentication material.
6. **Credential and partner attribution MUST use safe identifiers** — Events may store immutable `credentialId`, credential strength, `partnerId`, `partnerName`, endpoint/operation, and short key prefixes capped at 16 characters. Full public or secret values and raw auth headers are forbidden. `partnerName` is a display/audit label only; it must not be treated as credential-pairing evidence, an authorization credential, or a runtime pricing key.
7. **Operational metrics MUST remain low-cardinality** — Future metric exporters must group by bounded labels such as operation, partner, status, HTTP status, and error type. They must not label by user ID, wallet address, request ID, quote ID, ramp ID, tax ID, PIX key, or free-form request values.
8. **Event persistence SHOULD have automated retention before production operational use** — Raw operational events are useful for investigation but must not be retained indefinitely without aggregation or cleanup. The backend retention worker keeps the current UTC calendar day plus the previous six full UTC calendar days and removes older `api_client_events` rows on startup and daily.
9. **Client observability access MUST go through metrics-dashboard-authenticated backend APIs** — Internal consumers must call protected backend endpoints and must not ship database credentials, Supabase service-role keys, Metabase embed secrets, or other server-only credentials to client-side code.
10. **Credential mismatch MUST be observable without exposing values** — `CREDENTIAL_MISMATCH` events may identify the request, endpoint, and safe credential IDs/prefixes, but must not persist either full key value or combine the mismatched contexts into one authoritative subject.
11. **Startup credential failures MUST be operationally visible but fail closed** — missing schema elements, constraints, indexes, or a remaining legacy credential table must be logged without key values; observability failure must not allow the server to listen.
12. **Public `ramp-info` telemetry MUST remain sanitized** — events may record operation, outcome, credential ID/strength, safe prefix, duration, and HTTP status. They must not include the response projection, KYC details, profile selectors, provider identifiers, or exact limits.
13. **KYC token-import telemetry MUST exclude token material** — Token-import and standard-KYC controller/provider operations do not currently emit `api_client_events`; sanitized `auth_dual` failures may be emitted before KYC body parsing. `importToken`, the request body, token fingerprints, consent payloads, identity payloads, provider request/response details, and free-form provider errors MUST NOT enter `api_client_events`, structured logs, traces, Sentry, metrics, or support exports. Any future instrumentation may record only bounded operation/outcome data, HTTP status, duration, request ID, safe authenticated credential attribution, and stable public error classifications.
14. **Standard KYC provider logging MUST omit identity payloads** — Level 1 names, birth dates, tax IDs, emails, addresses, document IDs, selfie IDs, request bodies, and provider errors that may echo those values MUST NOT enter logs, traces, Sentry, metrics, or support exports. The Avenia client may log only endpoint/method context and a fixed sensitive-payload omission marker, and thrown provider errors must contain a fixed sanitized response body.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Observability database leak** — An attacker gains read access to `api_client_events` | Store only minimal sanitized event fields and allowlisted request summaries. Do not persist secrets, raw request bodies, tax IDs, PIX data, KYC data, or private key material. Treat the table as operationally sensitive even after redaction. |
| **API key/header capture** — Instrumentation accidentally records `X-API-Key`, `X-Public-Key`, bearer tokens, or raw headers | Use an allowlist-shaped event schema and denylist sensitive metadata keys before persistence. Store only immutable credential IDs and short 16-character prefixes when explicitly safe. |
| **PII leakage through metadata** — Client-provided `additionalData` or error messages include tax IDs, PIX keys, or bank details | Do not persist nested metadata objects. Keep metadata scalar-only and sanitized. Pass only allowlisted request-derived fields to observability helpers; use counts or presence flags for arrays/objects such as presigned transactions, signing accounts, and `additionalData`. Truncate error messages and prefer stable `errorType` categories. |
| **Business flow disruption** — Database/logging outage causes quote/ramp requests to fail | Observability writes are fire-and-forget/best-effort and catch their own errors. The request path must proceed exactly as it would without observability. |
| **Missing correlation during incidents** — Operators cannot connect a partner report to backend logs | Generate or propagate `requestId` for all requests and return it via `X-Request-ID`. Persist request IDs alongside quote/ramp IDs when available. |
| **Misread partner attribution** — Operators interpret a display `partnerName` as proof of partner ownership or pricing authority. | Observability labels are non-authoritative. Authorization comes from `partner_id`/`user_id` ownership checks, and pricing attribution comes from quote-time `pricing_partner_id` when present. |
| **High-cardinality metric explosion** — Future observability metrics use ramp IDs or user IDs as labels | Keep high-cardinality identifiers in logs/event rows only. Export aggregate metrics using bounded labels. |
| **Unbounded telemetry retention** — Raw event rows grow indefinitely | Use the backend retention worker to delete `api_client_events` older than the 7-day UTC calendar retention window. The cleanup runs on startup and daily, uses advisory locking, and deletes in bounded batches. |
| **Internal metrics client exposure** — An internal metrics consumer is reachable by outsiders | Require the dedicated backend metrics dashboard bearer token for all event data. Do not rely on obscurity of client URLs. |
| **BI embed secret leak** — A future Metabase embed is generated in client-side code | Generate signed embed URLs only from the backend. Do not place Metabase signing secrets in publicly exposed environment variables. |
| **Mismatch logs leak two credentials** — Error instrumentation records both full presented halves | Emit `CREDENTIAL_MISMATCH` with safe IDs/prefixes only and never attach raw headers or request bodies. |
| **Public eligibility telemetry becomes a shadow profile store** — `ramp-info` events persist KYC state or provider details | Record only request outcome metadata; keep the response and all identity/provider details out of events. |
| **KYC share token captured by telemetry** — Generic request summarization stores `importToken`, consent data, a token fingerprint, or a provider error containing request configuration | Token-import controller/provider operations do not currently emit API client events. Authentication may emit a sanitized `auth_dual` failure before body parsing. The shared sanitizer still excludes sensitive fields, raw bodies and nested metadata are forbidden, provider errors are sanitized, and any future instrumentation may observe only stable bounded outcome classifications. |
| **Standard KYC identity echoed into logs** — Request debugging or an Avenia validation error captures names, tax IDs, addresses, document identifiers, or other submitted identity data | Standard Level 1 submission uses sensitive-body mode, which omits the request payload and replaces provider response/error details with fixed text before the error reaches callers or logging. |

## Audit Checklist

- [ ] Verify `requestContext` assigns `requestId` and `requestStartedAt` before request logging and route handling.
- [ ] Verify `X-Request-ID` is returned on API responses and incoming `X-Request-ID` / `X-Correlation-ID` values are treated only as correlation IDs.
- [ ] Verify `api_client_events` stores only the approved fields: operation, status, HTTP status, error type/message, safe partner attribution, quote/ramp IDs, duration, and sanitized metadata.
- [ ] Verify partner attribution fields in events are used only for debugging/display, not authorization, pricing, or payout decisions.
- [ ] Verify event persistence helpers catch their own errors and cannot throw into controller or middleware responses.
- [ ] Verify auth, quote, and ramp request instrumentation does not alter existing response bodies or HTTP status codes.
- [ ] Verify failure-event metadata contains only allowlisted scalar request summaries and no `X-API-Key`, bearer tokens, raw headers, raw request bodies, tax IDs, PIX destinations, QR codes, KYC data, private keys, seeds, ephemeral secrets, or signed transaction payloads.
- [ ] Verify error messages are truncated and alerts/consumers use stable `errorType` categories rather than raw messages.
- [ ] Verify future metric exporters do not use request ID, quote ID, ramp ID, user ID, wallet address, tax ID, or PIX key as metric labels.
- [ ] Verify `GET /v1/admin/api-client-events` uses `metricsDashboardAuth` and returns only sanitized event fields.
- [ ] Verify the API client events retention worker runs on backend startup and daily, and deletes `api_client_events` older than the 7-day UTC calendar retention window in bounded batches.
- [ ] Verify credential events use immutable credential ID/strength and safe prefixes without full `X-Public-Key` or `X-API-Key` values.
- [ ] Verify `CREDENTIAL_MISMATCH` records no mixed authoritative subject and no presented key values.
- [ ] Verify future `ramp-info` events omit KYC projection data, exact limits, profile selectors, and provider identifiers.
- [x] Verify token-import and standard-KYC controller/provider operations are not emitted to `api_client_events`. **PASS** — neither controller emits client events; sanitized `auth_dual` failures can be emitted before body parsing, the shared sanitizer excludes `importToken`, and tests assert the raw value is absent from sanitized client-event output.
- [ ] Verify production logs, Sentry, traces, metrics, and support exports contain no raw Sumsub token, token fingerprint, provider request configuration, or token-import body.
- [x] Verify shared Avenia standard-KYC request and error logging contains no submitted identity values. **PASS** — the client uses sensitive-body mode and tests assert a sentinel is absent from every logger level and thrown-error representation.
