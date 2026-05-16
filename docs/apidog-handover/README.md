# Apidog Handover README

This file is a handover for future AI agents working on the Vortex Apidog project and the public API documentation at:

```text
https://api-docs.vortexfinance.co/
```

It summarizes what was learned about programmatic Apidog access, the documentation scope decisions, and the suggested Markdown copy for the pure text pages.

Do not paste secrets into this file. Do not commit generated OpenAPI drafts that contain real credentials.

## Apidog Project Access

Project ID:

```text
918521
```

The Apidog access token is available locally in:

```text
apps/api/.env
```

Expected environment variable name:

```text
APIDOG_ACCESS_TOKEN
```

Important handling rules:

- Never print the token to the terminal.
- Never copy the token into Markdown, source files, logs, screenshots, or support tickets.
- Source the token inside shell commands when needed.
- If a command accidentally prints the token, recommend rotating it after the docs pass.

Example pattern:

```bash
set -a
source apps/api/.env
set +a
```

## Official Apidog API Endpoints

The official Apidog OpenAPI import/export API is documented here:

- Export: `POST /v1/projects/{projectId}/export-openapi`
- Import: `POST /v1/projects/{projectId}/import-openapi`

Base URL:

```text
https://api.apidog.com
```

Use this header:

```text
X-Apidog-Api-Version: 2024-03-28
```

### Export Current OpenAPI

This read-only export was confirmed to work for project `918521`.

```bash
zsh -lc 'set -a; source apps/api/.env; set +a; curl -sS --fail-with-body -o /private/tmp/apidog-project-918521-export.json -w "HTTP_STATUS:%{http_code}\n" --location --request POST "https://api.apidog.com/v1/projects/918521/export-openapi?locale=en-US" --header "X-Apidog-Api-Version: 2024-03-28" --header "Authorization: Bearer ${APIDOG_ACCESS_TOKEN}" --header "Content-Type: application/json" --data-raw "{\"scope\":{\"type\":\"ALL\"},\"options\":{\"includeApidogExtensionProperties\":false,\"addFoldersToTags\":false},\"oasVersion\":\"3.1\",\"exportFormat\":\"JSON\"}"'
```

The previous export returned HTTP `200` and contained:

```text
OpenAPI version: 3.1.0
Paths: 22
Schemas: 42
Title: Default module
```

Before importing any generated spec, keep a timestamped export as a restore point:

```bash
cp /private/tmp/apidog-project-918521-export.json /private/tmp/apidog-project-918521-pre-docs-refactor-YYYY-MM-DD.json
```

### Import Updated OpenAPI

The official import endpoint is:

```text
POST https://api.apidog.com/v1/projects/918521/import-openapi?locale=en-US
```

The documented Apidog import example uses a remotely reachable URL:

```json
{
  "input": {
    "url": "https://example.com/openapi.json"
  },
  "options": {
    "targetEndpointFolderId": 0,
    "targetSchemaFolderId": 0,
    "endpointOverwriteBehavior": "OVERWRITE_EXISTING",
    "schemaOverwriteBehavior": "OVERWRITE_EXISTING",
    "updateFolderOfChangedEndpoint": false,
    "prependBasePath": false
  }
}
```

Notes for the next agent:

- Do not import without explicit user approval.
- Prefer importing only after showing a path summary and secret scan result.
- The official example expects an HTTPS URL; a local `/private/tmp/*.json` file is not directly reachable by Apidog cloud.
- If no safe temporary HTTPS URL is available, use Apidog UI import manually or ask the user how they want to provide the file.
- Avoid deleting paths unless the user explicitly approves the removal. The current instruction is to preserve every endpoint already documented in Apidog.

## Sprint Branches

The user created a copied/safe Apidog project or backup and is comfortable editing project `918521`, but the docs work should still keep a pre-change export for rollback.

Apidog supports sprint branches in the UI, and the docs mention OpenAPI import into sprint branches. However, the official public OpenAPI import/export API did not clearly document a branch selector.

An internal branch-list probe against:

```text
https://api.apidog.com/api/v1/projects/918521/sprint-branches
```

returned:

```json
{
  "success": false,
  "errorCode": "400105",
  "errorMessage": "Client version too low"
}
```

Do not spend time repeatedly probing internal endpoints unless the user asks. The reliable fallback is:

1. Generate the improved OpenAPI file locally.
2. Let the user import it manually into the desired sprint branch in Apidog UI.

## Pure Text Pages

