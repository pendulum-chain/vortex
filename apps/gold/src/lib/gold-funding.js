import { local } from "@vortexfi/consumer-kit";
import { amountRaw } from "./base-gold.js";
const KEY = "satoshi:gold:usdc:funding-intents:v1";
const TTL = 30 * 60_000;
// Restore an amount, never a quote, signature, destination or consent. Returning still requires
// a new quote and explicit review. Funds are always held in the owner's own Base wallet.
export function fundingDrafts(storage = local, now = Date.now) {
  return {
    get(owner) {
      const saved = storage.get(KEY, {})?.[owner?.toLowerCase()];
      try {
        if (saved?.owner !== owner?.toLowerCase() || saved.expiresAt <= now() || saved.expiresAt > now() + TTL || amountRaw(saved.amount, 6) < 10_000_000n) return null;
        return { amount: saved.amount };
      } catch { return null; }
    },
    save(owner, amount) {
      amountRaw(amount, 6);
      if (!storage.set(KEY, { ...storage.get(KEY, {}), [owner.toLowerCase()]: { owner: owner.toLowerCase(), amount: String(amount), expiresAt: now() + TTL } })) throw new Error("Não foi possível salvar o valor neste aparelho. Não envie fundos ainda.");
    },
    clear(owner) { const all = storage.get(KEY, {}); delete all[owner.toLowerCase()]; storage.set(KEY, all); },
  };
}
