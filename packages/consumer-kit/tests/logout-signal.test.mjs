import assert from "node:assert/strict";
import test from "node:test";
import { onLogoutSignal, signalLogout } from "../src/logout-signal.js";
import { SHARED_KEYS, createJsonStorage } from "../src/storage.js";
import { memoryStorage } from "./helpers.mjs";

const storageEvent = (key, newValue) => Object.assign(new Event("storage"), { key, newValue });

test("a logout is broadcast through the shared localStorage key", () => {
  const backing = memoryStorage();
  const before = Date.now();
  signalLogout(createJsonStorage(() => backing));
  assert.ok(Number(backing.getItem(SHARED_KEYS.logoutSignal)) >= before);
});

test("other tabs react only to the logout key being set, until unsubscribed", () => {
  const target = new EventTarget();
  let calls = 0;
  const unsubscribe = onLogoutSignal(() => { calls += 1; }, target);
  target.dispatchEvent(storageEvent("privy:token", "x"));
  target.dispatchEvent(storageEvent(SHARED_KEYS.logoutSignal, null));
  target.dispatchEvent(storageEvent(SHARED_KEYS.logoutSignal, "1727359200000"));
  assert.equal(calls, 1);
  unsubscribe();
  target.dispatchEvent(storageEvent(SHARED_KEYS.logoutSignal, "1727359200001"));
  assert.equal(calls, 1);
});

test("without a window (tests, SSR) subscribing is a no-op", () => {
  assert.equal(typeof onLogoutSignal(() => {}, undefined), "function");
});
