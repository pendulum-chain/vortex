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
  assert.equal(store.get(address).transactions.approve, "0xabc");
  store.clear("r1");
  store.save({ rampId: "r2", walletAddress: address });
  assert.deepEqual(store.get(address).transactions, {});
});

test("each wallet holds its own record: another wallet can neither block, read nor replace it", () => {
  const { store } = setup();
  store.save({ rampId: "r1", walletAddress: address, rampType: "SELL" });
  store.checkpoint("r1", "transfer", "0xabc");
  store.save({ rampId: "r2", walletAddress: other });
  assert.equal(store.get(address).rampId, "r1");
  assert.equal(store.get(other).rampId, "r2");
  store.checkpoint("r2", "approve", "0xdef");
  assert.deepEqual(store.get(address).transactions, { transfer: "0xabc" }, "a checkpoint finds its ramp's wallet and no other");
  assert.deepEqual(store.get(other).transactions, { approve: "0xdef" });
  store.clear("r1");
  assert.equal(store.get(address), null);
  assert.equal(store.get(other).rampId, "r2", "clearing one wallet's ramp leaves the other's");
  assert.equal(store.hasActive(), true);
  store.clear("r2");
  assert.equal(store.hasActive(), false);
});

test("a wallet finds its record in either address case", () => {
  const { store } = setup();
  store.save({ rampId: "r1", walletAddress: "0xABCDEF0000000000000000000000000000000001" });
  assert.equal(store.get("0xabcdef0000000000000000000000000000000001").rampId, "r1");
  assert.equal(store.get("0xABCDEF0000000000000000000000000000000001").rampId, "r1");
});

test("clearing without a matching ramp id removes nothing, so a status with no id cannot wipe a record", () => {
  const { store } = setup();
  store.save({ rampId: "r1", walletAddress: address });
  for (const id of [undefined, "", null, "r2"]) store.clear(id);
  assert.equal(store.get(address).rampId, "r1");
});

// Earlier builds stored one record under this same key. Devices still hold those, with hashes that
// must never be broadcast again and ramps that may be paid: they must keep working.
const LEGACY = { rampId: "old-1", walletAddress: address, rampType: "SELL", stage: "signing", inputAmount: "0.5", outputAmount: "570", transactions: { squidRouterApprove: "0xabc" }, createdAt: 7, symbol: "NVDA" };
function legacySetup() {
  const fixture = setup();
  fixture.backing.setItem("satoshi:stocks:active-ramp:v1", JSON.stringify(LEGACY));
  return fixture;
}

test("a record stored in the old single-record format is read as its wallet's", () => {
  const { store } = legacySetup();
  assert.deepEqual(store.get(address), LEGACY);
  assert.equal(store.get(address.toUpperCase().replace("0X", "0x")).rampId, "old-1");
  assert.equal(store.get(other), null, "still invisible to another wallet");
  assert.equal(store.hasActive(), true);
  assert.throws(() => store.save({ rampId: "r2", walletAddress: address }), { code: "RAMP_IN_PROGRESS" });
});

test("the first write converts an old record and keeps it, whichever wallet writes", () => {
  const { backing, store } = legacySetup();
  store.save({ rampId: "r2", walletAddress: other });
  assert.deepEqual(store.get(address), LEGACY);
  assert.equal(store.get(other).rampId, "r2");
  assert.deepEqual(Object.keys(JSON.parse(backing.getItem("satoshi:stocks:active-ramp:v1"))).sort(), [address, other].sort());
});

test("an old record can be checkpointed, resaved and cleared", () => {
  const checkpointed = legacySetup();
  checkpointed.store.checkpoint("old-1", "squidRouterSwap", "0xdef");
  assert.deepEqual(checkpointed.store.get(address).transactions, { squidRouterApprove: "0xabc", squidRouterSwap: "0xdef" });
  const resaved = legacySetup();
  resaved.store.save({ ...LEGACY, stage: "ready" });
  assert.equal(resaved.store.get(address).stage, "ready");
  assert.deepEqual(resaved.store.get(address).transactions, LEGACY.transactions, "its checkpoints survive");
  const cleared = legacySetup();
  cleared.store.clear("old-1");
  assert.equal(cleared.store.get(address), null);
  assert.equal(cleared.backing.getItem("satoshi:stocks:active-ramp:v1"), null, "the key goes with the last record");
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
