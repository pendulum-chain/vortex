# 8. Widget Integration

The Vortex Widget provides a hosted checkout experience for buy and sell flows. It is useful when you want Vortex to handle more of the user-facing ramp flow instead of building the complete SDK experience yourself.

Widget sessions are created via `POST /v1/session/create`, which accepts an `apiKey` (`pk_*`) in the body for attribution. No secret key is required to create a session.

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
