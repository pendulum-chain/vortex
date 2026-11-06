import assert from "node:assert/strict";
import test from "node:test";
import { createActiveRampStore } from "@vortexfi/consumer-kit";
import { parseUnits } from "viem";
import { DEMO_ETH_WEI, createDemoHoldings } from "../src/lib/portfolio.js";
import { SIM_GAS_RESERVE, SIM_PHASES, SIM_PHASE_MS, createSimulatedStocksAdapter, simulatedFees, simulatedGasReserve } from "../src/lib/simulated-ramp.js";
import { STOCKS_KEYS } from "../src/lib/stores.js";
import { WALLET, fakeClock, forbiddenFetch, jsonMemory, withFetch } from "./helpers.mjs";

const WEI = 10n ** 18n;
const PRICES = { NVDA: 1163.89, SPY: 3997.21 };

test("a failed settled-marker write never credits a simulated purchase twice", async () => {
  const memory = jsonMemory(), originalSet = memory.storage.set;
  let fail = false;
  memory.storage.set = (key, value) => fail && key === STOCKS_KEYS.simRamps ? false : originalSet(key, value);
  const s = setup({ memory });
  const quote = await s.adapter.quoteBuy({ symbol: "SPY", brlAmount: 500, walletAddress: WALLET });
  const ramp = await s.adapter.registerBuy({ quote, walletAddress: WALLET });
  await s.adapter.startRamp(ramp.id); s.clock.advance(60_000); fail = true;
  await assert.rejects(s.adapter.getRamp(ramp.id), /salvar/);
  const once = s.demoHoldings.balanceOf("SPY");
  await assert.rejects(s.adapter.getRamp(ramp.id), /salvar/);
  assert.equal(s.demoHoldings.balanceOf("SPY"), once);
  fail = false; await s.adapter.getRamp(ramp.id); assert.equal(s.demoHoldings.balanceOf("SPY"), once);
});

function setup({ speed = "fast", holdings = true, clock = fakeClock(), memory = jsonMemory() } = {}) {
  const activeRampStore = createActiveRampStore({ activeKey: STOCKS_KEYS.simActiveRamp, historyKey: STOCKS_KEYS.simHistory, storage: memory.storage });
  const demoHoldings = holdings ? createDemoHoldings({ storage: memory.storage }) : null;
  const adapter = createSimulatedStocksAdapter({
    getReferencePrice: (symbol) => (PRICES[symbol] ? { brl: PRICES[symbol], updatedAt: clock.now() } : null),
    speed, activeRampStore, storage: memory.storage, now: clock.now, sleep: clock.sleep, demoHoldings,
  });
  return { adapter, activeRampStore, demoHoldings, clock, memory };
}

/** A wallet whose every use fails the test: the simulated adapter must never touch it. */
function trapWallet(calls) {
  return { provider: { request: async (args) => { calls.push(args); throw new Error("unexpected wallet call"); } }, publicClient: {} };
}

test("fees follow the illustrative model and are deterministic", () => {
  assert.deepEqual(simulatedFees(500), { network: 1, service: 3, total: 4, currency: "BRL" });
  assert.deepEqual(simulatedFees(1000), { network: 1, service: 5, total: 6, currency: "BRL" });
  assert.deepEqual(simulatedFees(100), simulatedFees(100));
});

test("a buy quote floors the tokens to 18 decimals and never overpays", async () => {
  const { adapter, clock, demoHoldings } = setup();
  demoHoldings.apply({ direction: "BUY", symbol: "NVDA", tokenAmountWei: 0n, gasReserveWei: SIM_GAS_RESERVE.targetWei }); // a funded wallet: no reserve
  const quote = await adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  assert.equal(quote.gasReserve, null);
  const expected = (parseUnits("496", 18) * WEI) / parseUnits("1163.89", 18);
  assert.equal(quote.tokenAmountWei, expected.toString());
  assert.ok(BigInt(quote.tokenAmountWei) * parseUnits("1163.89", 18) <= parseUnits("496", 18) * WEI);
  assert.equal(quote.simulated, true);
  assert.equal(quote.gasless, false);
  assert.match(quote.id, /^sim-q-\d+$/);
  assert.equal(quote.expiresAt, clock.now() + 60_000);
  assert.ok(Math.abs(quote.impliedBrlPerToken - 1163.89) / 1163.89 < 1e-9, "no hidden spread: the price guard sees ~0%");
  await assert.rejects(adapter.quoteBuy({ symbol: "MSFT", brlAmount: 500 }), (error) => error.code === "TOKEN_UNAVAILABLE", "no reference price, no quote");
  await assert.rejects(adapter.quoteBuy({ symbol: "NU", brlAmount: 500 }), (error) => error.code === "TOKEN_NOT_ALLOWED");
});

