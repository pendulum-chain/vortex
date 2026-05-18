# 8. Widget Integration

The Vortex Widget is a hosted checkout that handles the user-facing ramp UX, signing, and ephemeral key custody for you. It is the recommended path when your application runs in a browser, mobile WebView, or anywhere you cannot run `@vortexfi/sdk` server-side.

## Create A Session

Sessions are created with the partner public key (`pk_*`). No secret key is required.

```http
POST /v1/session/create
Content-Type: application/json
```

```json
{
  "apiKey": "pk_live_...",
  "mode": "auto",
  "rampType": "BUY",
  "from": "pix",
  "to": "polygon",
  "fiatCurrency": "BRL",
  "cryptoCurrency": "USDC",
  "paymentMethod": "pix",
  "destinationAddress": "0x1234567890123456789012345678901234567890",
  "redirectUrl": "https://partner.example.com/ramp/complete"
}
```

The response returns a `sessionId` and a hosted URL.

```json
{
  "sessionId": "session_...",
  "url": "https://widget.vortexfinance.co/?session=session_..."
}
```

## Embed

Open the hosted URL in a popup, iframe, or top-level redirect:

```html
<iframe
  src="https://widget.vortexfinance.co/?session=session_..."
  allow="clipboard-write; payment"
  style="width: 100%; height: 720px; border: 0;"
></iframe>
```

Or as a popup:

```ts
window.open(
  "https://widget.vortexfinance.co/?session=session_...",
  "vortex-widget",
  "width=480,height=760"
);
```

## Quote Modes

### Auto-Refresh Mode (`mode: "auto"`)

The widget creates and refreshes quotes based on the route definition (direction, amount, fiat currency, crypto asset, network, payment method). Use this when you want the user to complete checkout from a route rather than a pinned price.

### Fixed-Quote Mode (`mode: "fixed"`)

Your application creates a quote first (see [6. Quotes And Pricing](./06-quotes-and-pricing.md)) and passes `quoteId` in the session-create request. The widget checks out against that exact quote. Fixed quotes do not refresh; if the quote expires, the user must restart with a fresh quote.

## Receiving Results

Subscribe to widget events through webhooks against the session:

```http
POST /v1/webhook
X-API-Key: sk_live_...
Content-Type: application/json
```

```json
{
  "url": "https://partner.example.com/vortex/webhook",
  "sessionId": "session_...",
  "events": ["TRANSACTION_CREATED", "STATUS_CHANGE"]
}
```

See [7. Webhooks](./07-webhooks.md).

## When To Use The Widget

| Scenario | Use |
|---|---|
| Browser / mobile app, no trusted backend | Widget |
| Trusted Node.js backend, custom UX | `@vortexfi/sdk` |
| Trusted Python backend | `vortex-sdk-python` |
| Other backend stacks | Direct API ([12. AI Agent Integration](./12-ai-agent-integration.md)) |

---