The official Apidog OpenAPI export/import covers endpoint reference content, schemas, examples, tags, operation descriptions, and top-level OpenAPI info.

It does not appear to include separate Apidog article/Markdown pages such as:

- General overview
- SDK guide
- Sandbox
- Widget parameters
- KYC overview

Those published pages can be read from the public docs site, but they were not available through the official OpenAPI project export. Treat the Markdown below as paste-ready content for manual Apidog page editing unless a future agent finds a supported Apidog pages API.

## Current Endpoint Scope Decision

The user clarified two important points:

1. The docs should be SDK-led and partner-facing.
2. All endpoints already documented in the current Apidog docs must remain, even if they are not SDK-called.

Therefore:

- Preserve all currently documented Apidog endpoints.
- Do not add active repo routes just because they exist.
- Do not mention standalone `subsidize`, `moonbeam`, or `pendulum` endpoints. Their route files exist, but they are not mounted in the active `/v1` router.
- Do not add auth, metrics, SIWE, `/v1/status`, or `/v1/ip` merely because they are active routes. They are not SDK-relevant.
- Keep `POST /v1/quotes/best` in the Quotes section.
- Keep `GET /v1/ramp/history/{walletAddress}`.
- Keep `GET /v1/public-key`.
- Keep supported countries.
- Preserve existing KYC/BRLA endpoint pages because they are already documented, but do not make KYC the main SDK story.

The 22 currently documented paths are:

```text
/v1/brla/createSubaccount
/v1/brla/getKycStatus
/v1/brla/getOfframpStatus
/v1/brla/getUser
/v1/brla/getUserRemainingLimit
/v1/brla/startKYC2
/v1/public-key
/v1/quotes
/v1/quotes/best
/v1/quotes/{id}
/v1/ramp/history/{walletAddress}
/v1/ramp/register
/v1/ramp/start
/v1/ramp/update
/v1/ramp/{id}
/v1/session/create
/v1/supported-countries
/v1/supported-cryptocurrencies
/v1/supported-fiat-currencies
/v1/supported-payment-methods
/v1/webhook
/v1/webhook/{id}
```

Recommended tag/group structure for endpoint reference:

- `Quotes`
- `Ramps`
- `History`
- `BRLA`
- `Widget session`
- `Supported resources`
- `Webhooks`

## SDK-Relevant Endpoints

The SDK currently calls:

```text
POST /v1/quotes
GET /v1/quotes/{id}
POST /v1/ramp/register
POST /v1/ramp/update
POST /v1/ramp/start
GET /v1/ramp/{id}
GET /v1/brla/getUser
```

The user also explicitly wants:

```text
POST /v1/quotes/best
GET /v1/ramp/history/{walletAddress}
GET /v1/public-key
GET /v1/supported-countries
```

Because all existing docs are to be preserved, the full 22-path set above remains the working scope.

## Security And Copy Requirements

The following warnings should be prominent:

- Vortex never receives, stores, logs, or reconstructs ephemeral account secret keys.
- The API client or SDK environment is responsible for storing ephemeral account secrets securely.
- If ephemeral secrets are lost, Vortex may be unable to complete recovery or move funds on behalf of the user.
- The Vortex SDK is strongly preferred because it creates ephemeral accounts, signs required transactions, submits update calls, and can store local backups.
- Direct API integrations must implement key custody, signing, update calls, and recovery backup behavior themselves.
- Secret API keys (`sk_live_*`, `sk_test_*`) must only be used server-side.
- Public API keys (`pk_live_*`, `pk_test_*`) are for attribution/tracking, not authentication.
- Webhooks should be verified with the public key endpoint.

## Sensitive Information Checks

Before import or publication, scan generated artifacts for:

