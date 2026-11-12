import assert from "node:assert/strict";
import test from "node:test";
import { APP_NAMES, SHARED_KEYS, appKey, createJsonStorage, local, session } from "../src/storage.js";
import { memoryStorage, throwingStorage } from "./helpers.mjs";

test("app keys follow satoshi:<app>:<name>:v<n>", () => {
  assert.equal(appKey("stocks", "active-ramp", 1), "satoshi:stocks:active-ramp:v1");
  assert.equal(appKey("stocks", "chart:sp500-xstock", 1), "satoshi:stocks:chart:sp500-xstock:v1");
  assert.deepEqual([...APP_NAMES], ["gold", "stocks", "family", "consumer"]);
});

test("app keys reject unknown apps, names outside [a-z0-9-] and bad versions", () => {
  assert.throws(() => appKey("Stocks", "active-ramp", 1), /Unknown consumer app/);
  assert.throws(() => appKey("bank", "active-ramp", 1), /Unknown consumer app/);
  for (const name of ["a b", "Active", "", "a:", ":a", "a/b", undefined]) assert.throws(() => appKey("stocks", name, 1), /Invalid storage key name/);
  for (const version of [0, 1.5, "1", undefined]) assert.throws(() => appKey("stocks", "history", version), /Invalid storage key version/);
});

test("the shared keys stay the ones Gold writes today", () => {
  assert.equal(SHARED_KEYS.vortexSession, "satoshi:vortex-session:v2");
  assert.equal(SHARED_KEYS.logoutSignal, "satoshi:consumer:logout:v1");
  assert.throws(() => { SHARED_KEYS.vortexSession = "other"; });
});

test("the JSON wrapper round-trips values and falls back on missing or invalid JSON", () => {
  const backing = memoryStorage();
  const store = createJsonStorage(() => backing);
  assert.equal(store.set("k", { a: 1 }), true);
  assert.deepEqual(store.get("k"), { a: 1 });
  assert.equal(store.get("missing", "fallback"), "fallback");
  backing.setItem("broken", "{not json");
  assert.equal(store.get("broken", 7), 7);
  store.remove("k");
  assert.equal(store.get("k"), null);
});

test("the JSON wrapper survives private mode, a full quota and missing storage", () => {
  for (const getStorage of [() => throwingStorage, () => null, () => { throw new Error("SecurityError"); }]) {
    const store = createJsonStorage(getStorage);
    assert.equal(store.get("k", "fallback"), "fallback");
    assert.equal(store.set("k", 1), false);
    assert.doesNotThrow(() => store.remove("k"));
  }
});

test("local and session resolve the browser storages at call time", () => {
  const originalWindow = globalThis.window;
  const localBacking = memoryStorage();
  const tabBacking = memoryStorage();
  const localDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", { value: localBacking, configurable: true, writable: true });
    globalThis.window = { sessionStorage: tabBacking };
    assert.equal(local.set("a", 1), true);
    assert.equal(session.set("b", 2), true);
    assert.equal(localBacking.getItem("a"), "1");
    assert.equal(tabBacking.getItem("b"), "2");
  } finally {
    if (localDescriptor) Object.defineProperty(globalThis, "localStorage", localDescriptor);
    else delete globalThis.localStorage;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
