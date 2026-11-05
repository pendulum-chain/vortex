import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_CHANGE_24H_PCT, DEMO_PRICES_BRL, FX_URL, PRICE_FRESH_MS, PRICE_MAX_AGE_MS, buildPricesUrl, createMarket, mapSimplePrice, pollWhileVisible } from "../src/lib/market.js";
import { STOCK_TOKENS } from "../src/lib/stocks.js";
import { STOCKS_KEYS } from "../src/lib/stores.js";
import { forbiddenFetch, json, jsonMemory } from "./helpers.mjs";

const T0 = Date.parse("2026-09-28T15:00:00Z");

function coingeckoBody(overrides = {}) {
  const body = {};
  STOCK_TOKENS.forEach((token, index) => {
    body[token.coingeckoId] = { usd: 100 + index, brl: 519 + index, brl_24h_change: index - 5.5, last_updated_at: T0 / 1000 - 30 };
  });
  return { ...body, ...overrides };
}

function setup({ now = () => T0, fetchImpl, mode = "live" } = {}) {
  const { storage } = jsonMemory();
  return { storage, market: createMarket({ mode, storage, fetchImpl, now }) };
}

test("one batched simple/price call covers all 12 tokens in BRL and USD", () => {
  const url = new URL(buildPricesUrl());
  assert.equal(url.origin + url.pathname, "https://api.coingecko.com/api/v3/simple/price");
  const ids = url.searchParams.get("ids").split(",");
  assert.deepEqual(ids, STOCK_TOKENS.map((token) => token.coingeckoId));
  assert.equal(url.searchParams.get("vs_currencies"), "usd,brl");
  assert.equal(url.searchParams.get("include_24hr_change"), "true");
  assert.equal(url.searchParams.get("include_last_updated_at"), "true");
});

test("the response maps per symbol; a missing or zero price is no price, never 0", () => {
  const body = coingeckoBody({ "tesla-robinhood-tokenized-stock": undefined, "apple-robinhood-tokenized-stock": { brl: 0, usd: 0 } });
  const prices = mapSimplePrice(body);
  assert.equal(prices.TSLA, undefined);
  assert.equal(prices.AAPL, undefined);
  assert.deepEqual(prices.SPY, { brl: 519, usd: 100, change24hPct: -5.5, updatedAt: T0 - 30_000 });
  assert.equal(Object.keys(prices).length, 10);
  assert.equal(mapSimplePrice({ "spdr-s-p-500-etf-trust-robinhood-tokenized-stock": { brl: 10 } }).SPY.change24hPct, null);
});

test("a fresh cache (<= 60 s) makes no request; an older one refreshes and is saved", async () => {
  let time = T0;
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return json(coingeckoBody()); };
  const { storage, market } = setup({ now: () => time, fetchImpl });
  const first = await market.getPrices();
  assert.equal(first.status, "ok");
  assert.equal(first.source, "coingecko");
  assert.equal(calls.length, 1);
  assert.equal(storage.get(STOCKS_KEYS.prices).savedAt, T0);
  time += PRICE_FRESH_MS;
  assert.equal((await market.getPrices()).status, "ok");
  assert.equal(calls.length, 1, "still fresh at 60 s");
  time += 1;
  await market.getPrices();
  assert.equal(calls.length, 2);
  await Promise.all([market.getPrices({ force: true }), market.getPrices({ force: true })]);
  assert.equal(calls.length, 3, "concurrent refreshes share one request");
});

test("a 429 keeps the cache and marks it stale; after 15 minutes prices are unavailable", async () => {
  let time = T0;
  let fail = false;
  const fetchImpl = async () => (fail ? new Response("{}", { status: 429 }) : json(coingeckoBody()));
  const { market } = setup({ now: () => time, fetchImpl });
  await market.getPrices();
  fail = true;
  time += 5 * 60_000;
  const stale = await market.getPrices();
  assert.equal(stale.status, "stale");
  assert.equal(stale.prices.SPY.brl, 519);
  assert.deepEqual(stale.error, { status: 429, rateLimited: true, message: "Muitas consultas de preço agora." });
  assert.equal(market.referencePrice("SPY").brl, 519);
  time = T0 + PRICE_MAX_AGE_MS + 1;
  const gone = await market.getPrices();
  assert.equal(gone.status, "unavailable");
  assert.deepEqual(gone.prices, {});
  assert.equal(market.referencePrice("SPY"), null);
});