test("the reserve follows the rule: below 0.00002 ETH, top up to 0.00005 ETH", () => {
  assert.equal(SIM_GAS_RESERVE.targetWei, 50_000_000_000_000n);
  assert.equal(SIM_GAS_RESERVE.thresholdWei, 20_000_000_000_000n);
  assert.deepEqual({ ...simulatedGasReserve(0n) }, { amount: "0.00005", amountWei: "50000000000000", currency: "ETH", brl: 0.71, usd: null });
  assert.deepEqual({ ...simulatedGasReserve(null) }, { ...simulatedGasReserve(0n) }, "unknown balance: the full target");
  assert.equal(simulatedGasReserve(DEMO_ETH_WEI).amountWei, "40000000000000", "target minus balance");
  assert.equal(simulatedGasReserve(DEMO_ETH_WEI).brl, 0.57);
  assert.equal(simulatedGasReserve(19_999_999_999_999n).amountWei, "30000000000001");
  assert.equal(simulatedGasReserve(20_000_000_000_000n), null);
  assert.equal(simulatedGasReserve(10n ** 18n), null);
});

test("the first demo buy includes the reserve inside the total; after it settles, buys do not", async () => {
  const { adapter, demoHoldings } = setup();
  assert.equal(demoHoldings.ethWei(), DEMO_ETH_WEI);
  const first = await adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  assert.equal(first.gasReserve.amountWei, "40000000000000");
  assert.deepEqual(first.fees, { network: 1, service: 3, total: 4.57, currency: "BRL" }, "network excludes the reserve; total includes it");
  assert.equal(first.tokenAmountWei, ((parseUnits("495.43", 18) * WEI) / parseUnits("1163.89", 18)).toString(), "the reserve is paid out of the amount");
  assert.ok(Math.abs(first.impliedBrlPerToken - 1163.89) / 1163.89 < 1e-9, "the price guard still sees ~0%");
  assert.equal((await adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0.1" })).gasReserve, null, "a sell has no reserve");
  const ramp = await adapter.registerBuy({ quote: first, walletAddress: WALLET });
  await adapter.startRamp(ramp.id);
  assert.equal((await adapter.pollStatus(ramp.id)).classification, "success");
  assert.equal(demoHoldings.ethWei(), SIM_GAS_RESERVE.targetWei, "the ETH arrived with the tokens");
  const second = await adapter.quoteBuy({ symbol: "SPY", brlAmount: 500, walletAddress: WALLET });
  assert.equal(second.gasReserve, null);
  assert.equal(second.fees.total, 4);
});

test("preview (no demo holdings) quotes the full reserve, as Vortex does without a wallet address", async () => {
  const { adapter } = setup({ holdings: false });
  const quote = await adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  assert.equal(quote.gasReserve.amountWei, "50000000000000");
  assert.equal(quote.fees.total, 4.71);
});

test("a buy walks to complete, credits the demo holding and settles into history", async () => {
  const { adapter, activeRampStore, demoHoldings, clock } = setup();
  const before = demoHoldings.balanceOf("NVDA");
  const quote = await adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500, walletAddress: WALLET });
  const ramp = await adapter.registerBuy({ quote, walletAddress: WALLET });
  assert.equal(ramp.classification, "awaiting_payment");
  assert.equal(ramp.depositQrCode, null);
  assert.equal(ramp.simulatedPix, true);
  assert.equal(activeRampStore.get(WALLET).stage, "registered");
  assert.equal(activeRampStore.get(WALLET).simulated, true);
  clock.advance(60_000);
  await adapter.startRamp(ramp.id);
  const phases = [];
  const done = await adapter.pollStatus(ramp.id, { onUpdate: (update) => { if (phases.at(-1) !== update.currentPhase) phases.push(update.currentPhase); } });
  assert.deepEqual(phases, [...SIM_PHASES.BUY]);
  assert.equal(done.classification, "success");
  assert.equal(done.symbol, "NVDA");
  assert.equal(done.explorerLink, null, "no fake transaction link");
  assert.equal(demoHoldings.balanceOf("NVDA"), before + BigInt(quote.tokenAmountWei));
  assert.equal(activeRampStore.get(WALLET), null);
  assert.equal(activeRampStore.history(WALLET)[0].simulated, true);
  await adapter.getRamp(ramp.id);
  assert.equal(demoHoldings.balanceOf("NVDA"), before + BigInt(quote.tokenAmountWei), "settles once");
});

