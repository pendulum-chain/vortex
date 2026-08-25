# Proposal: Avenia Sumsub Token Import for Individual KYC

Status: implemented and enabled in code on this branch. Production readiness remains blocked on
provider and environment confirmations, legal and consent review, and sandbox validation. Vendor
contract checked against public Avenia and Sumsub documentation on 2026-08-14.

Decision: add an API-only alternative to Avenia's normal individual KYC flow. The caller supplies
a Sumsub applicant share token that it generated outside Vortex. Vortex imports the token into
the caller's or managed child's existing Avenia subaccount, binds the resulting Avenia KYC
attempt, and trusts only Avenia's final decision.

This proposal is limited to individual KYC. Business verification is out of scope.

## Summary

The provider sequence is:

```text
Create or reuse an INDIVIDUAL Avenia subaccount
    -> caller generates a Sumsub share token outside Vortex
    -> Vortex imports the token into that Avenia subaccount
    -> Avenia creates a KYC attempt
    -> Vortex polls that exact attempt
    -> Avenia approves or rejects the imported verification
```

The token replaces document collection, liveness, and normal KYC submission. It does not
replace Avenia subaccount creation because Avenia requires a target `subAccountId` and Vortex
requires a canonical CPF ownership mapping for BRL operations.

Vortex does not have a Sumsub entity in this iteration. It does not hold Sumsub credentials,
generate share tokens, call Sumsub APIs, or receive Sumsub webhooks. The caller owns the source
Sumsub applicant and is responsible for generating a token bound to Avenia's configured Sumsub
recipient.

## Goals

- Let an active managed-profile manager import individual KYC for a directly managed child.
- Let a direct authenticated profile import its own individual KYC.
- Preserve the existing Vortex profile, customer-entity, provider-customer, and KYC-case
  ownership model.
- Make normal Avenia KYC and Sumsub token import mutually exclusive verification methods.
- Keep the token out of storage, logs, telemetry, URLs, and provider error details.
- Bind local state to the exact Avenia attempt returned by token import.
- Make one-time-token submission safe under retries, concurrency, timeouts, and local write
  failures.

## Non-goals

- Creating a Sumsub account or client for Vortex.
- Accepting or storing caller Sumsub API credentials.
- Generating a Sumsub share token on behalf of a caller.
- Calling Sumsub's applicant-reuse API directly.
- Receiving or reconciling Sumsub webhooks.
- Supporting company verification.
- Adding Dashboard, Widget, or shared XState-machine UI in this iteration.
- Allowing a managed child's own credential to import a token.
- Replacing Avenia as the final compliance decision-maker.

## Avenia Contract

### 1. Create the target subaccount

Avenia creates an individual subaccount with:

```http
POST /v2/account/sub-accounts
Content-Type: application/json

{
  "accountType": "INDIVIDUAL",
  "name": "Jane Doe"
}
```

Response:

```json
{
  "id": "<avenia-subaccount-id>"
}
```

Avenia subaccounts are permanent and cannot be deleted. Vortex already wraps this operation in
`POST /v1/brla/createSubaccount`, validates the requested type, associates the CPF and effective
customer entity, and persists the resulting provider customer.

Subaccount creation alone does not select a KYC verification method. The caller may choose the
normal flow or token import after the subaccount exists.

### 2. Caller generates the token

The caller uses its own Sumsub client and credentials:

```http
POST https://api.sumsub.com/resources/accessTokens/shareToken

{
  "applicantId": "<caller-owned-approved-applicant>",
  "forClientId": "<avenia-recipient-client-id>",
  "ttlInSecs": 600
}
```

The source applicant must be an active approved individual with Sumsub `GREEN` review. Sumsub
documents share tokens as recipient-bound, short-lived, opaque, invalidated after use, and up to
1 KiB. The caller sends the resulting token to Vortex; Vortex does not participate in token
generation. For a Brazilian applicant, the caller must populate that applicant's CPF in Sumsub's
TIN field before generating the token; the share-token request has no separate CPF field.

