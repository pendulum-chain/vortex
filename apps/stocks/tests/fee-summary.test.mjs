import assert from "node:assert/strict";
import test from "node:test";
import { formatCostAmount, formatCostPercent, groupedFees } from "../src/lib/fee-summary.js";
const rows = () => ["ramp", "conversion", "bridge", "swap", "vortex", "network"].map(id => ({ id, amount: 1, includedIn: "fees" }));

test("Pix groups every fee once and separates retained ETH without changing the input", () => {
  const input = { rows: rows(), total: 6.71, reserve: 0.71 };
  const original = structuredClone(input);
  const result = groupedFees(input);
  assert.equal(result.complete, true); assert.equal(result.amount, 6); assert.equal(result.reported, 6);
  assert.deepEqual(result.groups.map(g => [g.id, g.amount]), [["payment", 2], ["tradeDelivery", 3], ["service", 1]]);
  assert.deepEqual(result.groups.flatMap(g => g.items.map(i => i.id)), ["ramp", "conversion", "bridge", "swap", "network", "vortex"]);
  assert.deepEqual(input, original);
});

test("USDC has no Pix or currency-conversion charge and preserves six-decimal precision", () => {
  const input = { rows: rows().filter(r => !["ramp", "conversion"].includes(r.id)), total: 4.100001, reserve: 0.1, method: "usdc", currency: "USDC" };
  input.rows[0].amount = 1.000001;
  const result = groupedFees(input);
  assert.equal(result.complete, true); assert.equal(result.amount, 4.000001);
  assert.deepEqual(result.groups.map(g => g.id), ["trade", "delivery", "service"]);
  assert.equal(result.groups.some(g => g.items.some(i => ["ramp", "conversion", "reserve"].includes(i.id))), false);
});

test("signed price effects are counted once, including already-net discounted conversion", () => {
  const input = { rows: rows(), total: 4.71, reserve: 0.71 };
  input.rows.find(r => r.id === "conversion").includedIn = "rate";
  input.rows.find(r => r.id === "bridge").includedIn = "rate";
  const result = groupedFees(input);
  assert.equal(result.complete, true); assert.equal(result.reported, 4); assert.equal(result.amount, 6); assert.equal(result.label, "costs");
  input.rows.find(r => r.id === "conversion").amount = -1.5;
  assert.equal(groupedFees(input).amount, 3.5);
  input.rows.find(r => r.id === "conversion").amount = -10;
  assert.equal(groupedFees(input).amount, -5, "favorable price effects are not clamped to zero");
});

test("partial provider detail stays unknown; neither missing amounts nor an unallocated fee become zero", () => {
  const input = { rows: rows().filter(r => r.id !== "bridge"), total: 6 };
  const result = groupedFees(input);
  assert.equal(result.complete, false); assert.equal(result.label, "reported"); assert.equal(result.amount, 6);
  assert.equal(result.groups.find(g => g.id === "tradeDelivery").amount, null);
  assert.equal(result.groups.flatMap(g => g.items).find(i => i.id === "bridge").amount, null);
  input.rows.push({ id: "bridge", amount: 0, includedIn: "fees" });
  assert.equal(groupedFees(input).groups.flatMap(g => g.items).find(i => i.id === "bridge").amount, 0);
  assert.equal(groupedFees(input).complete, false, "a real zero does not explain a missing charge elsewhere");
  assert.equal(groupedFees({ rows: rows(), total: 6.01 }).complete, false);
});

test("sell grouping reverses the relevant route and keeps the same accounting", () => {
  const result = groupedFees({ rows: rows(), total: 6, direction: "SELL" });
  assert.equal(result.amount, 6);
  assert.deepEqual(result.groups[0].items.map(i => i.id), ["conversion", "ramp"]);
  assert.deepEqual(result.groups[1].items.map(i => i.id), ["swap", "bridge", "network"]);
});

test("localized overview amounts omit trailing precision but keep exact USDC and small nonzero fees", () => {
  assert.equal(formatCostAmount(1000, "USDC", "en"), "1,000.00 USDC");
  assert.equal(formatCostAmount(1000.123456, "USDC", "pt-BR"), "1.000,123456 USDC");
  assert.equal(formatCostAmount(0.000001, "USDC", "en"), "0.000001 USDC");
  assert.equal(formatCostAmount(-0.000001, "USDC", "pt-BR"), "-0,000001 USDC");
  assert.equal(formatCostAmount(null, "BRL", "pt-BR"), "Não discriminado");
  assert.equal(formatCostAmount(null, "USDC", "en"), "Not itemized");
  assert.equal(formatCostPercent(6, 1000), "0,60%");
  assert.equal(formatCostPercent(6, 1000, "en"), "0.60%");
  assert.equal(formatCostPercent(1, 0), null);
});
