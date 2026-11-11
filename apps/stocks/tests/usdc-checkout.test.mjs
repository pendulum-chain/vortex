import assert from "node:assert/strict";
import test from "node:test";
import { createActiveRampStore } from "@vortexfi/consumer-kit";
import { parseUnits } from "viem";
import { createUsdcCheckout, BASE_CHAIN_ID, BASE_USDC, USDC_QUOTE_MS, USDC_PAYMENT_MS, usdcRaw } from "../src/lib/usdc-checkout.js";
import { createDemoHoldings } from "../src/lib/portfolio.js";
import { flowFor } from "../src/lib/detail-actions.js";
import { readConfig } from "../src/lib/config.js";
import { localHistoryRows } from "../src/lib/history.js";
import { STOCKS_KEYS } from "../src/lib/stores.js";
import { WALLET, jsonMemory } from "./helpers.mjs";

const OTHER = "0x0000000000000000000000000000000000000001";
function setup(mode = "demo") {
  const { storage } = jsonMemory();
  let time = 1_800_000_000_000, price = 200, timestamp = time;
  const active = createActiveRampStore({ activeKey: STOCKS_KEYS.simActiveRamp, historyKey: STOCKS_KEYS.simHistory, storage });
  const holdings = createDemoHoldings({ storage, initial: { NVDA: "1" }, initialEthWei: 0n });
  const cfg = { mode, storage, activeRampStore: active, holdings, getPrice: () => ({ usd: price, updatedAt: timestamp }), now: () => time };
  const api = createUsdcCheckout(cfg);
  const q = (amount = "100", direction = "BUY") => api.quote({ wallet: WALLET, symbol: "NVDA", amount, direction });
  const register = (amount = "100") => api.register(q(amount), WALLET);
  const receipt = (amount = "100", overrides = {}) => ({ id: "demo-receipt-1", chainId: BASE_CHAIN_ID, token: BASE_USDC, to: WALLET, amount, confirmations: 2, ...overrides });
  return { api, cfg, active, holdings, q, register, receipt, storage,
    advance(ms) { time += ms; timestamp = time; }, setPrice(n) { price = n; timestamp = time; }, stale() { timestamp -= 121_000; },
  };
}

