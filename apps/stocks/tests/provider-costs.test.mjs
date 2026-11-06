import assert from "node:assert/strict";
import test from "node:test";
import { simulatedFees, simulatedProviderCosts, SIM_FEES } from "../src/lib/fee-model.js";
import { costBps, providerCostProblem, quoteProviderCosts } from "../src/lib/provider-costs.js";

function demoQuote(reserve = null) {
  const fees = simulatedFees(1000);
  return { routingStrategy: "direct", providerCosts: simulatedProviderCosts(1000), totalFeeFiat: fees.total + (reserve?.brl || 0), partnerFeeFiat: 0 };
}

test("the direct demo has only one own revenue fee, no other provider and no product surcharge", () => {
  const raw = demoQuote();
  assert.equal(providerCostProblem(raw), null);
  const result = quoteProviderCosts(raw, { simulated: true });
  assert.equal(result.routing, "direct");
  assert.equal(result.complete, true);
  assert.equal(result.extraProductFee, 0);
  assert.equal(SIM_FEES.productRate, 0);
  assert.equal(result.rows.find((r) => r.id === "vortex").amount, 1);
  assert.equal(costBps(1, 1000), 10);
  assert.equal(result.identifiedTotal, 6);
  assert.deepEqual(result.rows.map((r) => r.id), ["ramp", "conversion", "bridge", "swap", "vortex", "network"]);
});

test("an ETH reserve is included once and never assigned to network execution gas", () => {
  const reserve = { brl: 0.71 };
  const raw = demoQuote(reserve);
  assert.equal(providerCostProblem(raw, reserve), null);
  const details = quoteProviderCosts(raw, { reserve });
  assert.equal(details.rows.find((r) => r.id === "network").amount, 1);
  assert.equal(details.identifiedTotal, 6.71);
  assert.ok(Math.abs(costBps(details.identifiedTotal, 1000) - 67.1) < 1e-9);
});

test("rate-embedded costs are never deducted twice or confused with reported fees", () => {
  const raw = demoQuote();
  for (const r of raw.providerCosts) if (["conversion", "bridge", "swap"].includes(r.id)) r.includedIn = "rate";
  raw.totalFeeFiat = 3; // Avenia + Vortex + gas; pool/bridge/swap costs are already in the output rate.
  assert.equal(providerCostProblem(raw), null);
  const details = quoteProviderCosts(raw);
  assert.equal(details.identifiedTotal, 6);
  assert.equal(raw.totalFeeFiat, 3, "normalisation never changes the executable quote");
  raw.providerCosts.find((r) => r.id === "conversion").amountFiat = -0.3;
  assert.equal(providerCostProblem(raw), null, "favourable curve/FX effects can be negative");
  assert.equal(quoteProviderCosts(raw).identifiedTotal, 4.7);
});

test("unknown provider costs stay unknown, while a quoted zero remains zero", () => {
  const details = quoteProviderCosts({ routingStrategy: "direct", totalFeeFiat: "2.00", anchorFeeFiat: "1.00", vortexFeeFiat: "0", networkFeeFiat: "1.00" }, { reserve: { brl: 0.5 } });
  assert.equal(details.complete, false);
  assert.equal(details.identifiedTotal, null);
  assert.equal(details.rows.find((r) => r.id === "bridge").amount, null);
  assert.equal(details.rows.find((r) => r.id === "vortex").amount, 0);
  assert.ok(Math.abs(details.rows.find((r) => r.id === "network").amount - 0.5) < 1e-9);
  assert.equal(quoteProviderCosts({}).routing, "unconfirmed");
  assert.equal(costBps(null, 1000), null);
  assert.equal(costBps(1, 0), null);
});

test("malformed, mismatched or double-counted provider costs cannot pass validation", () => {
  for (const mutate of [
    (r) => { r.providerCosts = {}; },
    (r) => { r.providerCosts.push(r.providerCosts[0]); },
    (r) => { r.providerCosts[2].provider = "other-router"; },
    (r) => { r.providerCosts[0].amountFiat = ""; },
    (r) => { r.providerCosts[0].amountFiat = Infinity; },
    (r) => { r.providerCosts[0].amountFiat = -0.1; },
    (r) => { r.providerCosts[0].includedIn = "external"; },
    (r) => { r.providerCosts[4].includedIn = "rate"; },
    (r) => { r.totalFeeFiat = 100; },
    (r) => { r.totalFeeFiat = 1; },
    (r) => { r.vortexFeeFiat = "0.60"; },
  ]) {
    const raw = demoQuote();
    mutate(raw);
    assert.notEqual(providerCostProblem(raw), null);
  }
});
