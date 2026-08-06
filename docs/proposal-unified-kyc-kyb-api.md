# Proposal: Unified KYC and KYB API

Status: proposed. This document defines the required first delivery and separates it from
later cross-provider generalization. Exact route names and Avenia field names remain
implementation decisions. Last updated: 2026-08-06.

Related material:

- [Proposal: Managed Headless Profiles](proposal-headless-profiles-and-pricing-plans.md)
- [Identity, Customer, and Partner Model](architecture-identity-model.md)
- [Avenia KYB Level 1 - API](https://integration-guide.avenia.io/docs/KYB/kybLevel1Api)
- [Avenia KYB Level 1 - Web SDK](https://integration-guide.avenia.io/docs/KYB/kybLevel1)

## Objective

Allow a customer, or an authorized manager acting for a managed headless customer, to
complete supported KYC or KYB through the Vortex API without depending on the Vortex
dashboard or widget.

The public API exposes Vortex-owned verification and document resources. Vortex derives
the provider from the operation subject, corridor, and customer type, while keeping
provider identifiers and provider-specific orchestration internal.

The first delivery is Avenia Level 1 KYB for the BRL corridor. It replaces the current
Avenia Web SDK handoff with server-to-server submission of company data, beneficial
owners, and documents. It is the first adapter behind the common API, not a second
compliance model.

## First-iteration scope

The first iteration includes:

- Avenia Level 1 KYB for BRL business customers;
- self-service profiles authenticated through the existing supported credential or
  session path;
- manager credentials acting on an authorized managed child when the managed-profile
  authorization work is available;
- a fixed and documented Avenia BRL KYB request schema;
- Vortex-owned verification-case and document identifiers;
- create, upload, submit, read, and retry behavior;
- polling the case resource for status.

The first iteration does not include Alfredpay migration, a dynamic form-schema engine,
public verification webhooks, child API credential issuance, or a general workflow
engine.

"API-driven" means that an integrator may collect data in its own experience and perform
the supported workflow through Vortex API operations. An unavoidable identity, liveness,
or provider-consent step may still return an opaque provider-controlled continuation URL,
but the flow does not require a Vortex UI.

## Existing foundation

The existing persistence model remains authoritative:

    profile
        -> customer entity
            -> provider customer
                -> KYC/KYB cases

provider_customers owns the durable provider account. Each kyc_cases row represents one
verification attempt and retains the canonical started, pending, in_review, approved, or
rejected status. Provider status may continue to be stored internally as status_external.

The first iteration does not add separate verification-case, attempt, action, or workflow
definition tables. A retry creates a new kyc_cases row instead of overwriting the previous
attempt. Historical decisions therefore remain available for compliance, support, and
audit.

Authentication, delegated authorization, and manager-to-child ownership are defined by
the [managed-headless-profiles proposal](proposal-headless-profiles-and-pricing-plans.md).
This proposal begins after the operation subject has been resolved.

## First-iteration resource contract

### Verification case

Every public verification attempt uses a Vortex case identifier. Provider customer and
provider case identifiers remain internal.

The case stores or resolves at least:

    id
    customer_entity_id
    provider_customer_id
    customer_type
    corridor
    requirements_version
    status
    status_external
    created_at
    updated_at

For the initial flow, requirements_version is a fixed value such as
avenia-brl-kyb-l1-v1. It is pinned when the case is created so a provider requirement
change cannot silently alter an in-flight attempt.

The public response keeps the existing canonical status and adds simple client guidance:

    {
      "id": "kyc_...",
      "status": "started",
      "requirementsVersion": "avenia-brl-kyb-l1-v1",
      "nextAction": "upload_documents",
      "errorCode": null
    }

nextAction and errorCode use a small documented set of stable Vortex values. They do not
expose provider error strings as the public contract. Allowed status transitions and the
meaning of each action or error code must be documented and tested.

### Document

Vortex creates its own document identifier before issuing an upload target or forwarding
content. The identifier does not depend on whether Avenia exposes a document or batch ID.

The minimum document resource records:

    id
    kyc_case_id
    subject_reference
    document_type
    status
    provider_reference
    created_at
    updated_at

subject_reference identifies the company, beneficial owner, or representative within the
case. Provider references remain internal.

Before accepting or forwarding a document, Vortex verifies the authenticated subject,
case ownership, expected subject reference, and expected document type. Upload targets
must be short-lived and constrained by file size and content type. Document bytes and
sensitive identity data must not be written to ordinary logs. If Vortex proxies or stores
arbitrary file bytes, it also validates the real file type and scans the upload before
provider submission.

The adapter may use a provider pre-signed upload URL or a Vortex-controlled upload path.
That implementation choice does not change the public Vortex document resource.

## First-iteration flow

1. **Create an attempt.** The caller supplies the BRL corridor, business customer type,
   and versioned Avenia Level 1 KYB data. Vortex derives the customer entity, provider,
   and provider customer from the operation subject.
2. **Create and upload documents.** The caller creates Vortex document resources for the
   company and relevant beneficial owners or representatives, then uploads through the
   returned targets.
3. **Submit the attempt.** Vortex checks that the required data and documents exist, sends
   the provider operations in the required order, and moves the case to the appropriate
   canonical status.
4. **Track the attempt.** The caller reads the Vortex case until it is approved, rejected,
   or exposes another supported nextAction.
5. **Retry when allowed.** Corrected data or documents create a new attempt. The previous
   case remains unchanged and the API returns the new Vortex case identifier.

The create-attempt, document-forwarding, and submit operations must tolerate client
retries without creating duplicate provider-side effects. The implementation may use an
Idempotency-Key or an equivalent resource-state guard; a general API-wide idempotency
framework is not required for this delivery.

## Authorization and state invariants

- The server derives the provider from the operation subject, corridor, and customer
  type. A caller cannot select an arbitrary provider customer or provider case.
- A delegated operation uses the child as the resource owner and retains the manager as
  the audited actor.
- Document operations are scoped to the operation subject, customer entity, provider
  customer, case, subject reference, and expected document type.
- Provider-confirmed state is authoritative. A caller cannot approve a case, override a
  provider decision, or write canonical compliance state directly.
- The actor, subject, credential, and case identifier are available to audit records.
- Provider-required consent or attestation is collected in the provider-specific payload
  and recorded with the submitting actor and timestamp. A general consent subsystem is
  not required for the first iteration.
- Retained identity data follows the existing security and legal-retention rules. The API
  returns only the fields needed by the integrator and does not echo unmasked identity
  numbers or document content by default.

## Delivery order

1. Implement the Avenia Level 1 KYB adapter using the existing provider customer and
   append-only KYC case records.
2. Define the fixed avenia-brl-kyb-l1-v1 input, document requirements, status transitions,
   next actions, error codes, and retry rules.
3. Expose the minimal create, document, submit, and read operations for self-service
   subjects.
4. Allow the same operations through the managed-profile actor/subject authorization path
   without changing child ownership.
5. Add focused ownership, cross-manager, idempotency, retry-history, document-scope, and
   provider-state tests.
6. Migrate the first-party Avenia Level 1 UI consumer after the API contract is stable.

## Follow-up capabilities

The following are intentionally deferred until a concrete second flow requires them:

- adapt Alfredpay and additional providers to the common lifecycle;
- discover dynamic provider and country requirements through a versioned schema;
- split a stable verification aggregate from append-only attempt records;
- separate workflow state, provider decision, remediation actions, and capability status;
- publish verification webhooks instead of relying on polling;
- introduce an API-wide idempotency and standardized error framework;
- add a generic company, owner, controller, and representative relationship model;
- automate consent, retention, export, and redaction workflows;
- migrate remaining first-party UI flows and retire provider-named public routes.

The Avenia vertical slice should keep provider orchestration behind a narrow adapter so
these capabilities can be added without changing subject ownership or exposing provider
identifiers.

## Acceptance criteria

- A BRL business customer can complete Avenia Level 1 KYB through API operations without
  a Vortex dashboard or widget.
- An authorized manager can perform the same flow for its managed child, with the manager
  recorded as actor and the child retained as owner.
- Provider identity is derived server-side and provider identifiers stay internal.
- Every attempt and document has a stable Vortex identifier.
- Requirements are pinned to a documented version for the lifetime of an attempt.
- Retrying a failed or rejected flow creates a new case without overwriting history.
- Retried create, document, and submit requests do not duplicate provider-side effects.
- Public status, next-action, and error values are stable and provider-neutral.
- Provider state remains authoritative.
- Document uploads are subject-scoped, type-constrained, short-lived, and excluded from
  ordinary logs.
