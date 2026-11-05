import assert from "node:assert/strict";
import test from "node:test";
import { PRICE_GUARD, checkQuotePrice, priceGuardCopyPt } from "../src/lib/price-guard.js";

const NOW = Date.parse("2026-09-28T15:00:00Z");
const reference = { brl: 1000, updatedAt: NOW - 60_000 };
const buy = (pct) => ({ direction: "BUY", impliedBrlPerToken: 1000 * (1 + pct / 100) });
const sell = (pct) => ({ direction: "SELL", impliedBrlPerToken: 1000 * (1 + pct / 100) });
const status = (quote, tier = "A", ref = reference) => checkQuotePrice({ quote, reference: ref, tier, now: NOW }).status;

test("thresholds: tier A warns above 1%, tier B above 2%, both block above 5%", () => {
  assert.deepEqual(PRICE_GUARD.warnPct, { A: 1.0, B: 2.0 });
  assert.equal(PRICE_GUARD.blockPct, 5.0);
  assert.equal(status(buy(0.9)), "ok");
  assert.equal(status(buy(1.1)), "warn");
  assert.equal(status(buy(1.9), "B"), "ok");
  assert.equal(status(buy(2.1), "B"), "warn");
  assert.equal(status(buy(5.1)), "block");
  assert.equal(status(buy(5.1), "B"), "block");
  assert.equal(status(buy(14.86)), "block", "the SCHD case");
});

test("the guard is sign-aware: only a deviation against the user counts", () => {
  assert.equal(status(buy(-3)), "ok", "a BUY cheaper than the reference");
  assert.equal(status(sell(-2.5), "B"), "warn", "a SELL receiving 2.5% less on tier B");
  assert.equal(status(sell(-0.5)), "ok");
  assert.equal(status(sell(-6)), "block");
  assert.equal(status(sell(3)), "ok", "a SELL receiving more");
  const result = checkQuotePrice({ quote: buy(1.5), reference, now: NOW });
  assert.ok(Math.abs(result.deviationPct - 1.5) < 1e-9);
});

test("no reference, a stale one or a broken quote price is unknown (buying stays allowed)", () => {
  assert.deepEqual(checkQuotePrice({ quote: buy(0), reference: null, now: NOW }), { status: "unknown", deviationPct: null });
  assert.equal(status(buy(0), "A", { brl: 1000, updatedAt: NOW - 15 * 60_000 - 1 }), "unknown");
  assert.equal(status(buy(0), "A", { brl: 1000, updatedAt: NOW - 15 * 60_000 }), "ok");
  assert.equal(status(buy(0), "A", { brl: 0, updatedAt: NOW }), "unknown");
  assert.equal(status({ direction: "BUY", impliedBrlPerToken: Number.NaN }), "unknown");
});

test("copy per state", () => {
  assert.equal(priceGuardCopyPt({ status: "ok", deviationPct: 0.1 }), null);
  const warn = priceGuardCopyPt({ status: "warn", deviationPct: 1.234 }, { direction: "BUY", reference: { updatedAt: Date.parse("2026-09-28T17:05:00Z") } });
  assert.equal(warn.tone, "warning");
  assert.equal(warn.text, "O preço desta cotação está 1,23% acima do preço de referência (CoinGecko, 14:05). Compare antes de confirmar ou tente mais tarde.");
  assert.equal(warn.title, "Preço acima do esperado");
  const sellWarn = priceGuardCopyPt({ status: "warn", deviationPct: -2.5 }, { direction: "SELL" });
  assert.match(sellWarn.text, /2,50% abaixo/);
  // A sell is warned because the user receives LESS: the title must not say "acima".
  assert.equal(sellWarn.title, "Preço abaixo do esperado");
  assert.equal(priceGuardCopyPt({ status: "block" }).title, "Cotação bloqueada");
  assert.equal(priceGuardCopyPt({ status: "block" }).tone, "error");
  assert.equal(priceGuardCopyPt({ status: "unknown" }).text, "Preço de referência indisponível; confira o valor da cotação.");
});
