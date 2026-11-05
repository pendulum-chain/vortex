import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBuy, fiatPerUsd } from "../scripts/quote-costs.mjs";

const NOW = Date.parse("2026-11-04T16:00:00Z");
const tokenAddress = "0x0000000000000000000000000000000000000001";
const fixture = () => ({
  now: NOW,
  ramp: { rampType: "BUY", inputCurrency: "BRL", outputCurrency: "USDC", network: "base", inputAmount: "1000", outputAmount: "199.4", vortexFeeFiat: "3", vortexFeeUsd: "0.6", totalFeeUsd: "0.6" },
  route: { tool: "lifiIntents", action: { fromChainId: 8453, toChainId: 4663, fromToken: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }, toToken: { address: tokenAddress, decimals: 18 } },
    estimate: { fromAmount: "199400000", toAmount: "995000000000000000", toAmountMin: "990000000000000000", feeCosts: [{ amountUSD: "0.4", included: true }], gasCosts: [{ amountUSD: "0.02" }] } },
  reference: { tokenAddress, usd: 200, updatedAt: NOW }
});
test("full-journey cost includes upstream ramp loss and external gas without double-counting included LI.FI fees", () => {
  const result = analyzeBuy(fixture());
  assert.equal(result.fxBrlPerUsd, 5);
  assert.ok(Math.abs(result.quotedCostBps - 51) < 1e-8);
  assert.ok(Math.abs(result.itemizedCostBps - 51) < 1e-8);
  assert.ok(Math.abs(result.minimumCostBps - 101) < 1e-8);
  assert.equal(result.targetMetAtEstimate, false);
  assert.equal(result.executed, false);
});
test("a first-buy gas reserve is charged separately from repeat buys", () => {
  const input = fixture();
  const normal = analyzeBuy(input);
  const first = analyzeBuy({ ...input, reserveUsd: 0.12 });
  assert.ok(Math.abs(first.quotedCostBps - normal.quotedCostBps - 6) < 1e-8);
});
test("estimated output and slippage minimum have separate target verdicts", () => {
  const input = fixture();
  input.route.estimate.toAmount = "996000000000000000";
  const result = analyzeBuy(input);
  assert.equal(result.targetMetAtEstimate, true);
  assert.equal(result.targetMetAtMinimum, false);
});
test("stale/future/missing oracle values cannot produce a cost verdict", () => {
  for (const change of [{ updatedAt: NOW - 600_001 }, { updatedAt: NOW + 30_001 }, { updatedAt: undefined }, { usd: 0 }]) {
    const input = fixture(); Object.assign(input.reference, change);
    assert.throws(() => analyzeBuy(input));
  }
});
test("wrong chain, token or mismatched intermediate amount is rejected", () => {
  for (const mutate of [
    (x) => { x.route.action.toChainId = 8453; },
    (x) => { x.route.action.toToken.address = "0xBAD"; },
    (x) => { x.route.estimate.fromAmount = "199400001"; },
    (x) => { x.route.action.fromToken.address = "0xBAD"; },
    (x) => { x.ramp.inputCurrency = "EUR"; }
  ]) { const input = fixture(); mutate(input); assert.throws(() => analyzeBuy(input)); }
});
test("missing FX conversion fails instead of assuming an exchange rate", () => {
  assert.throws(() => fiatPerUsd({}));
});
test("missing, negative or ambiguous fee amounts cannot produce a verdict", () => {
  for (const mutate of [
    (x) => { x.route.estimate.feeCosts[0].amountUSD = undefined; },
    (x) => { x.route.estimate.feeCosts[0].included = undefined; },
    (x) => { x.route.estimate.gasCosts[0].amountUSD = "-1"; },
    (x) => { x.reserveUsd = -0.1; },
    (x) => { x.ramp.totalFeeUsd = "NaN"; }
  ]) { const input = fixture(); mutate(input); assert.throws(() => analyzeBuy(input)); }
});
test("explicitly excluded fees are added once, while zero fees are valid", () => {
  const input = fixture();
  input.route.estimate.feeCosts.push({ included: false, amountUSD: "0.1" }, { included: true, amountUSD: "0" });
  assert.ok(Math.abs(analyzeBuy(input).quotedCostBps - 56) < 1e-8);
});
