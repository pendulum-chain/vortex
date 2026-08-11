# Proposal: API-Driven KYC and KYB

Status: proposed direction, with the initial requirements discovery contract and KYC/KYB
OpenAPI coverage implemented. This document records the intended direction for API-driven
customer verification while preserving the provider-specific endpoints and workflows used by
current Vortex consumers. Last updated: 2026-08-11.

Related material:

- [`Proposal: Managed Headless Profiles`](proposal-headless-profiles-and-pricing-plans.md)
- [`Identity, Customer, and Partner Model`](architecture-identity-model.md)
- [`Vortex API Docs Source`](api/README.md)
- [`Avenia KYB Level 1 - API`](https://integration-guide.avenia.io/docs/KYB/kybLevel1Api)
- [`Avenia KYB Level 1 - Web SDK`](https://integration-guide.avenia.io/docs/KYB/kybLevel1)

## Objective

Allow a customer, or an authorized manager acting for a managed headless customer, to
complete corridor-supported KYC or KYB through the Vortex API without requiring the Vortex
Dashboard, Widget, or another Vortex UI where the provider supports an API-driven flow.

Vortex will preserve the existing provider-specific endpoints, request contracts, and call
sequences. They already support the Dashboard and other first-party consumers, and replacing
them with a provider-neutral execution API would create migration risk without improving the
underlying provider workflows.

To make these existing flows usable by external API clients, Vortex exposes a discovery
endpoint that identifies the flow, documents, and ordered operations for a country and customer
type. Request fields and bodies remain exclusively defined by OpenAPI, so the response does not
introduce a second schema or execution layer.

## Scope

- Keep the current Avenia and Alfredpay endpoint families and their call order.
- Support both self-service profiles and manager-to-child delegated operations.
- Complete API credential support for provider operations that currently depend on a browser
  session, where provider capabilities permit a headless flow.
- Publish machine-readable document and operation requirements for each supported country and
  customer type without duplicating request fields.
- Keep OpenAPI and corridor-specific integration documentation authoritative for complete
  request and response contracts.
- Continue using the existing provider customer and KYC/KYB case records for ownership and
  status tracking.
- Do not redesign Monerium or other provider flows as part of this proposal.

"API-driven" means that an integrator can collect data in its own experience and perform the
workflow through Vortex API operations. Pre-signed document uploads and unavoidable identity
or liveness steps may still involve a provider-controlled URL, but the flow must not depend on
a Vortex UI.

## Existing foundation

The persistence model already separates the customer, provider account, and verification
attempt:

```text
profile
    -> customer entity
        -> provider customer
            -> KYC/KYB case
```

`provider_customers` owns the durable corridor/provider account, while `kyc_cases` owns a
verification attempt and its canonical status. This model remains unchanged.

The public execution surface is intentionally provider-specific. Avenia and Alfredpay have
different request shapes, document handling, hosted-flow exceptions, statuses, and retry
rules. The Dashboard already orchestrates those sequences through shared KYC/KYB state
machines and reads the aggregated `GET /v1/onboarding/status` view.

Avenia's API-based Level 1 KYB flow is the first headless business-verification slice. It uses
the existing BRLA route family to create or reuse the company subaccount, create and upload
company and UBO documents, register UBOs, submit the attempt, and track its result. It does not
need to become an adapter behind a new provider-neutral route family.

Authentication, delegated authorization, and manager-to-child ownership are defined by the
[managed-headless-profiles proposal](proposal-headless-profiles-and-pricing-plans.md). This
proposal applies those controls to the existing provider operations.

## Endpoint preservation invariants

- Existing Dashboard, Widget, and other first-party workflows must continue to work without
  migrating to a new endpoint family or reordered sequence.
- Existing provider-specific endpoint names and request contracts remain compatibility
  contracts. Changes follow the normal public API compatibility policy.
- Discovery references identify the existing operations; discovery does not proxy, combine, or
  replace them.
- The authenticated profile, or authorized managed child, remains the owner of every provider
  customer, verification case, and uploaded document.
- Delegated operations retain both the manager actor and child subject for authorization and
  audit while keeping the child as resource owner.
- Provider-confirmed state remains authoritative. A client completion event cannot mark a
  case approved.
- Side-effecting operations must define retry-safe behavior so a client timeout cannot
  silently create duplicate provider-side resources or submissions.
- Requirements may differ by country, customer type, provider, and verification level. The
  referenced provider-specific OpenAPI operations represent those differences instead of a
  common request schema.

## Requirements discovery

The discovery operation is:

```http
GET /v1/onboarding/requirements?country=BR&customerType=business
```

`country` uses the ISO 3166-1 alpha-2 country code that selects the current onboarding flow.
`customerType` distinguishes individual KYC from business KYB. If a country supports multiple
verification levels, the final contract must also define how the requested or applicable level
is selected.

The response contains stable flow/provider metadata, document requirements, and ordered action
steps. API steps identify the OpenAPI `operationId`, method, path, and request-schema reference.
Non-HTTP direct-upload and hosted steps remain explicit so clients can preserve the complete
submission sequence. Discovery intentionally omits every `GET` operation, including initial
resource reads, intermediate readiness checks, redirect/status getters, and final polling.
Integration documentation and OpenAPI remain authoritative for those reads and for determining
completion.

The response intentionally has no top-level `fields` array and does not reproduce request-body
properties. Clients resolve each step's `requestSchema` against `openapiUrl` and use OpenAPI as
the sole machine-readable body contract.

For example:

```json
{
  "country": "BR",
  "customerType": "business",
  "documentationUrl": "https://api-docs.vortexfinance.co/fiat-corridors",
  "flow": "avenia-br-business-level-1-api-kyb",
  "mode": "api",
  "provider": "avenia",
  "requirementsVersion": "2026-08-10",
  "openapiUrl": "https://raw.githubusercontent.com/pendulum-chain/vortex/main/docs/api/openapi/vortex.openapi.json",
  "documents": [
    {
      "collection": "direct-upload",
      "required": true,
      "type": "CERTIFICATE-OF-INCORPORATION"
    }
  ],
  "steps": [
    {
      "order": 1,
      "operationId": "createSubaccount",
      "method": "POST",
      "path": "/v1/brla/createSubaccount",
      "requestSchema": "#/components/schemas/CreateSubaccountRequest",
      "kind": "api",
      "description": "Create the company Avenia subaccount."
    },
    {
      "order": 2,
      "operationId": "createAveniaKybDocument",
      "method": "POST",
      "path": "/v1/brla/kyb/documents",
      "requestSchema": "#/components/schemas/AveniaKybDocumentRequest",
      "kind": "api",
      "description": "Create an upload target for each company and UBO document."
    }
  ]
}
```

The example is abbreviated. The endpoint does not return fields, populated request bodies,
customer PII, or duplicate schemas. Clients resolve each API step's request schema and construct
the body from data they collect.

## Contract authority and synchronization

The requirements response is a discovery index, not a second schema source. OpenAPI is
authoritative for each operation's complete request, response, and error contract. The
corridor-specific guide remains authoritative for behavioral details such as sequencing,
branching, retries, custody, and asynchronous completion.

The OpenAPI document covers the existing Avenia and Alfredpay KYC/KYB operations advertised by
discovery, including API credential and managed-profile authentication. Discovery links to the
reviewed repository document through its stable raw GitHub URL while Apidog remains the
human-facing endpoint catalog.

Every published non-GET API step must resolve to an operation in the reviewed OpenAPI document,
and every request-schema pointer must resolve. The documentation gate fails when an operation
ID, method, path, or schema reference is stale.

## Authentication and state

Requirements metadata is public and requires no authentication. Responses contain no private
provider configuration, account state, or PII.

Requirements discovery is not a profile status API. It selects a static flow for a country and
customer type, not which operations a particular profile has completed. Clients
must use the existing provider status operations and `GET /v1/onboarding/status` where applicable.
Profile-specific next-action guidance is outside this proposal and may be considered later if
static requirements plus documented status behavior prove insufficient.

## Consequences

### Benefits

- Existing first-party consumers avoid a risky endpoint and state-machine migration.
- External API clients can discover the applicable submission actions without reverse
  engineering a Dashboard workflow.
- OpenAPI is the sole machine-readable source for request-field and body-schema details.
- Provider-specific differences remain visible and accurately modeled.

### Costs and constraints

- Integrators must implement country- and provider-specific operation sequences, statuses,
  errors, retries, and hosted-flow branches. Vortex does not provide one portable execution
  client across providers.
- Publishing an ordered step makes that route and its position in the flow part of the external
  compatibility surface.
- The operation list can drift from provider behavior unless it is reviewed with OpenAPI and
  runtime changes.
- Completing and maintaining KYC/KYB OpenAPI coverage becomes a prerequisite for reliable
  discovery.
- Discovery does not advertise resource reads, readiness checks, or status polling. Integrators
  must use provider-specific documentation, OpenAPI, and status responses for completion.

## Delivery order

1. Preserve and complete API credential and managed-profile authorization for each existing
   provider-specific operation required by supported headless flows. Implemented.
2. Reconcile the public OpenAPI document with the implemented Avenia and Alfredpay KYC/KYB
   endpoints, authentication, request schemas, responses, and errors, then publish it at a
   stable machine-readable URL. Implemented.
3. Define the requirements response schema and synchronization checks. Implemented.
4. Implement requirements discovery for Avenia Level 1 KYC/KYB in Brazil using the existing
   BRLA operations and sequence. Implemented.
5. Add Alfredpay countries using their existing API-based or hosted-flow operations without
   renaming or reordering those routes. Implemented for AR, CO, MX, and US product-supported
   customer types.
6. Publish corridor-specific guides and examples, then add SDK discovery conveniences only
   where they reduce integration work without hiding provider-specific behavior.

## Non-goals

- A provider-neutral KYC/KYB execution endpoint family.
- A common request body, document resource, status vocabulary, or retry operation across all
  providers.
- Reordering, combining, proxying, or retiring existing provider-specific operations.
- Migrating the Dashboard, Widget, or shared KYC/KYB state machines to a new workflow.
- Letting callers select arbitrary provider accounts or write compliance decisions.
- Returning customer PII, duplicated request-field catalogs, or pre-populated executable request
  bodies from requirements discovery.
- Profile-specific next-action orchestration.

## Open decisions

- Should discovery use `country=BR`, which matches current onboarding selection, or a fiat
  corridor such as `corridor=BRL`? The contract must use one term consistently.
- How is a verification level selected when a country supports more than one level?
- Should operation metadata be generated from a flow definition rather than maintained beside
  runtime orchestration?