```bash
rg -n --pcre2 '(adgp_[A-Za-z0-9]+|sk_(live|test)_[A-Za-z0-9]{12,}|pk_(live|test)_[A-Za-z0-9]{12,}|recovery phrase:\s*`[^`]+`|mnemonic:\s*`[^`]+`|seed phrase:\s*`[^`]+`|-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----)' <artifact-path>
```

The public Sandbox page previously exposed a shared test wallet recovery phrase. Remove it from any rewritten copy and replace it with safer guidance to use partner-owned test wallets and public faucets.

Example placeholders such as `sk_live_...` and `pk_live_...` are acceptable. Real keys are not.

## Useful Local Artifacts From The Previous Pass

These files were generated during the previous docs pass. They may still exist on the local machine, but do not assume they are permanent:

```text
/private/tmp/apidog-project-918521-export.json
/private/tmp/apidog-project-918521-pre-docs-refactor-2026-05-15.json
/private/tmp/vortex-apidog-preserve-existing-draft.json
/private/tmp/vortex-apidog-informational-pages-rewrite.md
/private/tmp/vortex-apidog-text-pages-proposal.md
```

The final local OpenAPI draft from the previous pass preserved all 22 current Apidog paths, added no new paths, removed no paths, and validated with no missing `$ref` values.

## Suggested Pure Text Page Structure

Recommended Apidog Markdown pages:

1. Overview
2. Quick Start With The SDK
3. Ramp Lifecycle
4. Ephemeral Key Custody
5. Authentication And Partner Keys
6. Quotes And Pricing
7. Webhooks
8. Widget Integration
9. Sandbox
10. BRL / KYC Notes
11. Production Checklist

The full suggested copy follows.

---

# 1. Overview

Vortex is a cross-chain ramping platform for moving between fiat currencies and crypto assets. It supports buy and sell flows across payment rails such as PIX and SEPA and blockchain networks such as Base, Polygon, Pendulum, Stellar, Moonbeam, AssetHub, and Hydration.

These docs are intended for partner developers integrating Vortex into an application, backend, wallet, checkout flow, or operations dashboard. The endpoint reference documents the raw API surface, while the guide pages explain the recommended integration sequence and the responsibilities that sit on the API client side.

For most integrations, Vortex recommends using `@vortexfi/sdk` instead of calling the ramp endpoints directly. The SDK wraps the quote and ramp lifecycle, creates fresh ephemeral accounts, signs required transactions, submits ramp updates, and can store local backups of ephemeral secrets. Direct API integrations are possible, but they must implement those responsibilities themselves.

Vortex does not custody user private keys. During a ramp, temporary blockchain accounts called ephemeral accounts may hold funds in transit. Their public addresses are sent to Vortex, but their secret keys stay with the SDK or API client. This design keeps the signing boundary outside the Vortex API, but it also means the client must store the ephemeral secrets securely until the ramp has completed and any recovery window has passed.

## Recommended Integration Paths

Use the SDK when your application can run a trusted Node.js environment and wants Vortex to handle transaction signing and ramp update mechanics.

Use the Widget when you want a hosted checkout experience and do not want to build the full user-facing ramp flow yourself.

Use the raw API directly only when you need custom orchestration and are prepared to handle ephemeral key custody, signing, backups, ramp updates, and recovery flows yourself.

---

# 2. Quick Start With The SDK

Install the SDK:

```bash
npm install @vortexfi/sdk
```

Initialize it:

```ts
import { VortexSdk, FiatToken, EvmToken, Networks, RampDirection } from "@vortexfi/sdk";

