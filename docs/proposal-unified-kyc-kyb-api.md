# Proposal: Unified KYC and KYB API

Status: proposed, early discussion draft. This document currently seeks agreement on
scope, invariants, and delivery order. Exact routes, schemas, and provider-specific field
contracts remain open. Last updated: 2026-08-06.

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

Avenia is the first vertical slice, not the scope of the unified API. The common envelope
and lifecycle must continue to accommodate Alfredpay and future integrators without making
their callers depend on Avenia-specific routing or identifiers.

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
  `GET /v1/onboarding/status` read model.

Authentication, delegated authorization, and manager-to-child ownership are defined by
the [managed-headless-profiles proposal](proposal-headless-profiles-and-pricing-plans.md)
and are not repeated here. This proposal defines the verification workflow applied after
the operation profile has been resolved.

## Tentative generic flow

The ideal API exposes the workflow as discoverable stages instead of requiring an
integrator to know a provider's sequence in advance:

1. **Discover requirements.** The caller requests the requirements for a KYC or KYB by
   corridor and customer type. Vortex derives the provider and returns an overview of the
   required data fields, document types, and any liveness or selfie requirement. The
   requirements are provider- and country-specific even though their envelope is common.
   The response includes a stable requirements version.
2. **Create the attempt and submit initial data.** The caller creates a verification case
   with the structured data already available, such as personal or company name, address,
   tax information, representatives, or beneficial owners. The exact fields follow the
   requirements returned for that corridor, and the case pins that requirements version.
3. **Upload documents when required.** The caller creates and uploads each required
   document using the mechanism supported by Vortex for that provider. Vortex creates and
   returns its own stable identifier for each document or document batch before upload;
   upstream identifiers are stored only as internal mappings.
4. **Complete liveness or selfie evidence when required.** The case may return a liveness
   continuation step or accept a selfie document upload, depending on the provider and
   country.
5. **Submit and track the case.** Once all required stages are complete, Vortex submits or
   finalizes the provider attempt and exposes its canonical status until it is approved,
   rejected, or requires another supported action.

Not every provider needs every stage. The requirements response determines which stages
apply and gives API clients enough information to build their own collection experience
without embedding Vortex's dashboard workflow.

## API principles

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
- Delegated operations retain both the manager actor and child subject for authorization
  and audit while keeping the child as the resource owner.
- Case creation, document submission, and final submission define retry-safe behavior so
  a client timeout cannot silently create duplicate provider-side effects.

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

The first vertical slice does not need to settle every cross-provider resource or webhook
decision. It must preserve the common envelope, pin the requirements version, use Vortex
resource identifiers, keep provider identifiers internal, and make external side effects
safe to retry.

## First open decisions

- What is the smallest common resource shape: one provider customer with a current case,
  or an explicit append-only list of attempts?
- Which operation vocabulary fits both providers without hiding meaningful differences?
- Should Vortex proxy document bytes, issue provider pre-signed upload URLs, or support
  both patterns behind one document resource?
- Which contact data must be supplied as case data when a provider requires it?
- Which status changes should produce API webhooks so headless callers do not have to
  poll indefinitely?

The next revision should answer these questions before fixing exact endpoint paths or
request schemas.
