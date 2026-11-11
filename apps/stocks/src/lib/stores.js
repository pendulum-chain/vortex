// Every browser-storage key Stocks owns, built with the kit's appKey so they all live
// under satoshi:stocks:* and can never collide with Gold's satoshi:gold:* / satoshi:paxg-market:v2.
// The Vortex OTP session is the kit's SHARED_KEYS.vortexSession (the same key Gold uses).
// tests/storage-namespace.test.mjs enforces this.
import { appKey, createActiveRampStore, createEphemeralStore, local, session } from "@vortexfi/consumer-kit";

export const STOCKS_KEYS = Object.freeze({
  purchaseIntent: appKey("stocks", "purchase-intent", 1),
  // localStorage: recovery data. Never rename these (an active ramp would become unrecoverable).
  activeRamp: appKey("stocks", "active-ramp", 1),
  history: appKey("stocks", "history", 1),
  // localStorage: caches and per-device UI state
  prices: appKey("stocks", "prices", 1),
  fx: appKey("stocks", "fx", 1),
  welcomed: appKey("stocks", "welcomed", 1),
  hideBalance: appKey("stocks", "hide-balance", 1),
  // sessionStorage (per tab)
  returnHash: appKey("stocks", "return-hash", 1),
  // sessionStorage, demo/preview only: simulated ramps and their recovery records, kept apart from
  // the real keys so a simulated operation can never show up as a real one.
  simRamps: appKey("stocks", "sim-ramps", 1),
  simActiveRamp: appKey("stocks", "sim-active-ramp", 1),
  simHistory: appKey("stocks", "sim-history", 1),
  demoHoldings: appKey("stocks", "demo-holdings", 1),
  // sessionStorage, demo only: the fake sign-in and the fake e-mail code / KYC steps.
  demoAuth: appKey("stocks", "demo-auth", 1),
  demoVerification: appKey("stocks", "demo-verification", 1),
  usdcSimulation: appKey("stocks", "usdc-simulation", 1),
  usdcPreviewHoldings: appKey("stocks", "usdc-preview-holdings", 1),
});

/** localStorage chart cache per CoinGecko id: "satoshi:stocks:chart:<id>:v1" (chart.js keeps at most 8). */
export const chartKey = (coingeckoId) => appKey("stocks", `chart:${coingeckoId}`, 1);

// IndexedDB for encrypted ephemeral ramp keys; Gold's is "satoshi-gold-secure".
export const EPHEMERAL_DB_NAME = "satoshi-stocks-secure";

/**
 * The adapter's recovery stores. Real ramps: localStorage + the encrypted IndexedDB key store.
 * Simulated ramps: sessionStorage, and no key store (nothing secret exists).
 */
export function createRampStores({ simulated, localStorage = local, sessionStorage = session } = {}) {
  if (simulated) {
    return { activeRamp: createActiveRampStore({ activeKey: STOCKS_KEYS.simActiveRamp, historyKey: STOCKS_KEYS.simHistory, storage: sessionStorage }), ephemeral: null };
  }
  return { activeRamp: createActiveRampStore({ activeKey: STOCKS_KEYS.activeRamp, historyKey: STOCKS_KEYS.history, storage: localStorage }), ephemeral: createEphemeralStore(EPHEMERAL_DB_NAME) };
}

const WELCOMED_LIMIT = 20;

/** Privy DIDs that already saw the welcome sheet on this device. */
export function createWelcomeStore(storage = local) {
  const list = () => {
    const value = storage.get(STOCKS_KEYS.welcomed, []);
    return Array.isArray(value) ? value : [];
  };
  return {
    has: (privyDid) => Boolean(privyDid) && list().includes(privyDid),
    mark(privyDid) {
      if (!privyDid) return;
      storage.set(STOCKS_KEYS.welcomed, [privyDid, ...list().filter((did) => did !== privyDid)].slice(0, WELCOMED_LIMIT));
    },
  };
}

// "+" is a space in exploreHash's query (URLSearchParams); still no ":" or "//".
const HASH_ROUTE = /^#\/[\w\-/?=&%.+]*$/;

/**
 * Before Google login: remember the hash route to restore after the OAuth return. Every
 * attempt replaces the previous one, so a login cancelled on a detail screen is not restored at a
 * later sign-in that starts from #/.
 */
export function saveReturnHash(hash, storage = session) {
  if (typeof hash === "string" && HASH_ROUTE.test(hash) && hash !== "#/") storage.set(STOCKS_KEYS.returnHash, hash);
  else storage.remove(STOCKS_KEYS.returnHash);
}

/** Returns the saved hash once (then forgets it); only app hash routes, never a URL. */
export function takeReturnHash(storage = session) {
  const hash = storage.get(STOCKS_KEYS.returnHash, null);
  storage.remove(STOCKS_KEYS.returnHash);
  return typeof hash === "string" && HASH_ROUTE.test(hash) ? hash : null;
}