test("a sell walks to complete and debits the holding; more than the holding is refused", async () => {
  const walletCalls = [];
  const { adapter, demoHoldings } = setup({ speed: "normal" });
  await assert.rejects(adapter.registerSell({ quote: await adapter.quoteSell({ symbol: "NVDA", tokenAmount: "5" }), walletAddress: WALLET, pixKey: "k", wallet: trapWallet(walletCalls) }), (error) => error.code === "INSUFFICIENT_BALANCE");
  const quote = await adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0,5", walletAddress: WALLET });
  assert.equal(quote.tokenAmountWei, (WEI / 2n).toString());
  assert.ok(quote.brlAmount > 0 && quote.brlAmount < 1163.89 / 2);
  const registered = [];
  const ramp = await adapter.registerSell({ quote, walletAddress: WALLET, pixKey: "fake-test-only@example.com", wallet: trapWallet(walletCalls), onRegistered: (r) => registered.push(r.id) });
  assert.deepEqual(registered, [ramp.id]);
  await adapter.startRamp(ramp.id);
  const phases = [];
  const done = await adapter.pollStatus(ramp.id, { onUpdate: (update) => { if (phases.at(-1) !== update.currentPhase) phases.push(update.currentPhase); } });
  assert.deepEqual(phases, [...SIM_PHASES.SELL]);
  assert.equal(done.classification, "success");
  assert.equal(demoHoldings.balanceOf("NVDA"), 1_200000000000000000n - WEI / 2n);
  assert.deepEqual(walletCalls, [], "the simulated sell never asks the wallet");
});

test("no Pix code, no Vortex call and no wallet call anywhere in a simulated ramp", async () => {
  const fetches = [];
  const walletCalls = [];
  const { adapter, memory } = setup();
  await withFetch(forbiddenFetch(fetches), async () => {
    const buy = await adapter.registerBuy({ quote: await adapter.quoteBuy({ symbol: "SPY", brlAmount: 1000 }), walletAddress: WALLET });
    await adapter.startRamp(buy.id);
    const done = await adapter.pollStatus(buy.id);
    const sell = await adapter.registerSell({ quote: await adapter.quoteSell({ symbol: "SPY", tokenAmount: "0.1" }), walletAddress: WALLET, pixKey: "k", wallet: trapWallet(walletCalls) });
    await adapter.resumeSell({ rampId: sell.id, walletAddress: WALLET, wallet: trapWallet(walletCalls) });
    for (const ramp of [buy, done, sell]) {
      assert.equal(ramp.depositQrCode, null);
      assert.doesNotMatch(JSON.stringify(ramp), /000201|BR\.GOV\.BCB\.PIX/i);
    }
    assert.deepEqual(await adapter.getReadiness(), { kycStatus: "approved", canBuy: true, canSell: true });
    const availability = await adapter.getAvailability();
    for (const entry of Object.values(availability)) assert.deepEqual(entry, { buy: true, sell: true, reason: null });
  });
  assert.deepEqual(fetches, []);
  assert.deepEqual(walletCalls, []);
  assert.doesNotMatch(JSON.stringify([...memory.backing.memory.values()]), /000201/);
});

