# FastForex Integration

## What This Does

FastForex is a fiat exchange-rate provider used by `PriceFeedService` for USD-to-fiat conversion in quote, fee, and subsidy math. It is the primary source for fiat currencies without a liquid Binance USDT market, and the secondary source (after Binance) for currencies that have one — currently BRL (see `05-integrations/binance.md`). Vortex calls FastForex for a single forex pair at a time and validates the returned rate before it can affect a quote or conversion.

**Provider type:** Price provider  
**Fiat currencies:** ARS, BRL, COP, EUR, MXN, USD  
**Chains involved:** None directly — the rates feed quote/conversion math before on-chain transactions are built or subsidy caps are evaluated.  
**Phase handlers:** No phase handler calls FastForex directly; handlers call `PriceFeedService.convertCurrency()` when they need USD-denominated caps or conversions.  
**API auth method:** `X-API-Key` header from `FASTFOREX_API_KEY`.

The full provider priority for `getUsdToFiatExchangeRate()` is Binance USDT spot (for currencies with a mapped symbol, currently BRL) → FastForex → CoinGecko. The API request shape is `GET {FASTFOREX_API_URL}/fetch-one?from=USD&to=<FIAT>`. The response is accepted only when `result[<FIAT>]` exists and is a positive finite rate. FastForex rates are sanity-checked against CoinGecko's USDC-to-fiat price when that reference is available. If FastForex is unavailable, missing, invalid, or outside the configured per-currency sanity band, Vortex falls back to CoinGecko. If FastForex returns a valid rate but CoinGecko is unavailable or invalid, Vortex logs the missing sanity check and accepts FastForex rather than making the fallback provider a hard dependency. If no valid provider remains, the conversion fails closed.

## Security Invariants

1. **FastForex credentials MUST be stored as environment variables** — `FASTFOREX_API_KEY` is loaded at startup and sent only in the `X-API-Key` header. It must never appear in source code, query strings, logs, database rows, or API responses.
2. **FastForex endpoint configuration MUST be treated as integrity-sensitive** — `FASTFOREX_API_URL` is not a secret, but a malicious or mistaken value can redirect quote-time forex lookups. Production deployments should pin it to the expected HTTPS FastForex API origin.
3. **FastForex MUST only be used for fiat forex rates** — Callers must request USD-to-fiat rates for supported fiat currencies. Non-fiat targets must be rejected before any provider call.
4. **FastForex responses MUST be validated before use** — The API response must be `2xx`, contain `result[targetCurrency]`, and the rate must be finite and greater than zero.
5. **FastForex rates SHOULD be sanity-checked against an independent reference when available** — A returned rate is compared with CoinGecko's USDC-to-fiat reference when CoinGecko returns a valid positive rate, and rejected when the spread exceeds the configured per-currency limit. CoinGecko outages or invalid reference rates must not make CoinGecko a hard dependency for otherwise valid FastForex rates.
6. **USDC-as-USD fallback risk MUST be understood operationally** — CoinGecko fallback and sanity checks use `usd-coin` as the USD proxy. During a USDC depeg, the fallback/reference may no longer represent real USD fiat FX, so operators should monitor quote availability and rate divergence.
7. **Provider failures MUST fail over safely** — FastForex HTTP errors, invalid responses, missing API key, or sanity-band failures may fall back to CoinGecko. If FastForex is valid but CoinGecko cannot provide the sanity reference, FastForex remains usable with a warning. If no valid provider remains, the quote/conversion path must fail closed rather than returning the original amount or proceeding with an invalid rate.
8. **FastForex rates MUST be cached only briefly** — Accepted fiat rates may be cached for `FIAT_CACHE_TTL_MS`, but stale cache entries must not be used past their expiry.
9. **FastForex MUST NOT be treated as an executable settlement authority** — It only informs pricing math. Actual swap outputs still come from Nabla or Squid, and stored quote amounts remain immutable once created.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **FastForex API key leak** | Attacker obtains `FASTFOREX_API_KEY` from environment or logs and uses the quota or account. | Key is loaded from env and sent in a header; no source-code secret. Rotate through FastForex if exposed. |
| **Endpoint tampering** | `FASTFOREX_API_URL` is pointed at an attacker-controlled endpoint returning favorable rates. | Treat URL config as integrity-sensitive production configuration; when CoinGecko is available, response must pass sanity-band validation before use. |
| **Manipulated forex rate** | Provider returns an incorrect USD-to-fiat rate that would distort quote output, fee conversion, or subsidy cap checks. | Rate must be positive and, when CoinGecko is available, within the configured spread limit. Out-of-band values fall back to CoinGecko. |
| **USDC depeg distorts fallback/reference** | CoinGecko's `usd-coin` fiat price diverges from true USD fiat FX, causing healthy FastForex rates to fail the sanity band or fallback rates to misprice quotes. | Treat the fallback as an emergency USD proxy, monitor spread warnings and missing-sanity-check warnings, and prefer valid FastForex when CoinGecko is unavailable. |
| **FastForex outage** | FastForex is down or returns non-2xx responses during quote creation. | Vortex logs a warning and falls back to CoinGecko. If both providers fail, quote/conversion fails closed. |
| **Stale fiat rates** | A cached forex rate persists long enough to misprice volatile fiat corridors. | Fiat cache uses `FIAT_CACHE_TTL_MS`; expired entries trigger a fresh provider lookup. |
| **Secret leakage through query params** | API key is accidentally placed in the FastForex URL where proxies can log it. | Implementation sends `FASTFOREX_API_KEY` in the `X-API-Key` header, not the query string. |

## Audit Checklist

- [x] FastForex API credential is loaded from environment variables. **PASS** — `config.priceProviders.fastforex.apiKey` reads `FASTFOREX_API_KEY`.
- [x] FastForex API key is sent in the `X-API-Key` header, not in query parameters. **PASS** — `getFastforexRate()` sets the header only when a key is configured.
- [x] FastForex URL is configurable but defaults to HTTPS. **PASS** — `FASTFOREX_API_URL` defaults to `https://api.fastforex.io`.
- [x] Non-fiat targets are rejected before fetching. **PASS** — `getUsdToFiatExchangeRate()` checks `isFiatToken(targetCurrency)`.
- [x] USD target returns `1` without calling external providers. **PASS** — `getUsdToFiatExchangeRate("USD")` short-circuits.
- [x] FastForex response status and rate are validated. **PASS** — non-OK responses throw; missing, zero, or negative rates throw.
- [x] FastForex rates are sanity-checked against CoinGecko when the reference is available. **PASS** — `assertRateWithinSanityBand("fastforex", ...)` compares the spread with per-currency limits when CoinGecko returns a valid reference; otherwise it warns and accepts the valid FastForex rate. The same helper guards Binance rates.
- [x] FastForex failures fall back to CoinGecko. **PASS** — failures are caught and logged before requesting the CoinGecko fallback.
- [x] CoinGecko fallback/reference uses USDC as the USD proxy. **PASS / OPERATIONAL RISK** — accepted by current code, but operators should monitor depeg conditions because this is not a pure fiat FX reference.
- [x] Both-provider failure fails closed. **PASS** — `convertCurrency()` rethrows provider failures instead of returning the original amount.
- [x] Accepted fiat rates use the configured short cache TTL. **PASS** — `fiatExchangeRateCache` entries expire after `FIAT_CACHE_TTL_MS`.
- [x] No FastForex secret is logged. **PASS** — logs include provider URL and error context, not `FASTFOREX_API_KEY`.
