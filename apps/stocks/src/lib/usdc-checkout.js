// Frontend checkout seam, in demo and preview builds only: a deterministic, persisted simulation with
// illustrative round costs. No network, wallet call, payable address or execution endpoint exists here.
import { formatUnits, parseUnits } from "viem";
import { STOCKS_KEYS } from "./stores.js";
import { findStock } from "./stocks.js";

export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const BASE_CHAIN_ID = 8453;
export const USDC_QUOTE_MS = 60_000;
export const USDC_PAYMENT_MS = 20 * 60_000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const terminal = (s) => ["complete", "cancelled", "expired", "funds_available"].includes(s);
const fail = (message, code = "USDC_CHECKOUT_ERROR") => { throw Object.assign(new Error(message), { code }); };
export function usdcRaw(amount) {
  const s = String(amount ?? "");
  if (!/^\d+(?:\.\d{1,6})?$/.test(s)) fail("Enter a USDC amount with up to 6 decimals.");
  const raw = parseUnits(s, 6);
  if (raw <= 0n || raw > 1_000_000n * 1_000_000n) fail("Enter an amount between 0 and 1,000,000 USDC.");
  return raw;
}
export const usdcText = (raw) => formatUnits(BigInt(raw), 6);
const fee = (amount, bps) => (amount * BigInt(bps) + 9999n) / 10000n;
const initial = () => ({ seq: 0, orders: {}, balances: {}, deposits: {} });

