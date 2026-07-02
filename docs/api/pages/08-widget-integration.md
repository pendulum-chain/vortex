# Widget Integration

The Vortex Widget is a hosted checkout that handles the user-facing ramp UX, signing, and ephemeral key custody for you. It is the recommended path when your application runs in a browser, mobile WebView, or anywhere you cannot run `@vortexfi/sdk` server-side.

## Endpoint

```
POST /v1/session/create
```

This single endpoint creates a widget session and returns a hosted URL. It supports two mutually exclusive request shapes depending on whether you already have a quote.

Authentication: pass your partner public key (`pk_live_*` / `pk_test_*`) as `apiKey` in the body for attribution. No secret key is required to create a session.

`externalSessionId` is **required in both modes**. It is your own opaque identifier for the session and is echoed back in [webhook payloads](https://api-docs.vortexfinance.co/webhooks) so you can correlate events to your records.

## Mode A: Fixed Quote

Use this when your application has already created a quote via `POST /v1/quotes` and wants the widget to lock in that exact price.

```http
POST /v1/session/create
Content-Type: application/json
```

```json
{
  "quoteId": "quote_01HXY...",
  "externalSessionId": "my-session-id",
  "callbackUrl": "https://partner.example.com/ramp/complete",
  "walletAddressLocked": "0x1234567890123456789012345678901234567890"
}
```

### Fields

| Field | Required | Description |
|---|---|---|
| `quoteId` | **yes** | ID of an existing quote (`POST /v1/quotes`). The widget locks in this quote and will not refresh it. |
| `externalSessionId` | **yes** | Your opaque session identifier. Returned in webhook payloads. |
| `callbackUrl` | no | URL the widget redirects to after the user successfully creates the transaction. |
| `walletAddressLocked` | no | Lock the destination wallet address in the widget UI so the user cannot edit it. |

The quote does **not refresh automatically**. If it expires before the user completes checkout, the user must close the widget and your application must create a fresh quote and a fresh session.

Response: `200 OK`

```json
{ "url": "https://www.vortexfinance.co/widget?externalSessionId=my-session-id&quoteId=quote_01HXY..." }
```

## Mode B: Auto-Refresh

Use this when you want the widget to handle quoting for you. You pass the route definition; the widget creates and refreshes quotes on demand for the user.

```http
POST /v1/session/create
Content-Type: application/json
```

```json
{
  "externalSessionId": "my-session-id",
  "rampType": "BUY",
  "network": "polygon",
  "inputAmount": "150",
  "fiat": "BRL",
  "cryptoLocked": "USDC",
  "paymentMethod": "pix",
  "apiKey": "pk_live_...",
  "callbackUrl": "https://partner.example.com/ramp/complete",
  "walletAddressLocked": "0x1234567890123456789012345678901234567890"
}
```

### Fields

| Field | Required | Description |
|---|---|---|
| `externalSessionId` | **yes** | Your opaque session identifier. Returned in webhook payloads. |
| `rampType` | **yes** | `"BUY"` (fiat → crypto) or `"SELL"` (crypto → fiat). |
| `network` | **yes** | EVM or Substrate network for the crypto leg (e.g. `"polygon"`, `"base"`, `"assethub"`). |
| `inputAmount` | **yes** | Decimal string in the smallest commonly used unit of the input currency (e.g. `"150"` for 150 BRL). |
| `fiat` | no | Fiat currency for the fiat leg (e.g. `"BRL"`). Required in practice for fiat-side ramps. |
| `cryptoLocked` | no | Pre-selects and locks the crypto asset in the widget (e.g. `"USDC"`). |
| `paymentMethod` | no | Payment rail (e.g. `"pix"`). Required in practice for buy flows. |
| `apiKey` | no | Partner public key `pk_live_*` / `pk_test_*` used for attribution and partner pricing on the quotes the widget creates. |
| `countryCode` | no | ISO-3166 alpha-2 country code to pre-filter eligible options. |
| `partnerId` | no | Partner identifier for attribution. |
| `callbackUrl` | no | URL the widget redirects to after the user successfully creates the transaction. |
| `walletAddressLocked` | no | Lock the destination wallet address in the widget UI so the user cannot edit it. |

Vortex validates the route on session creation by attempting to create a probe quote with the supplied parameters; invalid combinations return `400`.

Response: `201 Created`

```json
{ "url": "https://www.vortexfinance.co/widget?externalSessionId=my-session-id&rampType=BUY&network=polygon&inputAmount=150&fiat=BRL&cryptoLocked=USDC&paymentMethod=pix" }
```

## Which Mode Goes With Which Fields

| If you have a `quoteId` | Use **Mode A** (Fixed Quote). Do not include any auto-refresh route fields. |
|---|---|
| If you do **not** have a `quoteId` | Use **Mode B** (Auto-Refresh). You must include the route definition fields. |

The request body shape is detected by the presence of `quoteId`. Mixing fields between the two modes is not supported.

## Embed The Widget URL

Open the returned URL in a popup, iframe, or top-level redirect.

```html
<iframe
  src="https://www.vortexfinance.co/widget?externalSessionId=my-session-id&quoteId=quote_01HXY..."
  allow="clipboard-write; payment"
  style="width: 100%; height: 720px; border: 0;"
></iframe>
```

```js
window.open(
  "https://www.vortexfinance.co/widget?externalSessionId=my-session-id&quoteId=quote_01HXY...",
  "vortex-widget",
  "width=480,height=760"
);
```

## Receiving Results

Subscribe to widget events through [webhooks](https://api-docs.vortexfinance.co/webhooks) using the session identifier:

```http
POST /v1/webhook
X-API-Key: sk_live_...
Content-Type: application/json
```

```json
{
  "url": "https://partner.example.com/vortex/webhook",
  "sessionId": "my-session-id",
  "events": ["TRANSACTION_CREATED", "STATUS_CHANGE"]
}
```

Webhook payloads include the `sessionId` so you can correlate events back to your `externalSessionId`.

## When To Use The Widget

| Scenario | Use |
|---|---|
| Browser / mobile app, no trusted backend | Widget |
| Trusted Node.js backend, custom UX | `@vortexfi/sdk` |
| Trusted Python backend | `vortex-sdk-python` |
| Other backend stacks | Direct API ([AI Agent Integration](https://api-docs.vortexfinance.co/ai-agent-integration)) |

---
