# Binance Integration

## What This Does

Binance's public spot ticker is the **primary** USD-to-fiat rate source in `PriceFeedService` for fiat currencies that have a liquid Binance USDT market. Currently only BRL is mapped, via the `USDTBRL` symbol. The USDT price is treated as USD (consistent with the platform's USD-like stablecoin 1:1 model), so `USDTBRL` yields the USD→BRL rate. This rate reflects the crypto spot price Brazilian users actually transact at, which can diverge from the official fiat FX mid-market rate returned by FastForex.

**Provider type:** Price provider (crypto spot exchange)
**Fiat currencies:** BRL (only currency with a mapped Binance symbol)
**Chains involved:** None directly — the rate feeds quote/conversion math before on-chain transactions are built or subsidy caps are evaluated.
**Phase handlers:** No phase handler calls Binance directly; handlers call `PriceFeedService.convertCurrency()` when they need USD-denominated caps or conversions.
**API auth method:** None — the public `GET {BINANCE_API_URL}/api/v3/ticker/price?symbol=<SYMBOL>` endpoint requires no key.

Provider priority for `getUsdToFiatExchangeRate()` is Binance USDT spot (mapped currencies) → FastForex → CoinGecko. The response is accepted only when `price` parses to a positive finite number. The Binance rate is sanity-checked against CoinGecko's USDC-to-fiat reference with the same per-currency spread band used for FastForex. If Binance is unavailable, invalid, or outside the sanity band, Vortex logs a warning and falls back to FastForex, then CoinGecko. If no valid provider remains, the conversion fails closed.

## Security Invariants

1. **Binance endpoint configuration MUST be treated as integrity-sensitive** — `BINANCE_API_URL` is not a secret, but a malicious or mistaken value can redirect quote-time rate lookups. Production deployments should pin it to the expected HTTPS Binance API origin. No API key is sent, so there is no Binance credential to leak.
2. **Binance MUST only be used where a symbol is explicitly mapped** — Only currencies in `BINANCE_USDT_FIAT_SYMBOLS` (currently `BRL: "USDTBRL"`) query Binance. Any other fiat skips Binance and uses FastForex, so an unmapped or illiquid market is never silently priced.
3. **Binance responses MUST be validated before use** — The response must be `2xx` and `Number(price)` must be finite and greater than zero; otherwise the rate is rejected and the next provider is tried.
4. **Binance rates MUST be sanity-checked against an independent reference when available** — The rate is compared with CoinGecko's USDC-to-fiat reference via `assertRateWithinSanityBand("Binance", ...)` and rejected when the spread exceeds the configured per-currency limit (`FIAT_SANITY_SPREAD_LIMITS`, 2% for BRL). CoinGecko outages or invalid reference rates must not make CoinGecko a hard dependency for an otherwise valid Binance rate.
5. **Provider failures MUST fail over safely** — Binance HTTP errors, invalid responses, or sanity-band failures fall through to FastForex and then CoinGecko. If no valid provider remains, the quote/conversion path must fail closed rather than returning the original amount or proceeding with an invalid rate.
6. **Binance rates MUST be cached only briefly** — Accepted rates share the fiat cache keyed by `USD:<FIAT>` and expire after `FIAT_CACHE_TTL_MS`; stale entries must not be used past their expiry.
7. **Binance MUST NOT be treated as an executable settlement authority** — It only informs pricing math. Actual swap outputs still come from Nabla or Squid, and stored quote amounts remain immutable once created.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Endpoint tampering** | `BINANCE_API_URL` is pointed at an attacker-controlled endpoint returning favorable rates. | Treat URL config as integrity-sensitive production configuration; when CoinGecko is available, the response must pass sanity-band validation before use, and out-of-band values fall back to FastForex. |
| **Manipulated / thin-market spot price** | The `USDTBRL` book is briefly manipulated or the ticker returns an anomalous price that would distort quote output, fee conversion, or subsidy cap checks. | Rate must be positive and, when CoinGecko is available, within the configured spread limit; out-of-band values fall back to FastForex then CoinGecko. |
| **USDC depeg distorts reference** | CoinGecko's `usd-coin` fiat price diverges from true USD, causing a healthy Binance rate to fail the sanity band or vice versa. | Treat the reference as an emergency USD proxy; monitor spread warnings and missing-sanity-check warnings. |
| **Binance outage** | Binance is down or returns non-2xx responses during quote creation. | Vortex logs a warning and falls back to FastForex, then CoinGecko. If all providers fail, quote/conversion fails closed. |
| **Stale rates** | A cached rate persists long enough to misprice a volatile corridor. | Fiat cache uses `FIAT_CACHE_TTL_MS`; expired entries trigger a fresh provider lookup. |

## Audit Checklist

- [x] Binance URL is configurable but defaults to HTTPS. **PASS** — `BINANCE_API_URL` defaults to `https://api.binance.com`.
- [x] No credential is sent to Binance. **PASS** — `getBinanceUsdtToFiatRate()` sends only an `Accept` header on a public endpoint.
- [x] Only mapped symbols query Binance. **PASS** — `getUsdToFiatExchangeRate()` calls Binance only when `BINANCE_USDT_FIAT_SYMBOLS[targetCurrency]` is set; `getBinanceUsdtToFiatRate()` throws for unmapped currencies.
- [x] Binance response status and price are validated. **PASS** — non-OK responses throw; a non-finite or non-positive `price` throws.
- [x] Binance rates are sanity-checked against CoinGecko when the reference is available. **PASS** — `assertRateWithinSanityBand("Binance", ...)` compares the spread with per-currency limits; otherwise it warns and accepts the valid Binance rate.
- [x] Binance failures fall back to FastForex then CoinGecko. **PASS** — failures are caught and logged before the FastForex/CoinGecko path runs.
- [x] All-provider failure fails closed. **PASS** — `convertCurrency()` rethrows provider failures instead of returning the original amount.
- [x] Accepted rates use the configured short cache TTL. **PASS** — `fiatExchangeRateCache` entries expire after `FIAT_CACHE_TTL_MS`.
- [x] A geo-block or outage is observable, not silent. **PASS** — `verifyBinanceReachability()` runs at startup (`index.ts`) and logs an error for each unreachable mapped market, so a silent fallback to the fiat rate can be detected operationally.