export function createUsdcCheckout({ mode, storage, activeRampStore, holdings, getPrice, now = Date.now } = {}) {
  const simulated = mode === "demo" || mode === "preview";
  const enabled = simulated;
  const quotes = new Map();
  let quoteSequence = 0;
  const requireEnabled = () => { if (!enabled) fail("USDC checkout is not live yet. Bank transfers are planned.", "USDC_NOT_ENABLED"); };
  const walletKey = (wallet) => { if (!ADDRESS.test(wallet || "")) fail("Your wallet is not ready."); return wallet.toLowerCase(); };
  const load = () => storage.get(STOCKS_KEYS.usdcSimulation, null) || initial();
  const save = (state) => { if (!storage.set(STOCKS_KEYS.usdcSimulation, state)) fail("Could not save this order. Do not send a payment."); };
  const balanceRaw = (wallet) => BigInt(load().balances[walletKey(wallet)] || "0");
  const holdingFor = (wallet) => typeof holdings === "function" ? holdings(wallet) : holdings;
  const tokenBalance = (wallet, symbol) => { walletKey(wallet); return holdingFor(wallet)?.balanceOf(symbol) || 0n; };
  const history = (wallet) => Object.values(load().orders).filter((o) => o.wallet === walletKey(wallet) && o.status === "complete");
  function priceFor(symbol) {
    const p = getPrice(symbol);
    if (!findStock(symbol) || !p || !(p.usd > 0) || !Number.isFinite(p.usd) || !Number.isFinite(p.updatedAt)
      || now() - p.updatedAt > 120_000 || p.updatedAt - now() > 10_000) fail("A fresh USD price is unavailable. Try again shortly.");
    return parseUnits(p.usd.toFixed(8), 18);
  }
  function quote({ wallet, symbol, amount, direction = "BUY" }) {
    requireEnabled(); walletKey(wallet);
    if (!["BUY", "SELL"].includes(direction)) fail("Unsupported order direction.");
    const price = priceFor(symbol);
    let tokenInput = 0n;
    if (direction === "SELL") {
      if (!/^\d+(?:\.\d{1,18})?$/.test(String(amount))) fail("Enter a valid token amount.");
      tokenInput = parseUnits(String(amount), 18);
      if (tokenInput <= 0n || tokenInput > tokenBalance(wallet, symbol)) fail("Insufficient token balance.");
    }
    const gross = direction === "BUY" ? usdcRaw(amount) : tokenInput * price / 10n ** 30n;
    if (gross < 10_000_000n) fail("The minimum order is 10 USDC.");
    const reserve = direction === "BUY" && (holdingFor(wallet)?.ethWei() || 0n) < 20_000_000_000_000n ? 100_000n : 0n;
    const costs = [
      { id: "bridge", provider: "Relay", label: "Base USDC ↔ Robinhood Chain USDG", raw: fee(gross, 10).toString() },
      { id: "swap", provider: "Uniswap", label: "USDG ↔ Stock Token", raw: fee(gross, 10).toString() },
      { id: "vortex", provider: "Vortex", label: "Service and execution · 10 bps", raw: fee(gross, 10).toString() },
      { id: "network", provider: "Networks", label: "Execution gas on Base and Robinhood Chain", raw: "100000" },
      { id: "reserve", provider: "ETH reserve", label: "Delivered to your wallet for later selling costs", raw: reserve.toString() },
    ];
    const total = costs.reduce((sum, c) => sum + BigInt(c.raw), 0n);
    const output = gross - total;
    if (output <= 0n) fail("This amount cannot cover execution costs.");
    const q = Object.freeze({ id: `sim-usdc-q-${now()}-${++quoteSequence}`, wallet: walletKey(wallet), symbol, direction,
      input: String(amount), grossRaw: gross.toString(), totalFeesRaw: total.toString(), costs,
      outputRaw: (direction === "BUY" ? output * 10n ** 30n / price : output).toString(),
      priceUsd: formatUnits(price, 18), expiresAt: now() + USDC_QUOTE_MS, simulated: true,
      routingStrategy: "direct", chainId: BASE_CHAIN_ID, token: BASE_USDC, productFeeRaw: "0",
      reserveWei: reserve ? (50_000_000_000_000n - (holdingFor(wallet)?.ethWei() || 0n)).toString() : "0",
    });
    quotes.set(q.id, q);
    return q;
  }
  function owned(state, id, wallet) {
    const o = state.orders[id];
    if (!o || o.wallet !== walletKey(wallet)) fail("This order does not belong to your wallet.");
    return o;
  }
  function register(q, wallet, method = "transfer") {
    requireEnabled();
    if (quotes.get(q?.id) !== q || q.wallet !== walletKey(wallet) || q.expiresAt <= now()) fail("Your quote expired. Review a fresh quote before paying.");
    if (!["wallet", "transfer", "balance"].includes(method)) fail("Unsupported payment method.");
    if (activeRampStore.hasActive() || activeRampStore.get(wallet)) fail("Finish the existing order on this device first.");
    const state = load();
    const id = `sim-usdc-order-${++state.seq}`;
    const order = { id, wallet: q.wallet, symbol: q.symbol, direction: q.direction, method, quote: q,
      minOutputRaw: (BigInt(q.outputRaw) * 9950n / 10000n).toString(), maxFeesRaw: (BigInt(q.totalFeesRaw) + fee(BigInt(q.grossRaw), 5)).toString(),
      createdAt: now(), paymentDeadline: now() + USDC_PAYMENT_MS,
      status: q.direction === "SELL" || balanceRaw(wallet) >= BigInt(q.grossRaw) ? "ready" : "awaiting_funds",
    };
    state.orders[id] = order;
    save(state);
    activeRampStore.save({ rampId: id, walletAddress: wallet, rampType: q.direction, symbol: q.symbol, paymentMethod: "usdc", inputAmount: q.input });
    quotes.delete(q.id);
    return order;
  }
  function receive(id, wallet, receipt) {
    requireEnabled();
    const state = load(); const o = owned(state, id, wallet);
    if (o.direction !== "BUY" || receipt.chainId !== BASE_CHAIN_ID || String(receipt.token).toLowerCase() !== BASE_USDC.toLowerCase()
      || String(receipt.to).toLowerCase() !== o.wallet || !/^demo-[a-z0-9-]+$/.test(receipt.id || "")) fail("This deposit does not match the Base USDC payment.");
    const amount = usdcRaw(receipt.amount);
    if (!Number.isInteger(receipt.confirmations) || receipt.confirmations < 2) return o;
    const seen = state.deposits[receipt.id];
    if (seen) {
      if (seen.wallet !== o.wallet || seen.raw !== amount.toString()) fail("Conflicting deposit receipt.");
      return o;
    }
    state.deposits[receipt.id] = { wallet: o.wallet, raw: amount.toString() };
    state.balances[o.wallet] = (BigInt(state.balances[o.wallet] || "0") + amount).toString();
    if (!terminal(o.status)) o.status = now() >= o.paymentDeadline ? "funds_available" : BigInt(state.balances[o.wallet]) >= BigInt(o.quote.grossRaw) ? "ready" : "awaiting_funds";
    save(state);
    if (terminal(o.status)) activeRampStore.clear(id);
    return o;
  }
  function execute(id, wallet, acceptUpdated = false) {
    requireEnabled();
    const state = load(); const o = owned(state, id, wallet);
    if (["complete", "processing"].includes(o.status)) return o;
    if (terminal(o.status)) fail("This order is closed. Your unspent USDC remains available.");
    if (now() >= o.paymentDeadline) { o.status = "funds_available"; save(state); activeRampStore.clear(id); return o; }
    if (o.direction === "BUY" && balanceRaw(wallet) < BigInt(o.quote.grossRaw)) fail("Waiting for the remaining USDC.");
    const fresh = quote({ wallet, symbol: o.symbol, amount: o.quote.input, direction: o.direction });
    if (acceptUpdated) {
      if (o.status !== "needs_review") fail("No updated quote is awaiting confirmation.");
      if (!o.updatedQuote || o.updatedQuote.expiresAt <= now()) fail("The updated quote expired. Refresh before confirming.");
      o.minOutputRaw = (BigInt(o.updatedQuote.outputRaw) * 9950n / 10000n).toString();
      o.maxFeesRaw = (BigInt(o.updatedQuote.totalFeesRaw) + fee(BigInt(o.updatedQuote.grossRaw), 5)).toString();
    }
    if (BigInt(fresh.outputRaw) < BigInt(o.minOutputRaw) || BigInt(fresh.totalFeesRaw) > BigInt(o.maxFeesRaw)) {
      o.status = "needs_review"; o.updatedQuote = fresh; save(state); return o;
    }
    o.quote = fresh; delete o.updatedQuote; o.status = "processing"; o.startedAt = now(); save(state); return o;
  }
  function get(id, wallet) {
    requireEnabled();
    const state = load(); const o = owned(state, id, wallet);
    if (o.status === "processing" && now() - o.startedAt >= 4000) {
      const q = o.quote;
      if (o.direction === "BUY" && BigInt(state.balances[o.wallet] || "0") < BigInt(q.grossRaw)) fail("Insufficient USDC balance.");
      if (o.direction === "SELL" && !holdingFor(wallet).hasApplied?.(o.id) && tokenBalance(wallet, o.symbol) < parseUnits(q.input, 18)) fail("Your token balance changed. Settlement needs review; no USDC was credited.");
      holdingFor(wallet).apply({ direction: o.direction, symbol: o.symbol, tokenAmountWei: o.direction === "BUY" ? q.outputRaw : parseUnits(q.input, 18).toString(), gasReserveWei: BigInt(q.reserveWei), operationId: o.id });
      state.balances[o.wallet] = (BigInt(state.balances[o.wallet] || "0") + (o.direction === "BUY" ? -BigInt(q.grossRaw) : BigInt(q.outputRaw))).toString();
      o.status = "complete"; o.completedAt = now(); save(state);
    } else if (["awaiting_funds", "ready", "needs_review"].includes(o.status) && now() >= o.paymentDeadline) {
      o.status = balanceRaw(wallet) > 0n ? "funds_available" : "expired"; save(state); activeRampStore.clear(id);
    }
    if (o.status === "complete" && activeRampStore.get(wallet)?.rampId === id) {
      const q = o.quote;
      activeRampStore.addHistory({ rampId: id, walletAddress: o.wallet, rampType: o.direction, symbol: o.symbol, paymentMethod: "usdc", usdcAmount: usdcText(o.direction === "BUY" ? q.grossRaw : q.outputRaw), tokenAmount: formatUnits(BigInt(o.direction === "BUY" ? q.outputRaw : parseUnits(q.input, 18)), 18), simulated: true });
      activeRampStore.clear(id);
    }
    return o;
  }
  function cancel(id, wallet) {
    requireEnabled(); const state = load(); const o = owned(state, id, wallet);
    if (o.status === "processing" || o.status === "complete") fail("This order is already executing.");
    o.status = "cancelled"; save(state); activeRampStore.clear(id); return o;
  }
  return { enabled, simulated, quote, register, receive, execute, get, cancel, balanceRaw, tokenBalance, history,
    positions: (wallet) => enabled ? holdingFor(wallet)?.read().positions || [] : null,
    remaining: (o) => { const left = BigInt(o.quote.grossRaw) - balanceRaw(o.wallet); return left > 0n ? left : 0n; },
    simulateDeposit(id, wallet, amount) { return receive(id, wallet, { id: `demo-${now()}-${++quoteSequence}`, chainId: BASE_CHAIN_ID, token: BASE_USDC, to: wallet, amount, confirmations: 2 }); },
  };
}
