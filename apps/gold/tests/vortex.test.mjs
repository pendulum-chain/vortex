import assert from "node:assert/strict";
import test from "node:test";
import { buildPaxgBuyRequest, classifyRamp, normalizeQuote, pollRamp, resolveApiBase, secondsUntilExpiry } from "../src/lib/vortex.js";

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

test("resolves the API base against the page origin unless an absolute URL is configured", () => {
  assert.equal(resolveApiBase(undefined, "https://www.vortexfinance.co"), "https://www.vortexfinance.co/api/production");
  assert.equal(resolveApiBase("/api/staging/", "https://deploy-preview-1--vortexfi.netlify.app"), "https://deploy-preview-1--vortexfi.netlify.app/api/staging");
  assert.equal(resolveApiBase("https://api.vortexfinance.co", "https://www.vortexfinance.co"), "https://api.vortexfinance.co");
});

test("counts the PIX deadline from the clock, so a paused tab cannot show stale time", () => {
  const expiresAt = "2030-01-01T00:10:00.000Z";
  assert.equal(secondsUntilExpiry(expiresAt, Date.parse("2030-01-01T00:00:00.000Z")), 600);
  assert.equal(secondsUntilExpiry(expiresAt, Date.parse("2030-01-01T00:09:30.000Z")), 30);
  assert.equal(secondsUntilExpiry(expiresAt, Date.parse("2030-01-01T00:11:00.000Z")), 0);
});

test("ramp polling rides out network blips and server errors", async () => {
  let calls = 0;
  const client = { getRampStatus: async () => {
    calls += 1;
    if (calls <= 2) throw new TypeError("Failed to fetch");
    if (calls === 3) throw Object.assign(new Error("Bad gateway"), { status: 502 });
    return { status: "COMPLETE", currentPhase: "complete" };
  } };
  assert.equal(classifyRamp(await pollRamp(client, "r1", { intervalMs: 1 })), "success");
  assert.equal(calls, 4);
});

test("ramp polling surfaces persistent outages and final errors", async () => {
  let calls = 0;
  const offline = { getRampStatus: async () => { calls += 1; throw new TypeError("Failed to fetch"); } };
  await assert.rejects(pollRamp(offline, "r1", { intervalMs: 1, maxConsecutiveErrors: 3 }), /Failed to fetch/);
  assert.equal(calls, 3);
  calls = 0;
  const signedOut = { getRampStatus: async () => { calls += 1; throw Object.assign(new Error("Unauthorized"), { status: 401 }); } };
  await assert.rejects(pollRamp(signedOut, "r1", { intervalMs: 1 }), /Unauthorized/);
  assert.equal(calls, 1);
});
