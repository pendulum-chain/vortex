import assert from "node:assert/strict";
import test from "node:test";
import { createJsonStorage } from "../src/storage.js";
import { createActiveRampStore, createEphemeralStore } from "../src/stores.js";
import { memoryStorage, throwingStorage } from "./helpers.mjs";

const address = "0x0000000000000000000000000000000000000001";
const other = "0x0000000000000000000000000000000000000002";

function setup(keys = { activeKey: "satoshi:stocks:active-ramp:v1", historyKey: "satoshi:stocks:history:v1" }) {
  const backing = memoryStorage();
  return { backing, store: createActiveRampStore({ ...keys, storage: createJsonStorage(() => backing) }) };
}

test("a transaction checkpoint survives stage changes and is wallet scoped (Gold)", () => {
  const { store } = setup();
  store.save({ rampId: "r1", walletAddress: address, rampType: "SELL", stage: "signing" });
  store.checkpoint("r1", "approve", "0xabc");
  store.save({ rampId: "r1", walletAddress: address, rampType: "SELL", stage: "ready" });
  assert.equal(store.get(address).transactions.approve, "0xabc");
  assert.equal(store.get(address).stage, "ready");
  assert.equal(store.get(other), null);
  assert.throws(() => store.checkpoint("r2", "approve", "0xabc"), /Não foi possível salvar a operação/);
  store.clear("r2");
  assert.ok(store.get(address));
  store.clear("r1");
  assert.equal(store.get(address), null);
});

test("a new ramp starts without the previous ramp's checkpoints", () => {
  const { store } = setup();
  store.save({ rampId: "r1", walletAddress: address });
  store.checkpoint("r1", "approve", "0xabc");
  assert.throws(() => store.save({ rampId: "r2", walletAddress: address }), { code: "RAMP_IN_PROGRESS" });
  assert.throws(() => store.save({ rampId: "r2", walletAddress: other }), { code: "RAMP_IN_PROGRESS" });
  assert.equal(store.get(address).transactions.approve, "0xabc");
  store.clear("r1");
  store.save({ rampId: "r2", walletAddress: address });
  assert.deepEqual(store.get(address).transactions, {});
});

test("records are normalised and app fields never override the recovery fields", () => {
  const { store } = setup();
  const record = store.save({ rampId: "r1", walletAddress: "0xABCDEF0000000000000000000000000000000001", inputAmount: 500, outputAmount: 0.49, createdAt: 5, symbol: "NVDA", tokenAddress: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", transactions: { approve: "0xforged" } });
  assert.deepEqual(record, { symbol: "NVDA", tokenAddress: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", rampId: "r1", walletAddress: "0xabcdef0000000000000000000000000000000001", inputAmount: "500", outputAmount: "0.49", rampType: "BUY", stage: "registered", transactions: {}, createdAt: 5 });
});

test("injected legacy keys are used verbatim, so Gold's recovery records stay readable", () => {
  const { backing, store } = setup({ activeKey: "satoshi:gold:active-ramp:v1", historyKey: "satoshi:gold:history:v1" });
  backing.setItem("satoshi:gold:active-ramp:v1", JSON.stringify({ rampId: "gold-r1", walletAddress: address, rampType: "SELL", stage: "signing", transactions: { squidRouterApprove: "0xabc" }, createdAt: 1 }));
  assert.equal(store.get(address).transactions.squidRouterApprove, "0xabc");
  store.addHistory({ rampId: "gold-r0", walletAddress: address });
  assert.deepEqual([...backing.memory.keys()].sort(), ["satoshi:gold:active-ramp:v1", "satoshi:gold:history:v1"]);
});

test("history keeps the last 12 completed ramps and is filtered by wallet", () => {
  const { store } = setup();
  for (let index = 0; index < 14; index += 1) store.addHistory({ rampId: `r${index}`, walletAddress: index % 2 ? other : address });
  store.addHistory({ rampId: "r13", walletAddress: other, note: "updated" });
  const mine = store.history(address);
  const theirs = store.history(other);
  assert.equal(mine.length + theirs.length, 12);
  assert.ok(mine.every((item) => item.walletAddress === address));
  assert.equal(theirs[0].rampId, "r13");
  assert.equal(theirs[0].note, "updated");
  assert.equal(theirs.filter((item) => item.rampId === "r13").length, 1);
  assert.ok(typeof theirs[0].completedAt === "number");
  assert.deepEqual(store.history(undefined), []);
});

test("recovery writes fail closed when storage is unavailable", () => {
  const store = createActiveRampStore({ activeKey: "satoshi:stocks:active-ramp:v1", historyKey: "satoshi:stocks:history:v1", storage: createJsonStorage(() => throwingStorage) });
  assert.throws(() => store.save({ rampId: "r1", walletAddress: address }), /Não foi possível salvar a operação/);
  assert.equal(store.get(address), null);
});

test("the ephemeral key store needs a database name and a secure context", async () => {
  assert.throws(() => createEphemeralStore(""), /database name/);
  const store = createEphemeralStore("satoshi-stocks-secure");
  assert.equal(typeof store.put, "function");
  assert.equal(typeof store.delete, "function");
  await assert.rejects(store.put({ keys: "fake-test-only" }, "r1"), /Secure HTTPS context required/);
});
