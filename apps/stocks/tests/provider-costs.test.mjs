import assert from "node:assert/strict";
import test from "node:test";
import { simulatedFees, simulatedProviderCosts, SIM_FEES } from "../src/lib/fee-model.js";
import { costBps, providerCostProblem, quoteProviderCosts } from "../src/lib/provider-costs.js";

function demoQuote(reserve = null) {
  const fees = simulatedFees(1000);
  return { routingStrategy: "direct", providerCosts: simulatedProviderCosts(1000), totalFeeFiat: fees.total + (reserve?.brl || 0), partnerFeeFiat: 0 };
}

test("the direct demo has only one own revenue fee and no LI.FI or product surcharge", () => {
  const raw = demoQuote();
  assert.equal(providerCostProblem(raw), null);
  const result = quoteProviderCosts(raw, { simulated: true });
  assert.equal(result.routing, "direct");
  assert.equal(result.complete, true);
  assert.equal(result.extraProductFee, 0);
  assert.equal(SIM_FEES.productRate, 0);
  assert.equal(result.rows.find((r) => r.id === "vortex").amount, 0.5);
  assert.equal(costBps(0.5, 1000), 5);
  assert.equal(result.identifiedTotal, 4.06);
  assert.ok(result.rows.every((r) => !/lifi/i.test(r.provider)));
});

test("an ETH reserve is included once and never assigned to network execution gas", () => {
  const reserve = { brl: 0.71 };
  const raw = demoQuote(reserve);
  assert.equal(providerCostProblem(raw, reserve), null);
  const details = quoteProviderCosts(raw, { reserve });
  assert.equal(details.rows.find((r) => r.id === "network").amount, 0.3);
  assert.equal(details.identifiedTotal, 4.77);
  assert.ok(Math.abs(costBps(details.identifiedTotal, 1000) - 47.7) < 1e-9);
});

test("rate-embedded costs are never deducted twice or confused with reported fees", () => {
  const raw = demoQuote();
  for (const r of raw.providerCosts) if (["conversion", "bridge", "swap"].includes(r.id)) r.includedIn = "rate";
  raw.totalFeeFiat = 1.56; // Avenia + Vortex + gas; pool/bridge/swap costs are already in the output rate.
  assert.equal(providerCostProblem(raw), null);
  const details = quoteProviderCosts(raw);
  assert.equal(details.identifiedTotal, 4.06);
  assert.equal(raw.totalFeeFiat, 1.56, "normalisation never changes the executable quote");
  raw.providerCosts.find((r) => r.id === "conversion").amountFiat = -0.3;
  assert.equal(providerCostProblem(raw), null, "favourable curve/FX effects can be negative");
  assert.equal(quoteProviderCosts(raw).identifiedTotal, 2.26);
});

test("unknown provider costs stay unknown, while a quoted zero remains zero", () => {
  const details = quoteProviderCosts({ routingStrategy: "direct", totalFeeFiat: "1.56", anchorFeeFiat: "0.76", vortexFeeFiat: "0", networkFeeFiat: "0.80" }, { reserve: { brl: 0.5 } });
  assert.equal(details.complete, false);
  assert.equal(details.identifiedTotal, null);
  assert.equal(details.rows.find((r) => r.id === "bridge").amount, null);
  assert.equal(details.rows.find((r) => r.id === "vortex").amount, 0);
  assert.ok(Math.abs(details.rows.find((r) => r.id === "network").amount - 0.3) < 1e-9);
  assert.equal(quoteProviderCosts({}).routing, "unconfirmed");
  assert.equal(costBps(null, 1000), null);
  assert.equal(costBps(1, 0), null);
});

test("malformed, mismatched or double-counted provider costs cannot pass validation", () => {
  for (const mutate of [
    (r) => { r.providerCosts = {}; },
    (r) => { r.providerCosts.push(r.providerCosts[0]); },
    (r) => { r.providerCosts[2].provider = "lifi"; },
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
