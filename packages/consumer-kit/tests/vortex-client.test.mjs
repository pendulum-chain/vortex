import assert from "node:assert/strict";
import test from "node:test";
import { storeEphemeralKeys } from "../src/vortex/client.js";

const KEYS = [{ type: "Substrate", address: "5Fake", secret: "fake-test-only", rampId: "r1" }, { type: "EVM", address: "0xFake", secret: "fake-test-only", rampId: "r1" }];

test("the app learns the EVM ephemeral's address before the keys are stored, and never the keys", async () => {
  const calls = [];
  const store = storeEphemeralKeys({ onBeforeEphemeralsStored: (...args) => calls.push(["before", ...args]), ephemeralStore: { put: async (keys, rampId) => calls.push(["put", keys, rampId]) } });
  await store(KEYS, "r1");
  assert.deepEqual(calls, [["before", "r1", "0xFake"], ["put", KEYS, "r1"]]);
  assert.ok(!JSON.stringify(calls[0]).includes("secret"));
});

test("a refused operation stores no keys, and the callback is optional", async () => {
  let stored = 0;
  const ephemeralStore = { put: async () => { stored += 1; } };
  await assert.rejects(storeEphemeralKeys({ ephemeralStore, onBeforeEphemeralsStored: () => { throw new Error("in progress"); } })(KEYS, "r1"), /in progress/);
  assert.equal(stored, 0);
  await storeEphemeralKeys({ ephemeralStore })(KEYS, "r1");
  assert.equal(stored, 1);
});
