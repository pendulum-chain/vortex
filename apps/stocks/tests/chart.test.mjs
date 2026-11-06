import assert from "node:assert/strict";
import test from "node:test";
import { CHART_PERIODS, CHART_TTL_MS, MAX_CHART_ENTRIES, availablePeriods, buildChartUrl, chartCaptionPt, chartWindow, createChartLoader, demoSeries, maxPeriodLabelPt } from "../src/lib/chart.js";
import { STOCK_TOKENS, findStock } from "../src/lib/stocks.js";
import { chartKey } from "../src/lib/stores.js";
import { forbiddenFetch, json, jsonMemory } from "./helpers.mjs";

const T0 = Date.parse("2026-09-28T15:00:00Z");
const DAY = 86_400_000;
const series = (length) => Array.from({ length }, (_, index) => ({ t: T0 - (length - 1 - index) * DAY, value: 100 + index }));
const chartBody = (length) => ({ prices: series(length).map((point) => [point.t, point.value]) });

test("the chart call is the daily one-year BRL series (Gold's call shape)", () => {
  const url = buildChartUrl("nvidia-xstock");
  assert.equal(url, "https://api.coingecko.com/api/v3/coins/nvidia-xstock/market_chart?vs_currency=brl&days=365&interval=daily");
});

test("periods depend on the series length; \"Máx.\" replaces 1A when shorter; fewer than 2 points is none", () => {
  assert.deepEqual([...CHART_PERIODS], ["7D", "30D", "3M", "1A"]);
  assert.deepEqual(availablePeriods(series(366)), ["7D", "30D", "3M", "1A"]);
  assert.deepEqual(availablePeriods(series(112)), ["7D", "30D", "3M", "Máx."]); // MU proxy since 2026-06-04
  assert.deepEqual(availablePeriods(series(75)), ["7D", "30D", "Máx."]); // NU token since 2026-07-10
  assert.deepEqual(availablePeriods(series(2)), ["Máx."]);
  assert.deepEqual(availablePeriods(series(1)), []);
  assert.deepEqual(availablePeriods([]), []);
  assert.equal(maxPeriodLabelPt([{ t: Date.parse("2026-06-12T12:00:00Z"), value: 1 }]), "Máx. (desde jun/2026)");
});

test("a window shows the last N points and its change over the whole window (Gold)", () => {
  const year = series(366);
  const week = chartWindow(year, "7D");
  assert.equal(week.points.length, 8);
  assert.equal(week.change, ((465 - 458) / 458) * 100);
  assert.equal(chartWindow(year, "3M").points.length, 91);
  assert.equal(chartWindow(year, "1A").change, 365);
  assert.equal(chartWindow(series(112), "Máx.").points.length, 112);
  assert.equal(chartWindow([], "7D").change, 0);
});

test("charts load lazily, are cached 6 h and survive a 429 with the cache", async () => {
  let time = T0;
  const calls = [];
  let status = 200;
  const fetchImpl = async (url) => { calls.push(url); return status === 200 ? json(chartBody(366)) : new Response("{}", { status }); };
  const { storage } = jsonMemory();
  const loader = createChartLoader({ storage, fetchImpl, now: () => time });
  assert.equal(calls.length, 0, "nothing is prefetched");
  const first = await loader.load("NVDA");
  assert.equal(first.status, "ok");
  assert.equal(first.source, "xstocks-proxy");
  assert.equal(first.points.length, 366);
  assert.equal(calls.length, 1);
  assert.ok(storage.get(chartKey("nvidia-xstock")));
  time += CHART_TTL_MS;
  await loader.load("NVDA");
  assert.equal(calls.length, 1, "still cached at 6 h");
  time += 1;
  status = 429;
  const limited = await loader.load("NVDA");
  assert.equal(limited.status, "ok");
  assert.equal(limited.stale, true, "an expired chart beats no chart");
  assert.equal(calls.length, 2);
  const other = await loader.load("AAPL");
  assert.equal(other.status, "rate_limited", "cool-down after a 429: no new request");
  assert.equal(calls.length, 2);
  assert.ok(other.retryAt > time);
});

