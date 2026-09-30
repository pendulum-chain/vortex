import assert from "node:assert/strict";
import test from "node:test";
import { CHART_PERIODS, chartWindow, fetchPaxgMarket } from "../src/lib/market.js";

const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };

const dailySeries = (length) => Array.from({ length }, (_, index) => ({ label: String(index), value: 100 + index }));

test("each chart period spans its full length and reports its own change", () => {
  assert.deepEqual(CHART_PERIODS, ["7D", "30D", "1A"]);
  const year = dailySeries(366);
  const week = chartWindow(year, "7D");
  assert.equal(week.points.length, 8);
  assert.equal(week.change, ((465 - 458) / 458) * 100);
  assert.equal(chartWindow(year, "30D").points.length, 31);
  const all = chartWindow(year, "1A");
  assert.equal(all.points.length, 366);
  assert.equal(all.change, 365);
  assert.equal(chartWindow([], "7D").change, 0);
});

test("the one-year chart is backed by a year of daily prices", async () => {
  const old = globalThis.fetch;
  let requested = "";
  try {
    globalThis.fetch = async (url) => {
      requested = url;
      return new Response(JSON.stringify({ prices: [[Date.UTC(2025, 8, 26), 600 * 31.1034768], [Date.UTC(2026, 8, 25), 700 * 31.1034768]] }));
    };
    const market = await fetchPaxgMarket();
    assert.match(requested, /days=365&interval=daily/);
    assert.equal(market.brlPerGram, 700);
    assert.equal(market.points.length, 2);
  } finally { globalThis.fetch = old; memory.clear(); }
});

test("an empty price series leaves the price unavailable instead of inventing one", async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ prices: [] }));
    await assert.rejects(fetchPaxgMarket());
  } finally { globalThis.fetch = old; memory.clear(); }
});