Avenia does not publish the required recipient `forClientId`. Avenia must provide the sandbox
and production values during feature enablement, and Vortex must publish the applicable value to
approved integrators. Callers cannot choose a different recipient through the Vortex request.

### 3. Import the token

Avenia's exact documented operation is:

```http
POST /v2/kyc/import-token/?subAccountId=<avenia-subaccount-id>
Content-Type: application/json

{
  "importToken": "<sumsub-applicant-share-token>"
}
```

The trailing slash after `import-token` is required.

Response:

```json
{
  "id": "<avenia-kyc-attempt-id>",
  "message": "token imported successfully: processing KYC"
}
```

The response `id` is an Avenia KYC-attempt ID. Avenia explicitly states that HTTP `200` means
the token was imported and an attempt was created; it does not mean that the user was approved.

### 4. Observe Avenia's decision

Avenia emits:

| Event | Status | Result |
|---|---|---|
| `KYC-STARTED` | `PENDING` | `null` |
| `KYC-PROCESSING` | `PROCESSING` | `null` |
| `KYC-COMPLETED` | `COMPLETED` | `APPROVED` or `REJECTED` |

The attempt is also available through:

```http
GET /v2/kyc/attempts/{attemptId}?subAccountId=<avenia-subaccount-id>
```

The imported attempt's documented level name is `sumsub-token-{client-id}`. Vortex polls the
exact returned attempt ID. It does not infer the result from Sumsub approval, token acceptance,
the first item in an attempt list, or a client event.

Canonical mapping remains:

| Avenia state | Vortex state |
|---|---|
| `PENDING` | `pending` |
| `PROCESSING` | `in_review` |
| `COMPLETED + APPROVED` | `approved` |
| `COMPLETED + REJECTED` | `rejected` |
| `EXPIRED` | `pending` and non-approved pending reconciliation; external `EXPIRED` retained |

### Provider prerequisites

- Avenia must enable the `SumsubSharedClient` flag; otherwise import returns `401`.
- The receiving account or subaccount must be `INDIVIDUAL`.
- The source Sumsub applicant must have `GREEN` review.
- The token must be valid, unexpired, unused, and issued for the configured recipient.
- The source Sumsub client and Avenia must have the required sharing relationship.

### Required imported data

Avenia reads document-extracted Sumsub `Info` first and falls back to user-entered `FixedInfo`.
Every imported individual requires:

- full name;
- date of birth;
- country associated with the tax identifier;
- an approved Sumsub review;
- at least one `ID_CARD`, `PASSPORT`, `DRIVERS`, or `RESIDENCE_PERMIT` document.

Brazilian individuals must have CPF in Sumsub's TIN field; Avenia explicitly does not derive it
from the document number. For other countries Avenia resolves tax identity from TIN, document
`number`, then document `additionalNumber`. Avenia may also import email and address fields.

The CPF imported by Avenia must agree with the canonical CPF under which Vortex created the
provider customer. Supplying the correct CPF in Sumsub is the caller's responsibility under
RISK-021. Avenia's duplicate-tax-ID and compliance checks remain authoritative; Vortex rejects a
later provider response that exposes an identity mismatch, but currently accepts provider approval
when Avenia omits the tax ID needed for that comparison.

### Provider errors

| HTTP | Message | Meaning |
|---|---|---|
| `401` | no documented body | `SumsubSharedClient` is not enabled |
| `400` | `importToken endpoint is only available for INDIVIDUAL users` | Target account has the wrong type |
| `400` | invalid `importToken` field | Token is empty |
| `400` | `token is not valid or already used` | Sumsub rejected or could not authenticate the token |
| `400` | `can only import one token per user` | Sumsub returned a conflict |
| `400` | `another token is currently being processed` | A prior import workflow remains active |

Asynchronous rejection reasons include an unapproved or non-individual applicant, missing
identity fields or documents, missing tax identity, duplicate tax ID, and Avenia compliance or
Brazilian fraud rejection. The attempt includes `retryable`, but Avenia does not document when a
new token may be submitted after an asynchronous rejection.

