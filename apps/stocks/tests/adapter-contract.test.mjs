// One contract suite, run against both adapters: the UI must not care which one it talks to.
import assert from "node:assert/strict";
import test from "node:test";
import { createActiveRampStore } from "@vortexfi/consumer-kit";
import { readConfig } from "../src/lib/config.js";
import { RAMP_ADAPTER_METHODS, assertAdapterShape, createRampAdapter, freshPauseReason, isComingSoon, rampOpenState, uniformAvailability, withIssuerPauses } from "../src/lib/ramp-adapter.js";
import { STOCK_TOKENS, SHARED_COPY_PT, hoursPt } from "../src/lib/stocks.js";
import { tokenFlags } from "../src/lib/portfolio.js";
import { createSimulatedStocksAdapter } from "../src/lib/simulated-ramp.js";
import { STOCKS_KEYS } from "../src/lib/stores.js";
import { createVortexStocksAdapter } from "../src/lib/vortex-stocks.js";
import { NOW, fakeSdk, fakeSession, stores } from "./fake-vortex.mjs";
import { WALLET, fakeClock, jsonMemory } from "./helpers.mjs";

const QUOTE_TYPES = { id: "string", direction: "string", symbol: "string", tokenAddress: "string", brlAmount: "number", tokenAmount: "string", tokenAmountWei: "string", fees: "object", impliedBrlPerToken: "number", expiresAt: "number", gasless: "boolean", gasReserve: "object", simulated: "boolean", rawQuote: "object" };
const RAMP_TYPES = { id: "string", direction: "string", status: "string", currentPhase: "string", classification: "string", brlAmount: "string", tokenAmount: "string", simulatedPix: "boolean", createdAt: "string" };

const adapters = {
  vortex() {
    const sdk = fakeSdk({ statuses: [{ currentPhase: "nablaSwap" }, { currentPhase: "relayBridge" }, { currentPhase: "complete", status: "COMPLETE" }] });
    const recovery = stores();
    const adapter = createVortexStocksAdapter({
      enabled: true, apiBase: "https://www.vortexfinance.co/api/production", session: fakeSession(), activeRampStore: recovery.activeRampStore, ephemeralStore: recovery.ephemeralStore,
      kyc: { getReadiness: async () => ({ kycStatus: "approved", canBuy: true, canSell: true }) }, createClient: sdk.createClient, now: () => NOW,
      readMaintenance: async () => ({ active: false, details: null }),
      api: async () => [{ assetSymbol: "NVDA", assetNetwork: "robinhood", assetContractAddress: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", assetDecimals: 18, rampTypes: ["BUY", "SELL"] }],
    });
    return { adapter, pollOptions: { intervalMs: 1 } };
  },
  simulated() {
    const clock = fakeClock(NOW);
    const { storage } = jsonMemory();
    const adapter = createSimulatedStocksAdapter({
      getReferencePrice: () => ({ brl: 1163.89, updatedAt: clock.now() }), speed: "fast", storage, now: clock.now, sleep: clock.sleep,
      activeRampStore: createActiveRampStore({ activeKey: STOCKS_KEYS.simActiveRamp, historyKey: STOCKS_KEYS.simHistory, storage }),
    });
    return { adapter, pollOptions: {} };
  },
};

function assertTypes(value, types, label) {
  for (const [field, type] of Object.entries(types)) assert.equal(typeof value[field], type, `${label}.${field}`);
}

for (const [name, make] of Object.entries(adapters)) {
  test(`${name}: implements every contract method`, () => {
    const { adapter } = make();
    assert.doesNotThrow(() => assertAdapterShape(adapter));
    for (const method of RAMP_ADAPTER_METHODS) assert.equal(typeof adapter[method], "function", method);
    assert.equal(adapter.kind, name);
    assert.equal(adapter.enabled, true);
    assert.equal(typeof adapter.requiresVortexSession, "boolean");
  });

  test(`${name}: availability and readiness have the contract shape`, async () => {
    const { adapter } = make();
    const availability = await adapter.getAvailability();
    assert.equal(Object.keys(availability).length, 12);
    assert.deepEqual(Object.keys(availability.NVDA).sort(), ["buy", "reason", "sell"]);
    assert.equal(availability.NVDA.buy, true);
    const readiness = await adapter.getReadiness();
    assert.deepEqual(Object.keys(readiness).sort(), ["canBuy", "canSell", "kycStatus"]);
  });

  test(`${name}: quotes and ramps have the contract shape and a buy reaches success`, async () => {
    const { adapter, pollOptions } = make();
    const quote = await adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
    assertTypes(quote, QUOTE_TYPES, "quote");
    assert.equal(quote.direction, "BUY");
    assert.equal(quote.symbol, "NVDA");
    assert.equal(quote.tokenAddress, "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC");
    assert.deepEqual(Object.keys(quote.fees).sort(), ["currency", "network", "service", "total"]);
    assert.equal(quote.fees.currency, "BRL");
    assert.equal(BigInt(quote.tokenAmountWei) > 0n, true);
    const sellQuote = await adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0.5", walletAddress: WALLET });
    assertTypes(sellQuote, QUOTE_TYPES, "sell quote");
    assert.equal(sellQuote.tokenAmountWei, "500000000000000000");
    const ramp = await adapter.registerBuy({ quote, walletAddress: WALLET });
    assertTypes(ramp, RAMP_TYPES, "ramp");
    assert.equal(ramp.direction, "BUY");
    assert.equal(ramp.symbol, "NVDA");
    assert.equal(ramp.classification, "awaiting_payment");
    assert.ok(ramp.startDeadline > NOW);
    const started = await adapter.startRamp(ramp.id);
    assertTypes(started, RAMP_TYPES, "started ramp");
    const updates = [];
    const done = await adapter.pollStatus(ramp.id, { ...pollOptions, walletAddress: WALLET, onUpdate: (update) => { assertTypes(update, RAMP_TYPES, "update"); updates.push(update.classification); } });
    assert.equal(done.classification, "success");
    assert.ok(updates.length >= 1);
    assert.equal((await adapter.getRamp(ramp.id, { walletAddress: WALLET })).classification, "success");
  });

  test(`${name}: pollStatus honours an AbortSignal`, async () => {
    const { adapter, pollOptions } = make();
    const ramp = await adapter.registerBuy({ quote: await adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 }), walletAddress: WALLET });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(adapter.pollStatus(ramp.id, { ...pollOptions, signal: controller.signal }), { name: "AbortError" });
  });
}