test("a network error or an empty answer without a cache is unavailable", async () => {
  const offline = setup({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  const down = await offline.market.getPrices();
  assert.equal(down.status, "unavailable");
  assert.equal(down.error.status, 0);
  const empty = setup({ fetchImpl: async () => json({}) });
  assert.equal((await empty.market.getPrices()).status, "unavailable");
});

test("peek shows the cached state without a request", async () => {
  const calls = [];
  const { storage, market } = setup({ fetchImpl: forbiddenFetch(calls) });
  assert.equal(market.peek().status, "unavailable");
  storage.set(STOCKS_KEYS.prices, { savedAt: T0 - 3 * 60_000, data: { SPY: { brl: 1, usd: null, change24hPct: null, updatedAt: T0 - 3 * 60_000 } } });
  assert.equal(market.peek().status, "stale");
  assert.equal(calls.length, 0);
});

test("demo returns the illustrative static table without any request", async () => {
  const calls = [];
  const { market } = setup({ mode: "demo", fetchImpl: forbiddenFetch(calls) });
  const state = await market.getPrices();
  assert.equal(state.source, "demo");
  assert.equal(state.status, "ok");
  for (const token of STOCK_TOKENS) assert.equal(state.prices[token.symbol].brl, DEMO_PRICES_BRL[token.symbol], token.symbol);
  assert.equal(market.referencePrice("NVDA").brl, 1163.89);
  // Illustrative 24 h changes in both directions, so the demo shows up and down (never 0 as "no data").
  assert.equal(state.prices.NVDA.change24hPct, 1.24);
  assert.equal(state.prices.TSLA.change24hPct, -1.87);
  for (const token of STOCK_TOKENS) assert.ok(Number.isFinite(DEMO_CHANGE_24H_PCT[token.symbol]), token.symbol);
  assert.equal((await market.getUsdBrl()).bid, 5.1866);
  assert.equal(calls.length, 0);
});

test("USD/BRL is cached for 5 minutes and falls back to an older cache", async () => {
  let time = T0;
  const calls = [];
  let fail = false;
  const fetchImpl = async (url) => { calls.push(url); return fail ? new Response("", { status: 503 }) : json({ USDBRL: { bid: "5.1866" } }); };
  const { market } = setup({ now: () => time, fetchImpl });
  assert.deepEqual(await market.getUsdBrl(), { bid: 5.1866, updatedAt: T0 });
  assert.equal(calls[0], FX_URL);
  time += 4 * 60_000;
  await market.getUsdBrl();
  assert.equal(calls.length, 1);
  fail = true;
  time += 2 * 60_000;
  assert.equal((await market.getUsdBrl()).bid, 5.1866);
  assert.equal(calls.length, 2);
});

test("polling runs only while the page is visible and catches up when it becomes visible", () => {
  const listeners = {};
  const doc = { visibilityState: "visible", addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener: (name) => { delete listeners[name]; } };
  let tick = null;
  const timers = { setInterval: (fn) => { tick = fn; return 1; }, clearInterval: () => { tick = null; } };
  let runs = 0;
  let stale = false;
  const stop = pollWhileVisible(() => { runs += 1; }, { intervalMs: 60_000, doc, timers, isStale: () => stale });
  tick();
  assert.equal(runs, 1);
  doc.visibilityState = "hidden";
  tick();
  assert.equal(runs, 1, "no request from a hidden tab");
  doc.visibilityState = "visible";
  listeners.visibilitychange();
  assert.equal(runs, 1, "fresh data: nothing to do");
  stale = true;
  listeners.visibilitychange();
  assert.equal(runs, 2);
  stop();
  assert.equal(tick, null);
  assert.equal(listeners.visibilitychange, undefined);
});
