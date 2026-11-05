// Advisory arithmetic only. These illustrative costs are never sent as an executable quote.
import { formatUnits, parseUnits } from "viem";
import { session } from "@vortexfi/consumer-kit";
import { findStock } from "./stocks.js";
import { simulatedProviderCosts } from "./fee-model.js";
import { STOCKS_KEYS } from "./stores.js";

export const PREVIEW_INTENT_TTL_MS = 30 * 60_000;
export const PREVIEW_MINIMUM = Object.freeze({ pix: 100, usdc: 10 });
export const PREVIEW_DEFAULT = Object.freeze({ pix: "500", usdc: "100" });
const MAX_AMOUNT = 1_000_000;

/** Only the user's selection survives login; prices, fees and approvals never do. */
export function purchaseSelection(input) {
  if (!input || !["pix", "usdc"].includes(input.method) || !["pt-BR", "en"].includes(input.locale) || (input.locale === "en" && input.method !== "usdc")) return null;
  const token = findStock(input.symbol);
  const text = String(input.amount ?? "").trim();
  const valid = input.method === "pix" ? /^\d+(?:[,.]0{1,2})?$/.test(text) : /^\d+(?:[,.]\d{1,6})?$/.test(text);
  const amount = Number(text.replace(",", "."));
  if (!token || !valid || !Number.isFinite(amount) || amount < PREVIEW_MINIMUM[input.method] || amount > MAX_AMOUNT) return null;
  return { symbol: token.symbol, method: input.method, amount: String(amount), locale: input.locale };
}

export function estimatePurchase(input, referencePrice) {
  const selection = purchaseSelection(input);
  const price = Number(referencePrice);
  if (!selection || !(price > 0) || !Number.isFinite(price) || price > 1e12 || !(Number(price.toFixed(8)) > 0)) return null;
  const amount = Number(selection.amount), pix = selection.method === "pix";
  const raw = BigInt(Math.round(amount * 1e6));
  const bps = value => Number((raw * BigInt(value) + 9999n) / 10000n) / 1e6;
  // Unknown wallet: illustrate a full reserve. The final quote checks the actual wallet.
  const costs = pix ? [...simulatedProviderCosts(amount).map(c => ({ provider: c.provider, amount: c.amountFiat })), { provider: "reserve", amount: 0.71 }]
    : [{ provider: "relay", amount: bps(6) }, { provider: "uniswap", amount: bps(5) }, { provider: "vortex", amount: bps(5) }, { provider: "network", amount: 0.02 }, { provider: "reserve", amount: 0.10 }];
  const digits = pix ? 2 : 6;
  const total = Number(costs.reduce((sum, cost) => sum + cost.amount, 0).toFixed(digits));
  const net = Number((amount - total).toFixed(digits));
  if (!(net > 0)) return null;
  const tokenAmount = formatUnits(parseUnits(net.toFixed(digits), 18) * 10n ** 18n / parseUnits(price.toFixed(8), 18), 18);
  return { selection, amount, total, net, costs, tokenAmount, currency: pix ? "BRL" : "USDC", illustrative: true };
}

export function savePurchaseSelection(input, { storage = session, now = Date.now() } = {}) {
  const value = purchaseSelection(input);
  if (!value) throw new Error("Confira o valor e a empresa da simulação.");
  if (!storage.set(STOCKS_KEYS.purchaseIntent, { ...value, createdAt: now })) throw new Error("Não foi possível guardar sua simulação para entrar. Tente novamente.");
  return value;
}
export function readPurchaseSelection({ storage = session, now = Date.now(), locale } = {}) {
  const stored = storage.get(STOCKS_KEYS.purchaseIntent, null);
  const value = purchaseSelection(stored);
  if (!value || !Number.isFinite(stored?.createdAt) || now - stored.createdAt > PREVIEW_INTENT_TTL_MS || stored.createdAt > now + 10_000) {
    if (stored) storage.remove(STOCKS_KEYS.purchaseIntent);
    return null;
  }
  return locale && value.locale !== locale ? null : value;
}
export const clearPurchaseSelection = (storage = session) => storage.remove(STOCKS_KEYS.purchaseIntent);