### Provider contract gaps

- The import page does not explicitly confirm signed API-key authentication for this endpoint.
- Avenia does not publish its sandbox or production recipient `forClientId`.
- Avenia does not define whether `can only import one token per user` means one lifetime import,
  one active import, or one successful import.
- Avenia does not document whether every synchronous failure proves the token was unconsumed.
- Avenia does not explicitly prohibit a standard KYC attempt and token-import attempt from
  coexisting.

The last point is addressed by a stronger Vortex invariant rather than delegated to Avenia.

## Verification Method Invariant

Each individual Avenia KYC case has one immutable verification method:

```text
unselected -> standard
unselected -> sumsub_share_token
```

There is no transition between `standard` and `sumsub_share_token`.

The method is selected before the first provider-side KYC side effect:

- Creating the first normal identity, selfie, or liveness document selects `standard`.
- Creating a normal API or Web SDK attempt selects `standard`.
- Durably claiming token import selects `sumsub_share_token` before Avenia receives the token.
- Entering data in a client form or creating the Avenia subaccount does not select a method.

Once `standard` is selected, token import returns `409` and never calls Avenia. Once
`sumsub_share_token` is selected, normal document creation, liveness creation, API submission,
and Web SDK initiation return `409` and never call Avenia.

Rejection, expiration, timeout, managed-profile deletion, or corridor-policy changes do not
permit method switching. A retry may occur only within the selected method and only when Avenia
allows it. An ambiguous token-import result remains locked to `sumsub_share_token` because the
one-time token may already have been consumed.

Migration 066 classifies every Avenia `kyc` case that exists when the migration runs as
`standard` directly from the case's provider and type, including rows without a provider-customer join. Cases created later remain nullable until
their first method claim. A runtime status read locks a nullable case and selects `standard`; it
does not infer a method or bind an attempt from provider document or attempt history.
Clients intending to import a token must therefore complete the import before any status read.
The migration is forward-only once verification state exists: rollback takes an exclusive case-table
lock and refuses to remove the columns while any method or submission JSON remains.

## User Story 1: Managed Profile

1. An enabled manager creates an `individual` managed profile through the existing managed
   profile API.
2. The manager creates or reuses the child's Avenia subaccount through
   `POST /v1/brla/createSubaccount` with `X-Managed-Profile-Id`.
3. The manager verifies the same individual in its own Sumsub environment and generates an
   Avenia-recipient-bound share token outside Vortex.
4. The manager calls the Vortex import endpoint with the same managed-profile selector.
5. Vortex verifies the active manager, direct active relationship, BR corridor, immutable
   individual type, active child entity, and child-owned Avenia provider customer.
6. Vortex imports the token, persists the Avenia attempt, and returns accepted/pending.
7. The manager reads the result through existing delegated KYC or onboarding-status reads.

Only the controlling manager may import for a managed child. A child-owned credential cannot
invoke this operation even though child credentials can authenticate other child-owned routes.

## User Story 2: Direct Profile

1. An authenticated non-managed profile creates or reuses its own individual Avenia subaccount.
2. The profile controls an approved individual in its own Sumsub environment and generates an
   Avenia-recipient-bound share token outside Vortex.
3. The profile calls the same import endpoint without `X-Managed-Profile-Id`.
4. Vortex resolves the profile's active individual entity and owned Avenia provider customer.
5. Vortex imports the token, persists the exact attempt, and returns accepted/pending.
6. The profile reads the final result through existing KYC or onboarding-status reads.

Direct profiles may authenticate with their Supabase session or profile-bound secret API key.
Public keys and ownerless partner credentials are insufficient.

## Vortex API Contract

```http
POST /v1/brla/kyc/import-token
Authorization: Bearer <supabase-session>
X-API-Key: <profile-bound-secret-key>
X-Managed-Profile-Id: <managed-child-profile-id, managed story only>
Idempotency-Key: <caller-generated-stable-key>
Content-Type: application/json

{
  "importToken": "<opaque-sumsub-share-token>",
  "consentAttested": true
}
```

