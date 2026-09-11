import assert from "node:assert/strict";
import test from "node:test";
import { buildPaxgBuyRequest, classifyRamp, normalizeQuote } from "../src/lib/vortex.js";

test("builds the locked BRL PIX to Ethereum PAXG corridor", () => {
  assert.deepEqual(buildPaxgBuyRequest(500), {
    rampType: "BUY",
    from: "pix",
    to: "ethereum",
    inputAmount: "500",
    inputCurrency: "BRL",
    outputCurrency: "PAXG",
    paymentMethod: "pix",
    countryCode: "BR",
    network: "ethereum",
  });
});

test("normalizes PAXG ounces, grams, and user-visible fees", () => {
  const quote = normalizeQuote({ outputAmount: "0.5", networkFeeFiat: "8", processingFeeFiat: "4", partnerFeeFiat: "0", totalFeeFiat: "12", expiresAt: "2030-01-01T00:00:00.000Z" });
  assert.equal(quote.outputPaxg, 0.5);
  assert.equal(quote.grams, 15.5517384);
  assert.equal(quote.networkFee, 8);
  assert.equal(quote.serviceFee, 4);
  assert.equal(quote.totalFee, 12);
});

test("classifies provider ramp outcomes conservatively", () => {
  assert.equal(classifyRamp({ status: "completed" }), "success");
  assert.equal(classifyRamp({ currentPhase: "complete" }), "success");
  assert.equal(classifyRamp({ status: "failed" }), "failure");
  assert.equal(classifyRamp({ currentPhase: "initial", depositQrCode: "pix" }), "awaiting_payment");
  assert.equal(classifyRamp({ status: "pending", currentPhase: "hydrationSwap" }), "processing");
});