test("USDC cannot replace another wallet's pending Pix recovery record", () => {
  const s = setup();
  s.active.save({ rampId: "paid-pix", walletAddress: OTHER });
  assert.throws(() => s.api.register(s.q(), WALLET), /existing order/);
  assert.equal(s.active.get(OTHER).rampId, "paid-pix");
});
test("a failed late-deposit write retains recovery, then receipt replay credits exactly once", () => {
  const s = setup(), order = s.register(), originalSet = s.storage.set;
  s.advance(USDC_PAYMENT_MS + 1);
  s.storage.set = (key, value) => key === STOCKS_KEYS.usdcSimulation ? false : originalSet(key, value);
  assert.throws(() => s.api.receive(order.id, WALLET, s.receipt()), /Could not save/);
  assert.equal(s.active.get(WALLET).rampId, order.id);
  assert.equal(s.api.balanceRaw(WALLET), 0n);
  s.storage.set = originalSet;
  assert.equal(s.api.receive(order.id, WALLET, s.receipt()).status, "funds_available");
  assert.equal(s.active.get(WALLET), null);
  s.api.receive(order.id, WALLET, s.receipt());
  assert.equal(s.api.balanceRaw(WALLET), 100_000_000n);
});
test("USDC inputs preserve native 6-decimal precision and reject ambiguous values", () => {
  assert.equal(usdcRaw("10.000001"), 10_000_001n);
  for (const x of ["1e2", "10,01", "-1", "0", "10.0000001", " 100", "1000001", Infinity]) assert.throws(() => usdcRaw(x));
});
test("quotes disclose direct provider costs, a single Vortex fee and zero product markup", () => {
  const s = setup(); const q = s.q();
  assert.equal(q.routingStrategy, "direct"); assert.equal(q.chainId, 8453);
  assert.equal(q.productFeeRaw, "0");
  assert.deepEqual(q.costs.map((c) => c.provider), ["Relay", "Uniswap", "Vortex", "Networks", "ETH reserve"]);
  assert.equal(q.costs.find((c) => c.id === "vortex").raw, "100000");
  assert.equal(q.costs.reduce((a, c) => a + BigInt(c.raw), 0n), BigInt(q.totalFeesRaw));
  assert.equal(BigInt(q.outputRaw) * parseUnits("200", 18) / 10n ** 30n, BigInt(q.grossRaw) - BigInt(q.totalFeesRaw));
});
test("no live USDC execution, deposit mutation, quote, endpoint or signature is enabled", () => {
  const s = setup("live");
  assert.equal(s.api.enabled, false);
  assert.throws(() => s.q(), /not live/);
  assert.throws(() => s.api.receive("id", WALLET, s.receipt()), /not live/);
  assert.throws(() => s.api.execute("id", WALLET), /not live/);
  assert.equal(s.active.get(WALLET), null);
});
test("expired, modified and stale-price quotes cannot register a payment", () => {
  const s = setup(); const q = s.q();
  assert.throws(() => s.api.register({ ...q, grossRaw: "1" }, WALLET), /expired/);
  s.advance(USDC_QUOTE_MS);
  assert.throws(() => s.api.register(q, WALLET), /expired/);
  s.stale(); assert.throws(() => s.q(), /fresh USD price/);
});
test("confirmed Base USDC only: partial funding waits; duplicate receipts never double-credit", () => {
  const s = setup(); const o = s.register();
  for (const receipt of [s.receipt("100", { chainId: 137 }), s.receipt("100", { token: OTHER }), s.receipt("100", { to: OTHER })]) assert.throws(() => s.api.receive(o.id, WALLET, receipt));
  s.api.receive(o.id, WALLET, s.receipt("50", { confirmations: 1 }));
  assert.equal(s.api.balanceRaw(WALLET), 0n);
  assert.equal(s.api.receive(o.id, WALLET, s.receipt("50")).status, "awaiting_funds");
  s.api.receive(o.id, WALLET, s.receipt("50"));
  assert.equal(s.api.balanceRaw(WALLET), 50_000_000n);
  assert.throws(() => s.api.receive(o.id, WALLET, s.receipt("51")), /Conflicting/);
  assert.throws(() => s.api.execute(o.id, WALLET), /remaining/);
  assert.equal(s.api.receive(o.id, WALLET, s.receipt("50", { id: "demo-receipt-2" })).status, "ready");
});
test("excess funds remain available; execution and settlement are idempotent across reload", () => {
  const s = setup(); const o = s.register();
  s.api.receive(o.id, WALLET, s.receipt("125"));
  s.api.execute(o.id, WALLET); s.api.execute(o.id, WALLET);
  s.advance(4001);
  const reloaded = createUsdcCheckout(s.cfg);
  const done = reloaded.get(o.id, WALLET); const tokens = s.holdings.balanceOf("NVDA");
  assert.equal(done.status, "complete"); assert.equal(reloaded.balanceRaw(WALLET), 25_000_000n);
  reloaded.get(o.id, WALLET); reloaded.execute(o.id, WALLET);
  assert.equal(s.holdings.balanceOf("NVDA"), tokens);
  assert.equal(s.active.history(WALLET).length, 1);
  const row = localHistoryRows(s.active.history(WALLET))[0];
  assert.equal(row.usdcAmount, "100"); assert.equal(row.brlAmount, null);
  assert.equal(s.active.get(WALLET), null);
  assert.equal(s.q().costs.find((c) => c.id === "reserve").raw, "0", "reserve delivered once");
});
test("price deterioration after funding requires new approval; another deterioration cannot be silently accepted", () => {
  const s = setup(); const o = s.register(); s.api.receive(o.id, WALLET, s.receipt());
  s.setPrice(210); assert.equal(s.api.execute(o.id, WALLET).status, "needs_review");
  assert.equal(s.holdings.balanceOf("NVDA"), parseUnits("1", 18));
  assert.equal(s.api.balanceRaw(WALLET), 100_000_000n);
  s.setPrice(220); assert.equal(s.api.execute(o.id, WALLET, true).status, "needs_review", "approval applies to the displayed update, not an unseen worse price");
  assert.equal(s.api.execute(o.id, WALLET, true).status, "processing");
});
test("late deposits and cancelled buys preserve USDC without automatically trading", () => {
  const s = setup(); const o = s.register();
  s.advance(USDC_PAYMENT_MS + 1); s.api.receive(o.id, WALLET, s.receipt());
  assert.equal(s.api.get(o.id, WALLET).status, "funds_available");
  assert.equal(s.api.balanceRaw(WALLET), 100_000_000n);
  assert.throws(() => s.api.execute(o.id, WALLET), /closed/);
  const next = s.register(); s.api.cancel(next.id, WALLET);
  assert.equal(s.api.balanceRaw(WALLET), 100_000_000n);
});
test("wallet ownership and the shared Pix/USDC order lock prevent conflicting purchases", () => {
  const s = setup(); const o = s.register();
  assert.throws(() => s.api.get(o.id, OTHER), /belong/);
  assert.throws(() => s.api.receive(o.id, OTHER, s.receipt()), /belong/);
  assert.throws(() => s.register(), /existing/);
  assert.equal(s.api.balanceRaw(OTHER), 0n);
  const pending = s.active.get(WALLET);
  assert.equal(flowFor({ type: "buy", symbol: "SPY" }, pending).type, "usdc");
  assert.equal(flowFor({ type: "sell", symbol: "SPY" }, pending).symbol, "NVDA");
  s.api.cancel(o.id, WALLET);
  s.active.save({ rampId: "pix-pending", walletAddress: WALLET });
  assert.throws(() => s.register(), /existing/);
});
test("selling returns USDC to Base balance without a fiat payout or additional product fee", () => {
  const s = setup(); const q = s.q("0.1", "SELL");
  const o = s.api.register(q, WALLET); s.api.execute(o.id, WALLET); s.advance(4001);
  const done = s.api.get(o.id, WALLET);
  assert.equal(done.status, "complete");
  assert.equal(s.holdings.balanceOf("NVDA"), parseUnits("0.9", 18));
  assert.equal(s.api.balanceRaw(WALLET), BigInt(done.quote.outputRaw));
  assert.equal(q.productFeeRaw, "0");
});
test("international paths select English; the Brazil path keeps Portuguese and Pix", () => {
  assert.equal(readConfig({}, "https://www.vortexfinance.co", "/en/stocks/").locale, "en");
  assert.equal(readConfig({}, "https://www.vortexfinance.co", "/pt-br/stocks/").locale, "pt-BR");
});

