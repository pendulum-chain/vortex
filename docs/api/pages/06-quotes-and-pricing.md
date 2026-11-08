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
X-Public-Key: pk_live_...
```

```json
{
  "rampType": "BUY",
  "from": "pix",
  "to": "polygon",
  "inputAmount": "150",
  "inputCurrency": "BRL",
  "outputCurrency": "USDC"
}
```

- `rampType` is `"BUY"` (onramp, fiat → crypto) or `"SELL"` (offramp, crypto → fiat).
- `from` / `to` are either a fiat rail (`"pix"`, `"sepa"`, `"ach"`, `"spei"`, `"cbu"`) or a network identifier (`"polygon"`, `"base"`, `"ethereum"`, `"arbitrum"`, `"bsc"`, `"avalanche"`, `"robinhood"`, `"assethub"`, `"stellar"`, `"moonbeam"`). `"ach"` serves USD and COP, `"spei"` serves MXN, and `"cbu"` serves ARS; see [Fiat Corridors](https://api-docs.vortexfinance.co/fiat-corridors).
- `inputAmount` is a decimal string in the smallest commonly used unit of `inputCurrency` (e.g. `"150"` for 150 BRL, `"100"` for 100 USDC). Do not pass raw chain base units.
- `X-Public-Key` (optional) carries the public half of one API credential for attribution and discount eligibility. The legacy body `apiKey` field remains accepted for quote compatibility; if both are sent, their values must match.

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
  "network": "polygon",
  "paymentMethod": "pix",
  "networkFeeFiat": "0.42",
  "anchorFeeFiat": "1.50",
  "vortexFeeFiat": "0.75",
  "partnerFeeFiat": "0.00",
  "processingFeeFiat": "2.25",
  "totalFeeFiat": "2.67",
  "feeCurrency": "BRL",
  "networkFeeUsd": "0.08",
  "anchorFeeUsd": "0.28",
  "vortexFeeUsd": "0.14",
  "partnerFeeUsd": "0.00",
  "processingFeeUsd": "0.42",
  "totalFeeUsd": "0.50",
  "expiresAt": "2026-07-10T12:35:00.000Z"
}
```

- All monetary fields are decimal strings, not numbers; preserve them as strings end-to-end.
- Fees are flattened into per-component fields, each provided twice: once denominated in `feeCurrency` (the `*Fiat` fields) and once in USD (the `*Usd` fields). `processingFee` is the sum of the anchor and Vortex components.
- When a quote-time discount applies, optional `discountFiat`, `discountUsd`, and `discountCurrency` fields are present.
- `expiresAt` is short (typically a few minutes). Register the ramp promptly or request a new quote.

## Stock Tokens

Where enabled, the `"robinhood"` network quotes stock tokens against BRL over PIX, in both directions. Identify the token by its symbol rather than its contract address. `GET /v1/supported-cryptocurrencies?network=robinhood` lists the symbols, their addresses, and the directions currently enabled.

```json
{
  "rampType": "BUY",
  "from": "pix",
  "to": "robinhood",
  "network": "robinhood",
  "inputAmount": "150",
  "inputCurrency": "BRL",
  "outputCurrency": "NVDA",
  "destinationAddress": "0x1234567890abcdef1234567890abcdef12345678"
}
```

- A BUY delivers exactly `outputAmount` to the wallet, and then native gas if the wallet needs it. `destinationAddress` sizes this gas reserve for that wallet, and registration must use the same address; without it, the quote charges the full reserve. The reserve is included in the network fee and reported by the optional `gasReserveAmount` (ETH as a plain decimal string, such as `0.00005`), `gasReserveCurrency`, `gasReserveFiat`, and `gasReserveUsd` fields, which `GET /v1/ramp/{id}` also returns. They are omitted when no reserve is due.
- A SELL moves exactly `inputAmount`, which can have up to 18 decimals and is echoed unchanged. `gasless: true` means the token supports a permit, so the seller needs no native gas: registration issues that permit, or answers 503 if it can no longer be read. With `gasless: false`, registration normally issues a single wallet transfer, which needs native gas, so read the returned transactions.
- `routingStrategy` and `providerCosts` are present only on these quotes. `providerCosts` itemizes each leg: rows with `includedIn: "fees"` add up to the total fee less the gas reserve, and rows with `includedIn: "rate"` are signed estimates already reflected in the output amount.
- A `400` means the direction is not enabled or the token is not on the allowlist. A `503` means the issuer has paused the token, or its market price is unavailable or too far from the route's price. Retry a `503` later with a new quote. A `429` means this IP address requested more than 20 of these quotes within a minute.
- `POST /v1/quotes/best` never evaluates this network, and partner credentials do not change its pricing.

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

Expected route-availability failures are returned as `500` responses with a user-facing message. The HTTP status reflects that the route exists but current pool or route liquidity cannot serve the requested amount. Clients should treat this as a user-correctable liquidity failure and ask the user to try a smaller amount or check back soon. Both `POST /v1/quotes` and `POST /v1/quotes/best` can return:

```json
{
  "code": 500,
  "message": "This route is temporarily unavailable due to low liquidity. Please try a smaller amount or check back soon."
}
```

For `POST /v1/quotes/best`, this low-liquidity response is returned when every eligible candidate route fails because of liquidity. Unexpected provider or calculation errors remain internal failures and should be retried or escalated with the response request ID if they persist.

## Quote Expiry

Quotes are immutable and short-lived. If the user takes too long to confirm, or if you delay before calling `POST /v1/ramp/register`, the quote expires and the register call rejects it. Catch the expiry error, create a fresh quote, and re-prompt the user before registering.

## Partner Pricing

Pass the credential's public value through `X-Public-Key` to apply partner pricing and attribution. The SDK also retains it in the quote body for compatibility. When `X-Public-Key` and `X-API-Key` are both present, they must belong to the same credential or Vortex returns `403 CREDENTIAL_MISMATCH`. See [Authentication And API Credentials](https://api-docs.vortexfinance.co/authentication-and-partner-keys).

Managed profiles default to the controlling manager profile's pricing assignment. Assigning pricing directly to a managed child overrides the manager's pricing just as a profile assignment does for any regular profile. The same precedence applies whether the manager delegates with `X-Managed-Profile-Id` or the child authenticates with its own credential: child assignment, manager assignment, then default Vortex pricing.

---
