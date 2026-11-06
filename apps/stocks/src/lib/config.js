// The ONLY reader of import.meta.env.VITE_* in Stocks (BASE_URL/DEV/PROD may be read anywhere).
// Stocks never reads Gold's demo flag (production sets it for Gold): its mode is VITE_STOCKS_MODE.
// tests/pilot-safety.test.mjs and tests/config.test.mjs enforce both.
import { resolveApiBase } from "@vortexfi/consumer-kit";
import { stocksLocale } from "./international.js";

export const STOCKS_MODES = Object.freeze(["demo", "preview", "live"]);

export const ALLOWED_ENV = Object.freeze(["VITE_STOCKS_MODE", "VITE_STOCKS_RAMP_ENABLED", "VITE_PRIVY_APP_ID",
  "VITE_SIGNING_SERVICE_PATH", "VITE_STOCKS_NETWORK", "VITE_ROBINHOOD_RPC_URL"]);

const NETWORK_ID = /^[a-z0-9-]+$/;

/**
 * Vite inlines every VITE_* value in the bundle (readConfig takes the whole env), so a Vortex secret key
 * in any of them is a config error. Also checked at build time (vite.config.mjs), so it fails the build
 * instead of being published. The app itself sends no API key: stock pricing applies by route, and a
 * partner's key would make the quote partner-owned, which the signed-in user then cannot register.
 * @returns {string|null} the config error, or null when the env is fine
 */
export function secretKeyError(env = {}) {
  const name = Object.keys(env).find((key) => key.startsWith("VITE_") && /^\s*sk_/i.test(String(env[key])));
  return name ? `${name} contém uma chave secreta (sk_): remova-a, ela nunca pode ir para o navegador.` : null;
}

/**
 * demo    (default when unset; local dev): fake login, simulated ramp, illustrative prices, no Vortex calls
 * preview (deploy previews): real Privy login shared with Gold, simulated ramp, live prices, no Vortex calls
 * live    (production): real Privy login, Vortex ramp, which stays off until VITE_STOCKS_RAMP_ENABLED=true
 * A non-empty invalid value is a visible config error, never a silent fallback.
 * @returns {{error:string}|Readonly<{ mode:"demo"|"preview"|"live", usesPrivy:boolean, rampKind:"vortex"|"simulated",
 *   rampEnabled:boolean, privyAppId:string, apiBase:string, network:string,
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
  const keyError = secretKeyError(env);
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

// The simulated USDC checkout and its English edition exist in demo and preview only. The same kind
// of constant, so a live build drops their chunks; the screens decide by config.mode.
export const USDC_CHECKOUT = import.meta.env?.VITE_STOCKS_MODE !== "live";