The caller sends one authentication mechanism. `X-Managed-Profile-Id` is present only when the
controlling manager acts for a child.

Accepted response:

```http
HTTP/1.1 202 Accepted
```

```json
{
  "attemptId": "<avenia-kyc-attempt-id>",
  "status": "pending"
}
```

After `202`, clients poll aggregate onboarding status or `GET /v1/brla/getKycStatus` with an owned
`taxId`. The returned `attemptId` is correlation data, not a public status-poll input.

The operation does not accept CPF, `subAccountId`, Sumsub applicant ID, customer-entity ID, or
provider-customer ID. It derives the target from the authenticated effective profile and
requires exactly one eligible active individual Avenia provider customer. Missing or ambiguous
provider setup returns a prerequisite conflict without inspecting or forwarding the token.

`consentAttested` is provisional until legal review defines the required representation and
evidence. Vortex records the server-controlled consent-policy version, actor, subject, and
timestamp; the raw token is never part of that record.

### Authorization

The route applies authentication before body validation so unauthenticated requests cannot use
validation behavior to probe a bearer-like personal-data transfer capability.

For direct profiles, the authenticated actor and subject are the same authenticated profile.
For managed profiles, `X-Managed-Profile-Id` must resolve to an active directly managed child and
the authenticated actor must be its controlling manager. Direct child credentials are rejected.

Mutations require the manager's current BR corridor, individual-type permission, and canonical
BR individual support. Status reads retain their existing reconciliation behavior after policy
changes, but a removed policy or deleted relationship blocks new imports.

## Persistence and Submission Safety

Add an immutable nullable `verification_method` to individual KYC cases with values `standard`
or `sumsub_share_token`. Selecting it and claiming a submission must be serialized under a
database lock on the canonical KYC case.

Add one nullable `verification_submission` JSON object to the canonical KYC case containing only:

- status: `prepared`, `submitted`, `confirmed`, `ambiguous`, or `failed`;
- optional idempotency-key hash and token digest for input-consistency checks;
- optional standard-payload digest;
- actor and subject profile IDs;
- the complete pre-send attempt-ID baseline;
- non-secret error classification;
- an append-only consent-attestation array containing actor, subject, policy version, and timestamp for each token claim.

The exact Avenia attempt remains in `kyc_cases.provider_case_id`, and the provider-send timestamp
remains in `kyc_cases.submitted_at`. The token itself and complete provider request are never
persisted. The locked canonical case row is the sole serialization boundary, so no submission table
or active-submission index is needed.

The existing normal document/liveness and submission endpoints must participate in the same
method claim. Adding a lock only to token import would leave a race where normal KYC starts after
the import preflight but before Avenia consumes the token.

### Retry and reconciliation

- A confirmed retry with the same idempotency key returns the stored attempt ID.
- Reusing an idempotency key with a different token digest returns `409`.
- Concurrent requests result in at most one Avenia import call.
- A definitive pre-provider rejection, including failure to read the attempt baseline, marks the
  submission failed and requires a new idempotency key even though the token was not sent.
- A transport failure, timeout, malformed success, or provider 5xx marks the submission
  ambiguous and never automatically resubmits.
- Reconciliation lists Avenia attempts for the owned subaccount and binds exactly one matching
  `sumsub-token-*` attempt created in the submission window.
- Zero or multiple candidates remain ambiguous and require operator action.
- A provider success followed by a local write failure is repaired from the exact attempt retained
  on the canonical case without another provider POST.
- A second token after an asynchronous rejection remains disabled until Avenia confirms the
  supported retry contract.

## Status and Webhooks

Persist the import response ID in `kyc_cases.provider_case_id`. Individual KYC refresh must query
that exact attempt rather than applying `attempts[0]`. This exact-attempt rule should also be
applied to normal individual submissions when their attempt ID is known.

The existing Avenia webhook remains signature-verified and notification-only. It does not
approve a KYC case or mutate provider state. Polling the exact provider attempt remains the
authoritative persistence path.