test("a failed order save after holdings settlement can recover without minting tokens twice", () => {
  const s = setup(); const o = s.register(); s.api.receive(o.id, WALLET, s.receipt());
  s.api.execute(o.id, WALLET); s.advance(4001);
  const originalSet = s.storage.set.bind(s.storage); let failed = false;
  s.storage.set = (key, value) => {
    if (!failed && key === STOCKS_KEYS.usdcSimulation && value.orders[o.id]?.status === "complete") { failed = true; return false; }
    return originalSet(key, value);
  };
  assert.throws(() => s.api.get(o.id, WALLET), /Could not save/);
  const credited = s.holdings.balanceOf("NVDA");
  assert.equal(s.api.get(o.id, WALLET).status, "complete");
  assert.equal(s.holdings.balanceOf("NVDA"), credited);
  assert.equal(s.api.balanceRaw(WALLET), 0n);
});

test("a seller cannot receive USDC after the token balance disappears during execution", () => {
  const s = setup(); const q = s.q("0.1", "SELL");
  const o = s.api.register(q, WALLET); s.api.execute(o.id, WALLET);
  s.holdings.apply({ direction: "SELL", symbol: "NVDA", tokenAmountWei: parseUnits("1", 18) });
  s.advance(4001);
  assert.throws(() => s.api.get(o.id, WALLET), /balance changed/);
  assert.equal(s.api.balanceRaw(WALLET), 0n);
});

test("an expired price update needs a fresh review and never spends the deposited USDC", () => {
  const s = setup(); const o = s.register(); s.api.receive(o.id, WALLET, s.receipt());
  s.setPrice(210); s.api.execute(o.id, WALLET); s.advance(USDC_QUOTE_MS + 1);
  assert.throws(() => s.api.execute(o.id, WALLET, true), /updated quote expired/);
  assert.equal(s.api.balanceRaw(WALLET), 100_000_000n);
  assert.equal(s.holdings.balanceOf("NVDA"), parseUnits("1", 18));
});