test("giving up an operation is part of the contract, so the flows can call it on either adapter", () => {
  assert.ok(RAMP_ADAPTER_METHODS.includes("abandonRamp"));
});

test("the factory picks the adapter from the config", () => {
  const demo = createRampAdapter(readConfig({}), {});
  assert.equal(demo.kind, "simulated");
  const preview = createRampAdapter(readConfig({ VITE_STOCKS_MODE: "preview", VITE_PRIVY_APP_ID: "cmtiwhqgf01uu0el8lx3ejr35" }), {});
  assert.equal(preview.kind, "simulated");
  const gated = createRampAdapter(readConfig({ VITE_STOCKS_MODE: "live", VITE_PRIVY_APP_ID: "cmtiwhqgf01uu0el8lx3ejr35" }), {});
  assert.equal(gated.kind, "vortex");
  assert.equal(gated.enabled, false);
  assert.equal(gated.requiresVortexSession, true);
  const live = createRampAdapter(readConfig({ VITE_STOCKS_MODE: "live", VITE_PRIVY_APP_ID: "cmtiwhqgf01uu0el8lx3ejr35", VITE_STOCKS_RAMP_ENABLED: "true" }), {});
  assert.equal(live.enabled, true);
});

test("issuer pauses override availability and \"coming soon\" covers both gated states", () => {
  const availability = { NVDA: { buy: true, sell: true, reason: null }, META: { buy: true, sell: true, reason: null } };
  const next = withIssuerPauses(availability, { META: { paused: true }, NVDA: { paused: false } });
  assert.deepEqual(next.META, { buy: false, sell: false, reason: "paused" });
  assert.deepEqual(next.NVDA, availability.NVDA);
  assert.equal(isComingSoon("not_enabled"), true);
  assert.equal(isComingSoon("network_not_supported"), true);
  assert.equal(isComingSoon("paused"), false);
});

test("before money moves, a fresh read must show the token unpaused (fail closed)", () => {
  const position = (symbol, paused, oraclePaused) => ({ symbol, address: "0x", raw: 0n, multiplierWei: null, paused, oraclePaused });
  const flags = tokenFlags({ positions: [position("NVDA", false, false), position("META", false, true), position("QQQ", true, false), position("SPY", null, null), position("AAPL", false, null)] });
  assert.equal(freshPauseReason(flags.NVDA), null);
  assert.equal(freshPauseReason(flags.META), "paused", "oraclePaused");
  assert.equal(freshPauseReason(flags.QQQ), "paused");
  assert.equal(freshPauseReason(flags.SPY), "error", "both pause reads failed: unknown is not tradable");
  assert.equal(freshPauseReason(flags.AAPL), "error", "both flags must be known false");
  assert.equal(freshPauseReason(tokenFlags({ positions: [position("AAPL", null, false)] }).AAPL), "error");
  assert.equal(freshPauseReason(flags.TSLA), "error", "not in the read");
  assert.equal(freshPauseReason(null), "error", "the read itself failed");
});

test("buying is open only when known: unknown availability promises neither \"Comprar com Pix\" nor \"em breve\"", () => {
  const live = { rampKind: "vortex", rampEnabled: true };
  assert.equal(rampOpenState({ rampKind: "simulated", rampEnabled: false }, null), true);
  assert.equal(rampOpenState({ rampKind: "vortex", rampEnabled: false }, null), false, "ramp off: em breve");
  assert.equal(rampOpenState(live, null), null, "the anonymous landing before (or without) the answer");
  assert.equal(rampOpenState(live, uniformAvailability(STOCK_TOKENS, "network_not_supported")), false, "the API does not know the network yet");
  assert.equal(rampOpenState(live, { ...uniformAvailability(STOCK_TOKENS, "token_not_listed"), NVDA: { buy: true, sell: true, reason: null } }), true);
  assert.equal(rampOpenState(live, uniformAvailability(STOCK_TOKENS, "not_enabled")), false, "the corridor is off");
  assert.equal(rampOpenState(live, uniformAvailability(STOCK_TOKENS, "error")), null, "a failed listing says nothing about the ramp");
  const sellOnly = Object.fromEntries(STOCK_TOKENS.map((token) => [token.symbol, { buy: false, sell: true, reason: null }]));
  assert.equal(rampOpenState(live, sellOnly), false, "sells alone do not open buying with Pix");
  // With the ramp off the FAQ does not say "Compre quando quiser" as if buying were possible today.
  assert.equal(hoursPt(true), SHARED_COPY_PT.hours);
  assert.equal(hoursPt(null), SHARED_COPY_PT.hours);
  assert.match(hoursPt(false), /^Quando a compra com Pix for liberada: compre quando quiser, inclusive à noite/);
});