Only Avenia `COMPLETED + APPROVED` may approve the provider customer and KYC case. Sumsub
`GREEN`, possession of a token, Avenia import acceptance, and client assertions never complete
onboarding. Before persisting that approval for `sumsub_share_token`, Vortex also reads Avenia
subaccount info. When Avenia returns a non-empty `accountInfo.taxId`, its normalized hash must
equal the canonical provider customer's tax-reference hash; a mismatch leaves both rows
unapproved. An absent or empty provider tax ID preserves the existing approval behavior because
Avenia's guarantee that this field is present for imported KYC remains a deployment blocker.
Terminal approval cannot be downgraded by stale responses.

## Token and Privacy Controls

- Accept a non-empty opaque token of at most 1 KiB.
- Keep the token only in request memory for the provider exchange.
- Do not return, persist, parse, inspect, or analyze the token.
- Suppress the request body in Avenia client debug logging.
- Sanitize provider errors so Axios request configuration and URLs cannot expose the token.
- Exclude the token from Sentry, analytics, traces, metrics labels, audit payloads, and support
  logs.
- Never place the token in a Vortex URL or query parameter.
- Store only a SHA-256 digest when needed to enforce idempotent input consistency.
- Keep actor, subject, case, provider attempt, method, and consent metadata auditable.

Sharing may transfer identity fields, document images, selfies, biometric-derived checks, and
review results between Sumsub clients. Sumsub's generic consent does not replace each party's
legal basis, applicant disclosures, biometric or special-category consent, international data
transfer controls, or inter-organizational sharing obligations.

Before deployment enablement, legal and compliance must define what a direct user and a manager
acting for a child attest, the policy text and version, who collects applicant consent, and what
evidence Vortex must retain. Possession of a valid token is not treated as consent evidence.

## Implementation Areas

### API and shared Avenia client

- Add the import route, request validation, authorization guard, and controller/service.
- Add the exact `/v2/kyc/import-token/` Avenia mapping and validated response schema.
- Add a sensitive-body option to the Avenia request client so this payload is never logged.
- Generalize the existing attempt-by-ID client method for both individual KYC and company
  verification.

### Persistence

- Add the immutable KYC verification method and current durable claim to the canonical KYC case.
- Serialize claim and idempotency transitions by locking that canonical case.
- Store the confirmed Avenia attempt ID on the canonical case.
- Backfill pre-existing individual Avenia cases to the standard method.

### Existing normal KYC

- Claim `standard` before creating the first document or liveness resource.
- Reuse the same claim for normal API and Web SDK attempt creation.
- Reject every normal-flow mutation after `sumsub_share_token` is selected.
- Persist normal attempt IDs and poll exact attempts where available.

### Public contract and maintained documentation

- Add the endpoint and schemas to OpenAPI and generated declarations.
- Document the two API-only stories and the required Avenia recipient client ID.
- Keep static onboarding requirements on the normal flow initially; token import is an explicit
  alternative operation rather than a replacement default.
- Update `docs/security-spec/05-integrations/brla.md` with the method lock, ownership, token
  secrecy, attempt binding, and retry invariants.
- Update identity architecture only if the persisted ownership model changes.

No frontend, dashboard, SDK, or `packages/kyc` machine changes are required for this API-only
delivery.

## Acceptance Criteria

### Managed story

- The controlling manager can import a valid token for an active directly managed individual.
- The provider customer and KYC case remain owned by the child.
- An unrelated manager, deleted relationship, disabled BR corridor, disallowed individual type,
  or child-owned credential cannot import.
- The manager can read the resulting child status through existing delegated reads.

### Direct story

- An authenticated non-managed profile can import a valid token for its own active individual
  Avenia customer.
- The profile cannot select another profile, entity, CPF, subaccount, or provider customer in the
  request.
- Public credentials, anonymous requests, and ownerless partner credentials cannot import.

### Shared behavior