test("a reload resumes from sessionStorage (a new adapter over the same storage)", async () => {
  const memory = jsonMemory();
  const clock = fakeClock();
  const first = setup({ memory, clock });
  const ramp = await first.adapter.registerBuy({ quote: await first.adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 }), walletAddress: WALLET });
  await first.adapter.startRamp(ramp.id);
  clock.advance(SIM_PHASE_MS.fast * 2 + 1);
  const second = setup({ memory, clock });
  const resumed = await second.adapter.getRamp(ramp.id);
  assert.equal(resumed.currentPhase, SIM_PHASES.BUY[2]);
  assert.equal(resumed.classification, "processing");
  assert.equal(second.activeRampStore.get(WALLET).rampId, ramp.id, "the resume banner still finds it");
  const next = await second.adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 });
  assert.notEqual(next.id, "sim-q-1", "ids keep counting after a reload");
  await assert.rejects(second.adapter.getRamp("sim-r-999"), (error) => error.status === 404);
});

test("quotes expire, belong to their adapter and the Pix start window is 15 minutes", async () => {
  const { adapter, clock, activeRampStore } = setup();
  const stale = await adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 });
  clock.advance(60_001);
  await assert.rejects(adapter.registerBuy({ quote: stale, walletAddress: WALLET }), (error) => error.code === "INVALID_QUOTE");
  await assert.rejects(adapter.registerBuy({ quote: { ...stale, id: "sim-q-forged" }, walletAddress: WALLET }), (error) => error.code === "INVALID_QUOTE");
  const fresh = await adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 });
  await assert.rejects(adapter.registerBuy({ quote: fresh, walletAddress: "" }), (error) => error.code === "WALLET_NOT_READY");
  const again = await adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 });
  const ramp = await adapter.registerBuy({ quote: again, walletAddress: WALLET });
  clock.advance(15 * 60_000 + 1);
  await assert.rejects(adapter.startRamp(ramp.id), /prazo para iniciar/);
  // Unpaid for an hour: abandoned, so it stops blocking new operations (Gold rule).
  clock.advance(60 * 60_000);
  assert.equal((await adapter.getRamp(ramp.id)).classification, "failure");
  assert.equal(activeRampStore.get(WALLET), null);
});

test("polling stops when the flow is closed (AbortSignal)", async () => {
  const { adapter } = setup();
  const ramp = await adapter.registerBuy({ quote: await adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 }), walletAddress: WALLET });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(adapter.pollStatus(ramp.id, { signal: controller.signal }), { name: "AbortError" });
});

test("preview (no demo holdings) does not check or move balances", async () => {
  const { adapter } = setup({ holdings: false, speed: "normal" });
  const quote = await adapter.quoteSell({ symbol: "NVDA", tokenAmount: "3" });
  const ramp = await adapter.registerSell({ quote, walletAddress: WALLET, pixKey: "k", wallet: trapWallet([]) });
  await adapter.startRamp(ramp.id);
  assert.equal((await adapter.pollStatus(ramp.id)).classification, "success");
});

test("one operation per device: an unpaid simulated buy blocks a second buy or sell until it ends", async () => {
  const { adapter, activeRampStore } = setup();
  const first = await adapter.registerBuy({ quote: await adapter.quoteBuy({ symbol: "NVDA", brlAmount: 500 }), walletAddress: WALLET });
  await assert.rejects(adapter.registerBuy({ quote: await adapter.quoteBuy({ symbol: "SPY", brlAmount: 500 }), walletAddress: WALLET }), (error) => error.code === "RAMP_IN_PROGRESS");
  await assert.rejects(adapter.registerSell({ quote: await adapter.quoteSell({ symbol: "NVDA", tokenAmount: "0.1" }), walletAddress: WALLET, pixKey: "k", wallet: trapWallet([]) }), (error) => error.code === "RAMP_IN_PROGRESS");
  assert.equal(activeRampStore.get(WALLET).rampId, first.id);
  await adapter.startRamp(first.id);
  assert.equal((await adapter.pollStatus(first.id)).classification, "success");
  assert.ok(await adapter.registerBuy({ quote: await adapter.quoteBuy({ symbol: "SPY", brlAmount: 500 }), walletAddress: WALLET }), "free again once it settled");
});
