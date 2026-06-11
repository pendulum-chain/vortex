# Quotes And Pricing

Quotes are the entry point for every Vortex ramp. A quote pins down the route, input amount, expected output, fee breakdown, payment method, network, and expiry timestamp. Once you register a ramp against a quote, the quote is consumed; you cannot reuse it.

## Endpoints

- `POST /v1/quotes` — create a quote for a known route and network.
- `POST /v1/quotes/best` — let Vortex pick the best eligible route for an amount and currency pair.
- `GET /v1/quotes/{id}` — fetch a previously created quote. Public; do not treat quote IDs as confidential, but also do not expose them unnecessarily.

`POST /v1/quotes/best` is not currently called by `@vortexfi/sdk`. Call it directly when you want Vortex to choose the route, then pass the returned quote into `sdk.registerRamp(quote, …)`.

## Creating A Quote

```http
POST /v1/quotes
Content-Type: application/json
```

```json
{
  "rampType": "BUY",
  "from": "pix",
  "to": "polygon",
  "inputAmount": "150",
  "inputCurrency": "BRL",
  "outputCurrency": "USDC",
  "apiKey": "pk_live_..."
}
```

- `rampType` is `"BUY"` (onramp, fiat → crypto) or `"SELL"` (offramp, crypto → fiat).
- `from` / `to` are either a fiat rail (`"pix"`, `"sepa"`) or a network identifier (`"polygon"`, `"base"`, `"ethereum"`, `"arbitrum"`, `"bsc"`, `"avalanche"`, `"assethub"`, `"stellar"`, `"moonbeam"`).
- `inputAmount` is a decimal string in the smallest commonly used unit of `inputCurrency` (e.g. `"150"` for 150 BRL, `"100"` for 100 USDC). Do not pass raw chain base units.
- `apiKey` (optional) is the partner public key `pk_live_*` / `pk_test_*`. Required for partner attribution and discount eligibility.

## Quote Response

```json
{
  "id": "quote_...",
  "rampType": "BUY",
  "from": "pix",
  "to": "polygon",
  "inputAmount": "150",
  "inputCurrency": "BRL",
  "outputAmount": "27.41",
  "outputCurrency": "USDC",
  "fee": {
    "network": "0.42",
    "anchor": "1.50",
    "vortex": "0.75",
    "partner": "0.00",
    "total": "2.67",
    "currency": "BRL"
  },
  "expiresAt": "2025-05-18T12:35:00.000Z"
}
```

- All monetary fields are decimal strings, not numbers; preserve them as strings end-to-end.
- `fee.currency` is the currency in which the fee fields are denominated.
- `expiresAt` is short (typically a few minutes). Register the ramp promptly or request a new quote.

## Best-Quote Selection

```http
POST /v1/quotes/best
```

Same request body as `POST /v1/quotes`, except `to` (for buys) or `from` (for sells) may be omitted; Vortex evaluates eligible routes and returns a single quote optimized for the input amount. The response shape matches `POST /v1/quotes`.

To restrict the search to a subset of chains (for example when you only support a fixed set of destination networks), pass an optional `networks` array of network identifiers. When omitted or empty, Vortex evaluates all eligible networks for the corridor; when provided, the search is intersected with the whitelist and a `400` is returned if the intersection is empty or if any entry is not a known network identifier.

```json
{
  "rampType": "BUY",
  "from": "pix",
  "inputAmount": "100",
  "inputCurrency": "BRL",
  "outputCurrency": "USDC",
  "networks": ["base", "polygon"]
}
```

## Quote Error Handling

Expected route-availability failures are returned as `500` responses with a user-facing message. The HTTP status reflects that the route exists but current pool or route liquidity cannot serve the requested amount. The `type: "BAD_REQUEST"` field is provider-style compatibility metadata, not the HTTP status; clients should treat this as a user-correctable liquidity failure and ask the user to try a smaller amount or check back soon. Both `POST /v1/quotes` and `POST /v1/quotes/best` can return:

```json
{
  "code": 500,
  "message": "This route is temporarily unavailable due to low liquidity. Please try a smaller amount or check back soon.",
  "statusCode": 500,
  "type": "BAD_REQUEST"
}
```

For `POST /v1/quotes/best`, this low-liquidity response is returned when every eligible candidate route fails because of liquidity. Unexpected provider or calculation errors remain internal failures and should be retried or escalated with the response request ID if they persist.

## Quote Expiry

Quotes are immutable and short-lived. If the user takes too long to confirm, or if you delay before calling `POST /v1/ramp/register`, the quote expires and the register call rejects it. Catch the expiry error, create a fresh quote, and re-prompt the user before registering.

## Partner Pricing

Pass the partner public key as `apiKey` in the quote body to apply partner pricing and attribution. When a ramp later specifies a `partnerId`, the request must be authenticated with the matching partner secret key in `X-API-Key`. See [Authentication And Partner Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys).

---
