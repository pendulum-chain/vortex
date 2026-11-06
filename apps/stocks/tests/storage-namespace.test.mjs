import assert from "node:assert/strict";
import test from "node:test";
import { SHARED_KEYS, createJsonStorage } from "@vortexfi/consumer-kit";
import { EPHEMERAL_DB_NAME, STOCKS_KEYS, chartKey, createRampStores, createWelcomeStore, saveReturnHash, takeReturnHash } from "../src/lib/stores.js";
import { STOCK_TOKENS } from "../src/lib/stocks.js";
import { WALLET, jsonMemory, memoryStorage, sourceFiles } from "./helpers.mjs";

const GOLD = ["satoshi:gold:", "satoshi:paxg-market:v2"];
const sharedKeys = Object.values(SHARED_KEYS);
const ownsKey = (key) => key.startsWith("satoshi:stocks:") || sharedKeys.includes(key);
const collidesWithGold = (key) => GOLD.some((gold) => key === gold || key.startsWith(gold) || gold.startsWith(key));

test("every Stocks key is satoshi:stocks:* and never touches Gold's keys", () => {
  const keys = [...Object.values(STOCKS_KEYS), ...STOCK_TOKENS.flatMap((token) => [chartKey(token.chart.coingeckoId), chartKey(token.coingeckoId)])];
  for (const key of keys) {
    assert.ok(key.startsWith("satoshi:stocks:"), key);
    assert.match(key, /:v\d+$/, key);
    assert.ok(!collidesWithGold(key), key);
  }
  assert.equal(new Set(Object.values(STOCKS_KEYS)).size, Object.values(STOCKS_KEYS).length);
  assert.equal(STOCKS_KEYS.activeRamp, "satoshi:stocks:active-ramp:v1");
  assert.equal(STOCKS_KEYS.history, "satoshi:stocks:history:v1");
  assert.equal(chartKey("sp500-xstock"), "satoshi:stocks:chart:sp500-xstock:v1");
});

test("the Vortex session key is the one shared with Gold", () => {
  assert.equal(SHARED_KEYS.vortexSession, "satoshi:vortex-session:v2");
});

test("no source file writes a satoshi: key outside the Stocks namespace or the shared keys", () => {
  for (const file of sourceFiles()) {
    for (const [, key] of file.text.matchAll(/["'`](satoshi:[^"'`]*)["'`]/g)) {
      assert.ok(ownsKey(key), `${file.path} uses ${key}`);
      assert.ok(!collidesWithGold(key), `${file.path} uses Gold's ${key}`);
    }
  }
});

test("the encrypted key store is Stocks' own IndexedDB database", () => {
  assert.equal(EPHEMERAL_DB_NAME, "satoshi-stocks-secure");
  assert.notEqual(EPHEMERAL_DB_NAME, "satoshi-gold-secure");
});

test("real and simulated recovery records use separate keys and storages", () => {
  const localBacking = memoryStorage();
  const sessionBacking = memoryStorage();
  const localStorage = createJsonStorage(() => localBacking);
  const sessionStorage = createJsonStorage(() => sessionBacking);
  const real = createRampStores({ simulated: false, localStorage, sessionStorage });
  const simulated = createRampStores({ simulated: true, localStorage, sessionStorage });
  assert.equal(typeof real.ephemeral.put, "function");
  assert.equal(simulated.ephemeral, null);
  real.activeRamp.save({ rampId: "r1", walletAddress: WALLET });
  simulated.activeRamp.save({ rampId: "sim-r-1", walletAddress: WALLET });
  assert.deepEqual([...localBacking.memory.keys()], ["satoshi:stocks:active-ramp:v1"]);
  assert.deepEqual([...sessionBacking.memory.keys()], ["satoshi:stocks:sim-active-ramp:v1"]);
  assert.equal(real.activeRamp.get(WALLET).rampId, "r1");
  assert.equal(simulated.activeRamp.get(WALLET).rampId, "sim-r-1");
});

test("the welcome sheet is remembered per Privy DID on this device", () => {
  const { storage } = jsonMemory();
  const welcome = createWelcomeStore(storage);
  assert.equal(welcome.has("did:privy:fake-test-only-a"), false);
  welcome.mark("did:privy:fake-test-only-a");
  welcome.mark("did:privy:fake-test-only-a");
  assert.equal(welcome.has("did:privy:fake-test-only-a"), true);
  assert.equal(welcome.has("did:privy:fake-test-only-b"), false);
  assert.deepEqual(storage.get(STOCKS_KEYS.welcomed), ["did:privy:fake-test-only-a"]);
  welcome.mark("");
  assert.equal(welcome.has(""), false);
});

test("the OAuth return hash is restored once and only for app routes", () => {
  const { storage } = jsonMemory();
  saveReturnHash("#/acao/NVDA", storage);
  assert.equal(takeReturnHash(storage), "#/acao/NVDA");
  assert.equal(takeReturnHash(storage), null);
  for (const bad of ["#/", "https://evil.example/#/x", "#javascript:alert(1)", "/pt-br/gold/", 42]) {
    saveReturnHash(bad, storage);
    assert.equal(takeReturnHash(storage), null, String(bad));
  }
  saveReturnHash("#/explorar?c=big-techs&q=apple", storage);
  assert.equal(takeReturnHash(storage), "#/explorar?c=big-techs&q=apple");
});
