/**
 * External API contract: CoinGecko price feed (docs/features/contract-tests.md).
 *
 * Unlike the anchor fakes, FakePrices patches PriceFeedService's methods *above*
 * the HTTP seam (it never produces wire JSON), so the verified-fake half is
 * fixture-based here: the hermetic tests pin the schema's accept/reject behavior,
 * and drift detection comes entirely from the live half (plus, later, warn-only
 * production parsing per Milestone 5).
 *
 * The live half mirrors getCryptoPrice's request construction: the ids/currencies
 * requested are the ones production actually asks for ("usd-coin" as the USD proxy
 * for the CoinGecko fiat fallback with vs_currencies mxn/cop/ars, and tokenIdMap
 * entries like "ethereum" priced in usd). No credentials are strictly required:
 * with COINGECKO_API_KEY set it uses the configured (pro) base URL like production,
 * otherwise it falls back to the keyless public API. The two API tiers no longer
 * serve the same currencies: CoinGecko dropped COP from the public API (observed
 * 2026-07-23 — /simple/supported_vs_currencies lost "cop" and keyless simple/price
 * omits the key), while the pro API production uses still returns it. COP presence
 * is therefore asserted only when a key is configured; run the nightly with
 * COINGECKO_API_KEY set so this contract keeps guarding the COP sanity-band
 * reference and last-resort fallback production actually consumes.
 *
 * Binance spot is the primary USD rate source for the currencies mapped in
 * PriceFeedService's BINANCE_USDT_FIAT_SYMBOLS (mirrored below): its live half
 * asserts each mapped ticker still exists and serves a usable price, so a
 * delisted market alerts the nightly instead of silently degrading to fastforex.
 */
import { describe, expect, test } from "bun:test";
import { coingeckoSimplePriceResponseSchema } from "../../api/services/priceFeed.schemas";
import { assertLiveCoverage, runLive } from "../../test-utils/contract-support";

const RUN_LIVE = !!process.env.RUN_LIVE_TESTS;

const REQUESTED_IDS = ["usd-coin", "ethereum"];
const REQUESTED_CURRENCIES = ["usd", "mxn", "cop", "ars"];
// Pro-only on CoinGecko since ~2026-07 (see header); asserted only when a key is set.
const PRO_ONLY_CURRENCIES = ["cop"];

// Mirrors BINANCE_USDT_FIAT_SYMBOLS in priceFeed.service.ts.
const BINANCE_SYMBOLS: Record<string, string> = {
  BRL: "USDTBRL",
  COP: "USDTCOP"
};

describe("CoinGecko external API contract — hermetic (fixtures)", () => {
  test("accepts the consumed simple/price shape including unknown keys", () => {
    const body = {
      ethereum: { last_updated_at: 1751882400, usd: 2500.12 },
      "usd-coin": { ars: 1000, cop: 4000, mxn: 17.2, usd: 1.0 }
    };
    expect(() => coingeckoSimplePriceResponseSchema.parse(body)).not.toThrow();
  });

  test("rejects non-numeric prices", () => {
    expect(() => coingeckoSimplePriceResponseSchema.parse({ "usd-coin": { usd: "1.0" } })).toThrow();
    expect(() => coingeckoSimplePriceResponseSchema.parse({ "usd-coin": null })).toThrow();
  });
});

describe.skipIf(!RUN_LIVE)("CoinGecko external API contract — live", () => {
  test(
    "GET /simple/price response satisfies the consumed contract",
    async () => {
      const { config } = await import("../../config/vars");
      const apiKey = config.priceProviders.coingecko.apiKey;
      const baseUrl = apiKey ? config.priceProviders.coingecko.baseUrl : "https://api.coingecko.com/api/v3";

      const body = await runLive("coingecko simple/price", async () => {
        const url = new URL(`${baseUrl}/simple/price`);
        url.searchParams.append("ids", REQUESTED_IDS.join(","));
        url.searchParams.append("vs_currencies", REQUESTED_CURRENCIES.join(","));
        const headers: HeadersInit = { Accept: "application/json" };
        if (apiKey) headers["x-cg-pro-api-key"] = apiKey;
        const response = await fetch(url.toString(), { headers });
        if (!response.ok) {
          throw new Error(`CoinGecko API error: ${response.status} ${await response.text()}`);
        }
        return (await response.json()) as unknown;
      });
      if (!body) return; // inconclusive — see test-utils/contract-support.ts

      const parsed = coingeckoSimplePriceResponseSchema.parse(body);
      // getCryptoPrice throws when a requested id/currency key is absent — presence
      // of what was asked for is part of the consumed contract.
      for (const id of REQUESTED_IDS) {
        expect(parsed[id]).toBeDefined();
        expect(parsed[id]?.usd).toBeGreaterThan(0);
      }
      const expectedCurrencies = apiKey
        ? REQUESTED_CURRENCIES
        : REQUESTED_CURRENCIES.filter(currency => !PRO_ONLY_CURRENCIES.includes(currency));
      for (const currency of expectedCurrencies) {
        expect(parsed["usd-coin"]?.[currency]).toBeGreaterThan(0);
      }
    },
    60_000
  );
});

describe.skipIf(!RUN_LIVE)("Binance external API contract — live", () => {
  test(
    "GET /api/v3/ticker/price serves every mapped USDT-fiat symbol",
    async () => {
      const { config } = await import("../../config/vars");
      for (const symbol of Object.values(BINANCE_SYMBOLS)) {
        const body = await runLive(`binance ticker ${symbol}`, async () => {
          const url = new URL("api/v3/ticker/price", `${config.priceProviders.binance.baseUrl}/`);
          url.searchParams.append("symbol", symbol);
          const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
          if (!response.ok) {
            throw new Error(`Binance API error for ${symbol}: ${response.status} ${await response.text()}`);
          }
          return (await response.json()) as { symbol: string; price: string };
        });
        if (!body) continue; // inconclusive (e.g. geo-blocked egress) — see test-utils/contract-support.ts

        // getBinanceUsdtToFiatRate rejects a mismatched symbol or non-positive price,
        // so both are part of the consumed contract.
        expect(body.symbol).toBe(symbol);
        expect(Number(body.price)).toBeGreaterThan(0);
      }
    },
    60_000
  );
});

test.skipIf(!RUN_LIVE)("live contract coverage actually ran", () => {
  assertLiveCoverage();
});
