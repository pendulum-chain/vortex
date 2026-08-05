# Proposal: Unified KYC and KYB API

Status: proposed, early discussion draft. This document currently seeks agreement on
scope, invariants, and delivery order. Exact routes, schemas, and provider-specific field
contracts remain open. Last updated: 2026-08-05.

Related material:

- [`Proposal: Managed Headless Profiles`](proposal-headless-profiles-and-pricing-plans.md)
- [`Identity, Customer, and Partner Model`](architecture-identity-model.md)
- [`Avenia KYB Level 1 - API`](https://integration-guide.avenia.io/docs/KYB/kybLevel1Api)
- [`Avenia KYB Level 1 - Web SDK`](https://integration-guide.avenia.io/docs/KYB/kybLevel1)

## Objective

Allow a customer, or an authorized manager acting for a managed headless customer, to
complete corridor-supported KYC or KYB through the Vortex API without requiring the
Vortex dashboard, widget, or a provider-hosted onboarding UI.

In parallel, replace the current collection of provider-named onboarding endpoints with
the smallest practical common API. The API should select the provider from the corridor
and customer type, expose Vortex-owned verification resources and canonical statuses,
and retain provider-specific input only where the underlying checks genuinely differ.

The first delivery item is Avenia's new API-based Level 1 KYB flow. Today, Vortex starts
Avenia company KYB through the Web SDK endpoint and sends the customer to separate hosted
company and representative URLs. The new provider flow lets Vortex submit company data,
UBOs, and documents server-to-server and track the resulting attempt.

## Initial scope

- Focus on Avenia and Alfredpay.
- Start with Avenia Level 1 KYB for the BRL corridor.
- Support both self-service profiles and manager-to-child delegated operations as the
  managed-headless-profile authorization work becomes available.
- Keep the resource model and provider boundary suitable for another future integrator.
- Do not redesign Monerium or other provider flows in this proposal.
- Do not let callers approve a case, override a provider decision, or write canonical
  compliance status directly.

"API-driven" means that an integrator can collect data in its own experience and perform
the workflow through Vortex API operations. Pre-signed document uploads and unavoidable
identity/liveness steps may still involve a provider-controlled URL, but the flow must not
depend on a Vortex UI.

## Existing foundation

The persistence model is already mostly provider-neutral:

```text
profile
    -> customer entity
        -> provider customer
            -> KYC/KYB case
```

`provider_customers` owns the durable corridor/provider account, while `kyc_cases` owns a
verification attempt and its canonical `started`, `pending`, `in_review`, `approved`, or
`rejected` status. This model should be reused rather than introducing a second onboarding
or compliance identity.

The current API is less unified than the storage model:

- most Avenia and all Alfredpay KYC/KYB routes require a Supabase browser session;
- route names, request shapes, document handling, retries, and status responses expose
  provider workflow details;
- the dashboard orchestrates separate provider XState machines and polls the aggregated
  `GET /v1/onboarding/status` read model;
- no current request context distinguishes a manager actor from a managed child subject.

## Required invariants

- The operation subject is always a profile and its customer entity. Provider accounts
  and cases belong to that subject, never to a manager.
- A self-service request may use the profile's accepted authentication methods. A
  delegated request must preserve both `actorProfileId` and `subjectProfileId` and pass the
  direct manager-child and corridor checks defined by the headless-profiles proposal.
- The server derives the provider from corridor and customer type. A caller cannot select
  an arbitrary provider account or provider case belonging to another subject.
- Public responses use Vortex case identifiers and canonical status. Provider identifiers
  stay internal unless a specific continuation step requires an opaque reference.
- Provider-specific data is represented explicitly rather than forced into a misleading
  lowest-common-denominator schema.
- Document operations are scoped to the subject, provider customer, case, and expected
  document type before Vortex issues an upload target or forwards content.
- Provider-confirmed state remains authoritative. Client completion events cannot mark a
  case approved.

## Delivery order

1. Implement Avenia Level 1 KYB through its API flow: create or reuse the company
   subaccount, create and upload company and UBO documents, register UBOs, submit the KYB
   attempt, and synchronize its result into the existing provider customer and KYB case.
2. Use that vertical slice to define the common Vortex case lifecycle and operations for
   starting, continuing, submitting, reading, and retrying verification.
3. Make those operations available to self-service API credentials and to manager
   credentials acting on an authorized managed child, without changing resource ownership.
4. Adapt Alfredpay's API-based KYC/KYB flows to the same lifecycle while retaining its
   corridor-specific forms, document sets, and hosted-flow exceptions.
5. Migrate first-party UI consumers, then retire provider-named public onboarding routes
   only after compatibility requirements are known.

The first item must not wait for the complete cross-provider API design. It should reuse
the current canonical tables and status rules so the Avenia work becomes the first adapter
behind the unified API rather than a parallel compliance model.

## First open decisions

- What is the smallest common resource shape: one provider customer with a current case,
  or an explicit append-only list of attempts?
- Which operation vocabulary fits both providers without hiding meaningful differences?
- Should Vortex proxy document bytes, issue provider pre-signed upload URLs, or support
  both patterns behind one document resource?
- How does a caller select a managed child in the route while keeping that selector a
  narrow delegated capability rather than general impersonation?
- Which profile data, including contact email, must be supplied for null-email headless
  customers when a provider requires it?
- Which status changes should produce API webhooks so headless callers do not have to
  poll indefinitely?

The next revision should answer these questions before fixing exact endpoint paths or
request schemas.
