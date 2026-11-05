// The ONLY reader of import.meta.env.VITE_* in Stocks (BASE_URL/DEV/PROD may be read anywhere).
// Stocks never reads Gold's demo flag (production sets it for Gold): its mode is VITE_STOCKS_MODE.
// tests/pilot-safety.test.mjs and tests/config.test.mjs enforce both.
import { resolveApiBase } from "@vortexfi/consumer-kit";
import { stocksLocale } from "./international.js";

export const STOCKS_MODES = Object.freeze(["demo", "preview", "live"]);

export const ALLOWED_ENV = Object.freeze(["VITE_STOCKS_MODE", "VITE_STOCKS_RAMP_ENABLED", "VITE_PRIVY_APP_ID",
  "VITE_SIGNING_SERVICE_PATH", "VITE_VORTEX_PUBLIC_KEY", "VITE_STOCKS_NETWORK", "VITE_ROBINHOOD_RPC_URL"]);

const NETWORK_ID = /^[a-z0-9-]+$/;

/**
 * VITE_VORTEX_PUBLIC_KEY is optional and public (Vite inlines it in the bundle): only a pk_ key is
 * accepted, never a secret sk_ key. Also checked at build time (vite.config.mjs), so a wrong value
 * fails the build instead of being published.
 * @returns {string|null} the config error, or null when the value is fine
 */
export function publicKeyError(value) {
  const key = String(value ?? "").trim();
  if (!key || /^pk_(live|test)_[A-Za-z0-9]{32}$/.test(key)) return null; // the API's key format (apiKeyFormat.ts)
  return /^sk_/i.test(key) ? "VITE_VORTEX_PUBLIC_KEY contém uma chave secreta (sk_): remova-a, ela nunca pode ir para o navegador." : "VITE_VORTEX_PUBLIC_KEY inválida: use uma chave pública pk_ ou deixe vazio.";
}

/**
 * demo    (default when unset; local dev): fake login, simulated ramp, illustrative prices, no Vortex calls
 * preview (deploy previews): real Privy login shared with Gold, simulated ramp, live prices, no Vortex calls
 * live    (production): real Privy login, Vortex ramp, which stays off until VITE_STOCKS_RAMP_ENABLED=true
 * A non-empty invalid value is a visible config error, never a silent fallback.
 * @returns {{error:string}|Readonly<{ mode:"demo"|"preview"|"live", usesPrivy:boolean, rampKind:"vortex"|"simulated",
 *   rampEnabled:boolean, privyAppId:string, apiBase:string, publicKey:string, network:string,
 *   robinhoodRpcUrl:string, prices:"demo"|"live" }>}
 */
export function readConfig(env = {}, origin = globalThis.location?.origin ?? "http://localhost", path = globalThis.location?.pathname ?? "") {
  const raw = String(env.VITE_STOCKS_MODE ?? "").trim();
  const mode = raw || "demo";
  if (!STOCKS_MODES.includes(mode)) return { error: `VITE_STOCKS_MODE inválido: "${raw}"` };
  if (mode !== "demo" && !env.VITE_PRIVY_APP_ID) return { error: "VITE_PRIVY_APP_ID não configurado." };
  const network = String(env.VITE_STOCKS_NETWORK || "robinhood").trim();
  if (!NETWORK_ID.test(network)) return { error: `VITE_STOCKS_NETWORK inválido: "${network}"` };
  const robinhoodRpcUrl = String(env.VITE_ROBINHOOD_RPC_URL || "").trim();
  if (robinhoodRpcUrl && !/^https:\/\/[^\s]+$/.test(robinhoodRpcUrl)) return { error: "VITE_ROBINHOOD_RPC_URL precisa ser um endereço https://." };
  const keyError = publicKeyError(env.VITE_VORTEX_PUBLIC_KEY);
  if (keyError) return { error: keyError };
  return Object.freeze({
    mode,
    locale: stocksLocale(path),
    usesPrivy: mode !== "demo",
    rampKind: mode === "live" ? "vortex" : "simulated",
    // Honoured ONLY in live, and only as the exact string "true".
    rampEnabled: mode === "live" && env.VITE_STOCKS_RAMP_ENABLED === "true",
    privyAppId: env.VITE_PRIVY_APP_ID || "",
    apiBase: resolveApiBase(env.VITE_SIGNING_SERVICE_PATH, origin),
    publicKey: String(env.VITE_VORTEX_PUBLIC_KEY || "").trim(),
    network,
    robinhoodRpcUrl,
    prices: mode === "demo" ? "demo" : "live",
  });
}

export const config = readConfig(import.meta.env ?? {});

// Demo-only tools (src/lib/demo-links.js). A build-time constant: Vite replaces
// import.meta.env?.VITE_STOCKS_MODE with the literal, so preview and live builds drop the code
// behind it. Node tests see no env and get true, like a default (demo) build.
export const DEMO_TOOLS = import.meta.env?.VITE_STOCKS_MODE !== "preview" && import.meta.env?.VITE_STOCKS_MODE !== "live";
