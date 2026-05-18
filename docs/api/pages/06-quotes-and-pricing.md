# 6. Quotes And Pricing

Quotes are the entry point for ramp execution. A quote defines the route, amount, fees, expected output, payment method, network, and expiry.

Use `POST /v1/quotes` when you know the route and network. Use `POST /v1/quotes/best` when you want Vortex to compare eligible routes and select the best available quote. `GET /v1/quotes/{id}` is public, so do not treat quote IDs as confidential even though they are not meant to be exposed unnecessarily.

The quote response includes fee fields in fiat and USD terms. These may include network fees, anchor/provider fees, Vortex fees, partner fees, total fees, and processing fees.

Quotes should be treated as immutable. After a quote is created, use the quote ID to register a ramp. Do not assume a quote remains valid indefinitely. If a quote expires, create a fresh quote.

For partner pricing and attribution, pass the partner public key as `apiKey`. If the request includes `partnerId`, authenticate with the matching partner secret key in `X-API-Key`.

---
