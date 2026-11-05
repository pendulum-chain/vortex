// Browser storage shared by the consumer apps on www.vortexfinance.co (Gold, Stocks, later
// Family Safe). Keys keep the `satoshi:` prefix: renaming them would orphan active-ramp
// recovery records and Vortex sessions written by the live Gold app.

export const SHARED_KEYS = Object.freeze({
  // The SAME key Gold uses today (apps/gold/src/lib/vortex.js), so a session verified in Gold
  // is reused by Stocks in the same tab.
  vortexSession: "satoshi:vortex-session:v2",
  // localStorage broadcast of a logout to the other tabs (see logout-signal.js).
  logoutSignal: "satoshi:consumer:logout:v1",
});

export const APP_NAMES = Object.freeze(["gold", "stocks", "family", "consumer"]);

// One or more [a-z0-9-] segments; ":" separates segments, e.g. "chart:sp500-xstock".
const NAME_PATTERN = /^[a-z0-9-]+(?::[a-z0-9-]+)*$/;

/** appKey("stocks", "active-ramp", 1) -> "satoshi:stocks:active-ramp:v1" */
export function appKey(app, name, version) {
  if (!APP_NAMES.includes(app)) throw new Error(`Unknown consumer app "${app}" for a storage key.`);
  if (typeof name !== "string" || !NAME_PATTERN.test(name)) throw new Error(`Invalid storage key name "${name}": use [a-z0-9-] segments.`);
  if (!Number.isInteger(version) || version < 1) throw new Error(`Invalid storage key version "${version}".`);
  return `satoshi:${app}:${name}:v${version}`;
}

/**
 * JSON wrapper around a Web Storage. Every access is guarded: private mode, a full quota or
 * disabled storage must not crash the app. `set` reports success so callers that store
 * recovery data can fail closed.
 * @param {() => Storage|null} getStorage resolved on every call, so tests can swap the global
 */
export function createJsonStorage(getStorage) {
  const store = () => {
    try { return getStorage() ?? null; } catch { return null; }
  };
  return {
    get(key, fallback = null) {
      try {
        const raw = store()?.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    /** @returns {boolean} true when the value was written */
    set(key, value) {
      try {
        const target = store();
        if (!target) return false;
        target.setItem(key, JSON.stringify(value));
        return true;
      } catch { return false; }
    },
    remove(key) {
      try { store()?.removeItem(key); } catch { /* storage unavailable: nothing to remove */ }
    },
  };
}

export const local = createJsonStorage(() => globalThis.localStorage ?? null);
export const session = createJsonStorage(() => globalThis.window?.sessionStorage ?? null);