- Subaccount creation succeeds without choosing a KYC method.
- The first normal KYC provider artifact permanently blocks token import.
- A claimed token import permanently blocks every normal-flow mutation.
- Concurrent and retried requests produce at most one provider import.
- Ambiguous outcomes never cause automatic token replay.
- The token never appears in storage, logs, telemetry, URLs, or errors.
- The exact Avenia attempt controls status.
- Only Avenia approval completes onboarding.

## Test Plan

- Direct-user and controlling-manager happy paths.
- Rejection of child credentials, unrelated managers, public keys, anonymous callers, and
  foreign provider customers.
- Rejection for company entities, missing subaccounts, approved cases, deleted children, and
  disabled manager policy.
- Empty and over-1-KiB token validation after authentication.
- Standard-first and token-first method-lock tests on every affected endpoint.
- Migration backfill of existing individual Avenia cases and nullable method state on cases created later.
- Concurrent imports issue one Avenia request.
- Import racing normal document or attempt creation cannot cross the method lock.
- Idempotent confirmed retry returns the same attempt.
- Different token under the same idempotency key returns `409`.
- Timeout and local persistence failure enter safe reconciliation paths.
- Pending, processing, approved, rejected, and expired exact-attempt mapping.
- Unrelated or stale attempts cannot update the bound case.
- Webhook replay remains notification-idempotent and cannot approve KYC.
- Assertions that request logs, database rows, error responses, and observability events contain
  no raw token.
- OpenAPI and documentation synchronization checks.

## Delivery Order

1. Confirm Avenia feature enablement, recipient IDs, endpoint authentication, and retry behavior.
2. Complete privacy and consent review for both caller stories.
3. Add the verification-method lock and durable submission persistence.
4. Bring normal KYC document and attempt creation under the same lock.
5. Add the redacted Avenia import client operation.
6. Add the unified Vortex endpoint and actor/subject authorization policy.
7. Bind individual polling to exact attempt IDs and add reconciliation.
8. Publish OpenAPI and integration documentation and update the BRLA security specification.
9. Run the sandbox contract flow for direct and managed profiles before production enablement.

## Blocking Confirmations

- Avenia's sandbox and production Sumsub recipient `forClientId` values.
- `SumsubSharedClient` enablement in both environments.
- Signed API-key support on `/v2/kyc/import-token/`.
- Whether and when a new token is permitted after asynchronous rejection.
- Which synchronous errors prove that the token was not consumed.
- How Avenia recommends reconciling an import timeout with no immediate matching attempt.
- Whether `accountInfo.taxId` is guaranteed to be present after imported KYC approval in every
  enabled environment.
- Avenia's retention and deletion policy for imported identity data and documents.
- The consent and attestation contract for direct users and managers acting for children.

## Sources

### Avenia

- [KYC via Sumsub Shared Token](https://integration-guide.avenia.io/docs/KYC/kycSumsubSharedToken)
- [KYC Level 1 and attempt polling](https://integration-guide.avenia.io/docs/KYC/kycLevel1)
- [Subaccount management](https://integration-guide.avenia.io/docs/Avenia%20Subaccounts/subAccountManagement)
- [Environments](https://integration-guide.avenia.io/environments)
- [API-key usage](https://integration-guide.avenia.io/docs/Security/apiKeysGuide)
- [Webhook events](https://integration-guide.avenia.io/docs/Webhooks/webhookEvents)
- [Webhook signature verification](https://integration-guide.avenia.io/docs/Webhooks/verifyingWebhookAuthenticity)

### Sumsub

- [Reusable KYC Share](https://docs.sumsub.com/docs/reusable-kyc-share)
- [Generate share token](https://docs.sumsub.com/reference/generate-share-token)
- [Manage sharing partners](https://docs.sumsub.com/docs/manage-sharing-partners)
- [Applicant privacy disclosures and consent](https://docs.sumsub.com/docs/applicant-privacy-disclosures-and-consent-requirements)

## Research Limitations

The investigation used public documentation only. No authenticated Avenia or Sumsub dashboard,
contract, support correspondence, or live API credentials were available. Avenia did not expose
a public OpenAPI document at common specification paths. The blocking confirmations above remain
required before deployment enablement.
