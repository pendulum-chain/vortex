// Native Base USDC uses the same recovery store, permit policy and SDK as Pix stocks.
// Incoming transfers go to the user's wallet. Funding alone never authorizes an order.
import { createVortexStocksAdapter } from "./vortex-stocks.js";

export function createLiveUsdc({ config, session, stores, adapterOptions = {} }) {
  const balances = new Map();
  const adapter = createVortexStocksAdapter({ enabled: config.usdcEnabled, network: config.network, apiBase: config.apiBase, session,
    activeRampStore: stores.activeRamp, ephemeralStore: stores.ephemeral, rpcOverride: config.robinhoodRpcUrl,
    paymentMethod: "usdc", ...adapterOptions });
  return {
    simulated: false, enabled: Boolean(config.usdcEnabled), adapter,
    balanceRaw: owner => balances.get(owner?.toLowerCase()) ?? 0n,
    async refreshBalance(owner) {
      const value = BigInt(await adapter.readBaseBalance(owner));
      balances.set(owner.toLowerCase(), value);
      return value;
    },
  };
}

export function usdcPriceChanged(previous, next) {
  if (!previous) return false;
  const buy = next.direction === "BUY";
  const oldOutput = buy ? BigInt(previous.tokenAmountWei) : decimalRaw(previous.rawQuote.outputAmount);
  const newOutput = buy ? BigInt(next.tokenAmountWei) : decimalRaw(next.rawQuote.outputAmount);
  const basis = buy ? decimalRaw(previous.rawQuote.inputAmount) : decimalRaw(previous.rawQuote.outputAmount) + decimalRaw(previous.rawQuote.totalFeeFiat);
  return newOutput * 10000n < oldOutput * 9950n
    || decimalRaw(next.rawQuote.totalFeeFiat) > decimalRaw(previous.rawQuote.totalFeeFiat) + (basis * 5n + 9999n) / 10000n;
}

export function decimalRaw(value) {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) throw new Error("Invalid USDC amount");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
}

export function fundingIntentStore(storage) {
  const key = "satoshi:stocks:usdc:funding-intents";
  return {
    get(owner, now = Date.now()) {
      const saved = storage.get(key, {})[owner.toLowerCase()];
      return saved && saved.owner.toLowerCase() === owner.toLowerCase() && saved.expiresAt > now ? saved : null;
    },
    save(owner, intent) {
      if (!storage.set(key, { ...storage.get(key, {}), [owner.toLowerCase()]: { ...intent, owner } })) throw new Error("Could not save this order on this device.");
    },
    clear(owner) { const all = storage.get(key, {}); delete all[owner.toLowerCase()]; storage.set(key, all); },
  };
}