test("an empty proxy series falls back to the token's own series; nothing usable is unavailable", async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return json(url.includes("robinhood-tokenized-stock") ? chartBody(40) : chartBody(0)); };
  const loader = createChartLoader({ storage: jsonMemory().storage, fetchImpl, now: () => T0 });
  const result = await loader.load("TSLA");
  assert.equal(result.status, "ok");
  assert.equal(result.source, "token");
  assert.equal(result.coingeckoId, "tesla-robinhood-tokenized-stock");
  assert.equal(calls.length, 2);
  const none = createChartLoader({ storage: jsonMemory().storage, fetchImpl: async () => json(chartBody(1)), now: () => T0 });
  assert.deepEqual(await none.load("AAPL"), { status: "unavailable", retryAt: null });
  const broken = createChartLoader({ storage: jsonMemory().storage, fetchImpl: async () => new Response("", { status: 500 }), now: () => T0 });
  assert.equal((await broken.load("AAPL")).status, "unavailable");
  assert.equal((await broken.load("UNKNOWN")).status, "unavailable");
});

test("at most 8 series stay cached (oldest evicted)", async () => {
  let time = T0;
  const { storage } = jsonMemory();
  const loader = createChartLoader({ storage, fetchImpl: async () => json(chartBody(10)), now: () => time });
  for (const token of STOCK_TOKENS) { time += 1000; await loader.load(token); }
  const cached = STOCK_TOKENS.filter((token) => storage.get(chartKey(token.chart.coingeckoId)));
  assert.equal(cached.length, MAX_CHART_ENTRIES);
  assert.deepEqual(cached.map((token) => token.symbol), STOCK_TOKENS.slice(-MAX_CHART_ENTRIES).map((token) => token.symbol));
});

test("demo charts are illustrative and make no request; SPCX and MU are short like the real ones", async () => {
  const calls = [];
  const loader = createChartLoader({ mode: "demo", storage: jsonMemory().storage, fetchImpl: forbiddenFetch(calls), now: () => T0 });
  const spy = await loader.load("SPY");
  assert.equal(spy.source, "demo");
  assert.equal(spy.points.length, 366);
  assert.equal(spy.points.at(-1).value, 3997.21);
  assert.equal((await loader.load("SPCX")).points.length, 108);
  assert.equal(demoSeries(findStock("MU"), T0).length, 112);
  // The last step of the illustrative series is the illustrative 24 h change of the price list.
  const [before, last] = spy.points.slice(-2);
  assert.ok(Math.abs(((last.value - before.value) / before.value) * 100 - 0.42) < 0.01);
  assert.equal(calls.length, 0);
});

test("captions name the source and the period", () => {
  const result = { status: "ok", source: "xstocks-proxy", points: [{ t: Date.parse("2025-09-27T12:00:00Z"), value: 1 }, { t: Date.parse("2026-09-26T12:00:00Z"), value: 2 }] };
  assert.equal(chartCaptionPt(findStock("NVDA"), result), "Preço de referência da ação Nvidia em reais (fonte: CoinGecko, série xStocks de outro emissor; 27/09/2025–26/09/2026)");
  assert.equal(chartCaptionPt(findStock("SPY"), result), "Preço de referência do fundo S&P 500 em reais (fonte: CoinGecko, série xStocks de outro emissor; 27/09/2025–26/09/2026)");
  assert.equal(chartCaptionPt(findStock("SGOV"), { ...result, source: "token" }), "Preço deste token em reais (fonte: CoinGecko, desde 27/09/2025)");
  assert.equal(chartCaptionPt(findStock("SPY"), { status: "rate_limited" }), "");
});

test("daily points (00:00 UTC) keep their calendar date in captions and labels", () => {
  // CoinGecko stamps daily points at midnight UTC; in Brasília that instant is the previous evening.
  const points = [{ t: Date.parse("2026-06-04T00:00:00Z"), value: 1 }, { t: Date.parse("2026-09-26T00:00:00Z"), value: 2 }];
  assert.match(chartCaptionPt(findStock("MU"), { status: "ok", source: "xstocks-proxy", points }), /; 04\/06\/2026–26\/09\/2026\)$/);
  assert.equal(maxPeriodLabelPt([{ t: Date.parse("2026-07-01T00:00:00Z"), value: 1 }]), "Máx. (desde jul/2026)");
});
