import assert from "node:assert/strict";
import test from "node:test";
import { hasPrivySession } from "../src/lib/privy-session.js";
import { buildPaxgBuyRequest, classifyRamp, isValidCpf, normalizeQuote, pollRamp, rampStartDeadline, resolveApiBase, secondsUntilExpiry } from "../src/lib/vortex.js";

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

test("an unstarted ramp an hour after registration stops blocking new operations", () => {
  const createdAt = "2030-01-01T00:00:00.000Z";
  const at = (minutes) => Date.parse(createdAt) + minutes * 60_000;
  const pix = { status: "PENDING", currentPhase: "initial", depositQrCode: "pix", createdAt };
  assert.equal(classifyRamp(pix, at(30)), "awaiting_payment");
  assert.equal(classifyRamp(pix, at(61)), "failure");
  assert.equal(classifyRamp({ status: "PENDING", currentPhase: "brlaOnrampMint", createdAt }, at(61)), "processing");
});

test("a resumed PIX counts down to the real start deadline", () => {
  assert.equal(rampStartDeadline({ expiresAt: "2030-01-01T00:15:00.000Z" }), Date.parse("2030-01-01T00:15:00.000Z"));
  assert.equal(rampStartDeadline({ createdAt: "2030-01-01T00:00:00.000Z" }), Date.parse("2030-01-01T00:15:00.000Z"));
  assert.equal(rampStartDeadline({}), null);
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

test("accepts only CPFs with valid check digits", () => {
  for (const cpf of ["08786985906", "087.869.859-06", "52998224725"]) assert.equal(isValidCpf(cpf), true, cpf);
  // 08786985914 is wrong only in the first check digit, 08786985907 only in the second.
  for (const cpf of ["08786985914", "08786985907", "12345678901", "11111111111", "01234567890", "0878698590", "087869859060", "", undefined]) assert.equal(isValidCpf(cpf), false, String(cpf));
});

test("ramp polling stops as soon as it is aborted", { timeout: 2000 }, async () => {
  let calls = 0;
  const client = { getRampStatus: async () => { calls += 1; return { status: "PENDING", currentPhase: "hydrationSwap" }; } };
  const waiting = new AbortController();
  setTimeout(() => waiting.abort(), 20);
  await assert.rejects(pollRamp(client, "r1", { intervalMs: 60_000, signal: waiting.signal }), { name: "AbortError" });
  assert.equal(calls, 1);
  await assert.rejects(pollRamp(client, "r1", { signal: AbortSignal.abort() }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("a stored Privy session or a Google sign-in return keeps the loader instead of the landing", () => {
  assert.equal(hasPrivySession(["privy:token"], ""), true);
  assert.equal(hasPrivySession(["privy:clabc:refresh_token"], ""), true);
  const redirectKeys = ["privy:state_code", "privy:code_verifier", "privy:caid"];
  assert.equal(hasPrivySession(redirectKeys, "?privy_oauth_code=x&privy_oauth_state=y&privy_oauth_provider=google"), true);
  assert.equal(hasPrivySession(redirectKeys, ""), false);
  assert.equal(hasPrivySession(["privy:id_token", "privy:pat", "satoshi:vortex-session:v2"], "?utm_source=ad"), false);
});