const sdk = new VortexSdk({
  apiBaseUrl: "https://api.vortexfinance.co",
  publicKey: "pk_live_...",
  secretKey: "sk_live_...",
  storeEphemeralKeys: true
});
```

`publicKey` is used for partner attribution and partner-specific pricing. `secretKey` is sent as the `X-API-Key` header for partner-authenticated operations. Secret keys must only be used in trusted server-side environments.

Create a quote:

```ts
const quote = await sdk.createQuote({
  rampType: RampDirection.BUY,
  from: "pix",
  to: Networks.Polygon,
  inputAmount: "150000",
  inputCurrency: FiatToken.BRL,
  outputCurrency: EvmToken.USDC
});
```

Register the ramp:

```ts
const { rampProcess } = await sdk.registerRamp(quote, {
  destinationAddress: "0x1234567890123456789012345678901234567890",
  taxId: "12345678900"
});
```

For BRL buy flows, the ramp process may contain a PIX payment payload:

```ts
console.log(rampProcess.depositQrCode);
```

After the user completes the fiat payment, start the ramp:

```ts
const startedRamp = await sdk.startRamp(rampProcess.id);
```

Poll status or use webhooks:

```ts
const status = await sdk.getRampStatus(rampProcess.id);
```

## Why The SDK Is Preferred

The SDK creates fresh ephemeral accounts for each ramp, signs the transactions returned by Vortex, submits required update calls, and can store a local backup of ephemeral secrets. This removes several integration risks from partner applications.

If you disable SDK key storage with `storeEphemeralKeys: false`, your application must provide an equivalent secure backup mechanism.

---

# 3. Ramp Lifecycle

Every Vortex ramp follows the same high-level lifecycle.

## 1. Create A Quote

Use `POST /v1/quotes` when the route and network are known. Use `POST /v1/quotes/best` when Vortex should evaluate eligible routes and return the best available quote for the requested amount and currency pair.

A quote contains the input amount, expected output amount, source and destination, fee breakdown, payment method, network, and expiry. Quotes are short-lived and should be registered promptly.

## 2. Register The Ramp

Use `POST /v1/ramp/register` with the quote ID and the public addresses of the ephemeral accounts created for this ramp. The response returns a `rampId`, current ramp state, and any unsigned transactions that must be signed before processing can continue.

Only public addresses are sent to Vortex. The matching ephemeral secret keys must stay with the SDK or API client.

## 3. Update The Ramp

Use `POST /v1/ramp/update` to submit signed transactions and route-specific transaction hashes. The SDK performs this automatically for supported flows. Direct API integrations must ensure that each signature or transaction hash matches the transaction returned by Vortex for the same ramp and phase.

## 4. Start The Ramp

Use `POST /v1/ramp/start` after required signatures, transaction hashes, and fiat payment steps are complete. For BRL buy flows, call start after the user completes the PIX payment.

## 5. Track Status

Use `GET /v1/ramp/{id}` to retrieve current state, or configure webhooks to receive lifecycle events asynchronously.

Production integrations should persist the `quoteId`, `rampId`, partner order ID, user/session identifier, and any local ephemeral-key backup reference needed for support or recovery.

---

# 4. Ephemeral Key Custody

Ephemeral accounts are temporary blockchain accounts created for a single ramp. They may hold funds in transit while Vortex coordinates swaps, transfers, bridge operations, or payment settlement.

Vortex receives only ephemeral public addresses. Vortex does not receive, store, log, or reconstruct ephemeral secret keys.

This is a critical integration responsibility:

- The API client or SDK environment must store ephemeral secrets securely.
- Secrets must remain available until the ramp is complete and any recovery window has passed.
- Secrets must never be sent to Vortex endpoints, support channels, logs, analytics, or browser-visible code.
- If ephemeral secrets are lost, Vortex may be unable to complete recovery or move funds on behalf of the user.

The SDK can store local backups using `storeEphemeralKeys`, which defaults to `true`. In Node.js environments, these backups are written as local files keyed by ramp ID.

Treat those backup files as sensitive key material. Encrypt them at rest in production, restrict filesystem permissions, exclude them from source control, and define a retention policy that matches your operational recovery needs.

Direct API integrations must implement equivalent custody behavior. At minimum, they should create fresh ephemerals per ramp, store encrypted backups, associate backups with the ramp ID, and verify that recovery material exists before allowing the user to continue.

---

# 5. Authentication And Partner Keys

Vortex uses two partner key types.

## Public Keys

Public keys use the `pk_live_*` or `pk_test_*` prefix. They are used for partner attribution, tracking, and partner-specific quote behavior. Public keys may be included in SDK configuration or request bodies as `apiKey`.

Public keys do not authenticate sensitive partner operations.

## Secret Keys

Secret keys use the `sk_live_*` or `sk_test_*` prefix. They authenticate partner operations through the `X-API-Key` header.

Secret keys must be treated as server-side credentials. Do not expose them in browser bundles, mobile app binaries, URLs, screenshots, analytics tools, logs, or support tickets.

When a request includes `partnerId`, the API may require the secret key to authenticate the matching partner. If the authenticated partner does not match the requested partner, Vortex rejects the request.

## Recommended Handling

Store secret keys in a secret manager or encrypted environment configuration. Rotate keys if they are exposed, no longer needed, or tied to a retired integration. Use test keys in sandbox and live keys only in production.

---

# 6. Quotes And Pricing

Quotes are the entry point for ramp execution. A quote defines the route, amount, fees, expected output, payment method, network, and expiry.

Use `POST /v1/quotes` when you know the route and network. Use `POST /v1/quotes/best` when you want Vortex to compare eligible routes and select the best available quote.

The quote response includes fee fields in fiat and USD terms. These may include network fees, anchor/provider fees, Vortex fees, partner fees, total fees, and processing fees.

Quotes should be treated as immutable. After a quote is created, use the quote ID to register a ramp. Do not assume a quote remains valid indefinitely. If a quote expires, create a fresh quote.

For partner pricing and attribution, pass the partner public key as `apiKey`. If the request includes `partnerId`, authenticate with the matching partner secret key in `X-API-Key`.

---

# 7. Webhooks

Webhooks let partner systems receive transaction lifecycle events without continuously polling the ramp status endpoint.

Register a webhook:

```http
POST /v1/webhook
X-API-Key: sk_live_...
Content-Type: application/json
```

```json
{
  "url": "https://partner.example.com/vortex/webhook",
  "quoteId": "quote_...",
  "events": ["TRANSACTION_CREATED", "STATUS_CHANGE"]
}
```

Webhook URLs must use HTTPS. Store the returned webhook ID so that the endpoint can be deleted later.

Delete a webhook:

```http
DELETE /v1/webhook/{id}
X-API-Key: sk_live_...
```

## Verification

Verify every webhook before trusting it. Fetch the current public key:

```http
GET /v1/public-key
```

Use the returned public key to verify webhook signatures. Reject requests that fail signature verification, contain malformed payloads, or do not match the expected event structure.

Polling `GET /v1/ramp/{id}` is still useful for user-facing status screens, but webhooks are preferable for reconciliation, back-office automation, and support workflows.

---

# 8. Widget Integration

The Vortex Widget provides a hosted checkout experience for buy and sell flows. It is useful when you want Vortex to handle more of the user-facing ramp flow instead of building the complete SDK experience yourself.

The widget supports two quote modes.

## Auto-Refresh Mode

In auto-refresh mode, the widget creates and refreshes quotes based on the requested direction, amount, fiat currency, crypto asset, network, and payment method.

Use this when your application wants the user to complete checkout from a route definition rather than from a pre-selected quote.

## Fixed-Quote Mode

In fixed-quote mode, your application creates a quote first and passes the `quoteId` to the widget. The widget uses that quote for checkout.

Fixed quotes do not refresh automatically. If the quote expires, the user must restart from a fresh quote.

## When To Use The Widget

Use the Widget when you want a hosted UX and less direct orchestration. Use the SDK when you want to own the UX but still want Vortex to handle transaction signing and ramp update mechanics. Use the raw API only when you need a custom backend integration and can handle ephemeral key custody yourself.

---

# 9. Sandbox

Use the sandbox environment to test quote creation, ramp registration, signing, updates, webhook handling, and status tracking without touching production funds.

Vortex UI:

```text
https://sandbox.vortexfinance.co
```

SDK/API base URL:

```text
https://api-sandbox.vortexfinance.co
```

Use test keys in sandbox. Do not use production API keys, production wallets, production private keys, or production user data.

For EVM-based test flows, use your own test wallet and fund it from public testnet faucets. Do not publish shared recovery phrases or reuse them in partner applications, CI logs, screenshots, or documentation.

Sandbox flows may complete faster than production flows and may mock parts of payment or KYC behavior. Production integrations should still handle asynchronous confirmations, delayed status changes, recoverable failures, webhook retries, and user support workflows.

---

# 10. BRL / KYC Notes

BRL routes require user onboarding with Vortex's local payment partner before ramping. The user's Brazilian tax ID, either CPF for individuals or CNPJ for businesses, is used as the primary identifier.

Level 1 onboarding collects basic identity information and enables lower-limit BRL flows. Level 2 adds document and liveness verification and may be required for higher limits or stricter compliance rules.

The SDK ramp flow assumes that the user is eligible for the selected corridor. If the user has not completed the required onboarding, the ramp may fail or require additional account-management steps.

KYC endpoints are available for account-management integrations, but they should not be treated as the primary SDK ramp flow. When possible, use the Vortex application or a dedicated onboarding flow to complete KYC before ramp execution.

---

# 11. Production Checklist

Before going live, verify the following:

- Use the SDK unless you have a clear reason to integrate directly with the raw API.
- Store secret API keys only in trusted server-side environments.
- Never expose `sk_live_*` or `sk_test_*` keys in browser or mobile code.
- Store ephemeral account secrets securely until ramps complete and recovery is no longer needed.
- Encrypt ephemeral-key backups at rest in production.
- Persist `quoteId`, `rampId`, user/session ID, partner order ID, and webhook IDs.
- Handle quote expiry by creating fresh quotes.
- Use webhooks for transaction lifecycle events and verify every webhook signature.
- Poll `GET /v1/ramp/{id}` for user-facing status screens.
- Test failed, delayed, and retried ramp states in sandbox.
- Define a support process for users who close the app before a ramp finishes.
- Rotate partner keys if they are exposed or no longer needed.

Direct API integrations should also verify that their signing implementation only signs the transactions returned by Vortex for the current ramp and phase. Never sign arbitrary transaction payloads without validating their destination, amount, asset, network, and signer.
