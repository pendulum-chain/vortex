import assert from "node:assert/strict";
import test from "node:test";
import { ABANDONED_AFTER_MS, RAMP_START_WINDOW_MS, classifyRamp, getRampWithUnsignedTxs, isTransientError, pollRamp, rampStartDeadline, secondsUntilExpiry, startRampSafely } from "../src/ramp-tracking.js";
import { createApi } from "../src/vortex/api.js";
import { createVortexSession } from "../src/vortex/session.js";
import { inOneHour, json, jwt, memoryStorage, withFetch } from "./helpers.mjs";

const address = "0x0000000000000000000000000000000000000001";

test("classifies provider ramp outcomes conservatively (Gold)", () => {
  assert.equal(classifyRamp({ status: "completed" }), "success");
  assert.equal(classifyRamp({ currentPhase: "complete" }), "success");
  assert.equal(classifyRamp({ status: "failed" }), "failure");
  assert.equal(classifyRamp({ currentPhase: "initial", depositQrCode: "pix" }), "awaiting_payment");
  assert.equal(classifyRamp({ status: "pending", currentPhase: "hydrationSwap" }), "processing");
});

test("failure overrides conflicting completion (Gold)", () => {
  assert.equal(classifyRamp({ status: "failed", currentPhase: "complete" }), "failure");
  assert.equal(classifyRamp({ status: "COMPLETE", currentPhase: "timedOut" }), "failure");
});

test("an unstarted ramp an hour after registration stops blocking new operations (Gold fix 46810a43e)", () => {
  assert.equal(ABANDONED_AFTER_MS, 3_600_000);
  const createdAt = "2030-01-01T00:00:00.000Z";
  const at = (minutes) => Date.parse(createdAt) + minutes * 60_000;
  const pix = { status: "PENDING", currentPhase: "initial", depositQrCode: "pix", createdAt };
  assert.equal(classifyRamp(pix, at(30)), "awaiting_payment");
  assert.equal(classifyRamp(pix, at(61)), "failure");
  assert.equal(classifyRamp({ status: "PENDING", currentPhase: "brlaOnrampMint", createdAt }, at(61)), "processing");
});

test("a resumed Pix counts down to the real start deadline (Gold fix c6ed93b0a)", () => {
  assert.equal(rampStartDeadline({ expiresAt: "2030-01-01T00:15:00.000Z" }), Date.parse("2030-01-01T00:15:00.000Z"));
  assert.equal(rampStartDeadline({ createdAt: "2030-01-01T00:00:00.000Z" }), Date.parse("2030-01-01T00:15:00.000Z"));
  assert.equal(rampStartDeadline({}), null);
  assert.equal(RAMP_START_WINDOW_MS, 900_000);
});

test("counts the Pix deadline from the clock, so a paused tab cannot show stale time (Gold fix dc0f8d22b)", () => {
  const expiresAt = "2030-01-01T00:10:00.000Z";
  assert.equal(secondsUntilExpiry(expiresAt, Date.parse("2030-01-01T00:00:00.000Z")), 600);
  assert.equal(secondsUntilExpiry(expiresAt, Date.parse("2030-01-01T00:09:30.000Z")), 30);
  assert.equal(secondsUntilExpiry(expiresAt, Date.parse("2030-01-01T00:11:00.000Z")), 0);
});

test("transient errors are the retryable ones only", () => {
  for (const status of [0, 408, 425, 429, 500, 503]) assert.equal(isTransientError({ status }), true, `status ${status}`);
  for (const status of [400, 401, 403, 404, 409, 422]) assert.equal(isTransientError({ status }), false, `status ${status}`);
  assert.equal(isTransientError(new TypeError("Failed to fetch")), true);
});

test("ramp polling rides out network blips and server errors (Gold fix abe8082a9)", async () => {
  let calls = 0;
  const updates = [];
  const client = { getRampStatus: async () => {
    calls += 1;
    if (calls <= 2) throw new TypeError("Failed to fetch");
    if (calls === 3) throw Object.assign(new Error("Bad gateway"), { status: 502 });
    return { status: "COMPLETE", currentPhase: "complete" };
  } };
  assert.equal(classifyRamp(await pollRamp(client, "r1", { intervalMs: 1, onUpdate: (ramp) => updates.push(ramp) })), "success");
  assert.equal(calls, 4);
  assert.equal(updates.length, 1);
});

test("ramp polling surfaces persistent outages and final errors (Gold)", async () => {
  let calls = 0;
  const offline = { getRampStatus: async () => { calls += 1; throw new TypeError("Failed to fetch"); } };
  await assert.rejects(pollRamp(offline, "r1", { intervalMs: 1, maxConsecutiveErrors: 3 }), /Failed to fetch/);
  assert.equal(calls, 3);
  calls = 0;
  const signedOut = { getRampStatus: async () => { calls += 1; throw Object.assign(new Error("Unauthorized"), { status: 401 }); } };
  await assert.rejects(pollRamp(signedOut, "r1", { intervalMs: 1 }), /Unauthorized/);
  assert.equal(calls, 1);
});

test("ramp polling stops when the flow is closed and times out as still processing", async () => {
  const controller = new AbortController();
  const processing = { getRampStatus: async () => { setTimeout(() => controller.abort(), 5); return { status: "PENDING", currentPhase: "nablaSwap" }; } };
  await assert.rejects(pollRamp(processing, "r1", { intervalMs: 60_000, signal: controller.signal }), { name: "AbortError" });
  const slow = { getRampStatus: async () => ({ status: "PENDING", currentPhase: "nablaSwap" }) };
  await assert.rejects(pollRamp(slow, "r1", { intervalMs: 1, timeoutMs: 10 }), { code: "POLL_TIMEOUT" });
});

test("a failed start still counts when the ramp already moved on", async () => {
  const startError = new Error("start timed out");
  const moved = { startRamp: async () => { throw startError; }, getRampStatus: async () => ({ status: "PENDING", currentPhase: "brlaOnrampMint" }) };
  assert.equal((await startRampSafely(moved, "r1")).currentPhase, "brlaOnrampMint");
  const stuck = { startRamp: async () => { throw startError; }, getRampStatus: async () => ({ status: "PENDING", currentPhase: "initial" }) };
  await assert.rejects(startRampSafely(stuck, "r1"), startError);
  const unreachable = { startRamp: async () => { throw startError; }, getRampStatus: async () => { throw new Error("offline"); } };
  await assert.rejects(startRampSafely(unreachable, "r1"), startError);
  assert.deepEqual(await startRampSafely({ startRamp: async () => ({ id: "r1" }) }, "r1"), { id: "r1" });
});

test("resuming a sell asks the API for the ramp's unsigned wallet transactions (Gold fix 6a7b033fe)", async () => {
  const backing = memoryStorage();
  const session = createVortexSession({ api: createApi({ apiBase: "https://api.example.test" }), storage: () => backing });
  session.set({ access_token: jwt(inOneHour()), refresh_token: "fake-test-only" });
  const seen = [];
  await withFetch(async (url, init) => { seen.push({ url, init }); return json({ id: "r/1", currentPhase: "initial", unsignedTxs: [{ phase: "squidRouterApprove", signer: address }] }); }, async () => {
    assert.equal((await getRampWithUnsignedTxs(session, "r/1")).unsignedTxs.length, 1);
  });
  assert.equal(seen[0].url, "https://api.example.test/v1/ramp/r%2F1?showUnsignedTxs=true");
  assert.match(seen[0].init.headers.Authorization, /^Bearer /);
});

test("the poll's time limit counts as transient, so a flow can start tracking over", async () => {
  await assert.rejects(pollRamp({}, "r1", { timeoutMs: 0 }), (error) => error.code === "POLL_TIMEOUT" && isTransientError(error));
});
