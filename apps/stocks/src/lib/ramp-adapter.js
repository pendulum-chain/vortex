// The only seam between the Stocks UI and a ramp. The UI talks to a
// StocksRampAdapter and never to the SDK or the API directly:
//   vortex    (live)          lib/vortex-stocks.js, gated by VITE_STOCKS_RAMP_ENABLED
//   simulated (demo, preview) lib/simulated-ramp.js, no Vortex or wallet calls, no Pix code
// The adapter owns the active-ramp store writes (it knows the stages: "registering" in the
// ephemeral-key callback, "registered" after a buy, "signing" -> "ready" in a sell) and settles
// terminal ramps; the UI only reads the store (resume banner).
import { createSimulatedStocksAdapter } from "./simulated-ramp.js";
import { createVortexStocksAdapter } from "./vortex-stocks.js";

export * from "./ramp-contract.js";

/**
 * @typedef {{ provider:import("viem").EIP1193Provider, chain:import("viem").Chain, publicClient?:import("viem").PublicClient }} WalletSeam
 *   provider: the Privy embedded wallet; publicClient (optional): a Robinhood Chain client, used only when its chain is 4663
 * @typedef {{ kind:"vortex"|"simulated", enabled:boolean, requiresVortexSession:boolean,
 *   getAvailability(o?:{force?:boolean}):Promise<import("./ramp-contract.js").AvailabilityMap>,
 *   getReadiness():Promise<import("@vortexfi/consumer-kit").Readiness>,
 *   quoteBuy(a:{symbol:string, brlAmount:number, walletAddress:string}):Promise<import("./ramp-contract.js").StockQuote>,
 *   quoteSell(a:{symbol:string, tokenAmount:string, walletAddress:string}):Promise<import("./ramp-contract.js").StockQuote>,
 *   registerBuy(a:{quote:object, walletAddress:string}):Promise<import("./ramp-contract.js").StockRamp>,
 *   registerSell(a:{quote:object, walletAddress:string, pixKey:string, wallet:WalletSeam, onRegistered?:(r:object)=>void}):Promise<import("./ramp-contract.js").StockRamp>,
 *   resumeSell(a:{rampId:string, walletAddress:string, wallet:WalletSeam}):Promise<import("./ramp-contract.js").StockRamp>,
 *   abandonRamp(rampId:string, o:{walletAddress:string}):Promise<import("./ramp-contract.js").StockRamp>,
 *   startRamp(rampId:string):Promise<import("./ramp-contract.js").StockRamp>,
 *   getRamp(rampId:string, o?:{walletAddress?:string}):Promise<import("./ramp-contract.js").StockRamp>,
 *   pollStatus(rampId:string, o?:{signal?:AbortSignal, onUpdate?:(r:object)=>void, intervalMs?:number, timeoutMs?:number, walletAddress?:string}):Promise<import("./ramp-contract.js").StockRamp>
 * }} StocksRampAdapter
 *   walletAddress on getRamp/pollStatus lets a real ramp settle into history (optional).
 */

/**
 * @param {ReturnType<typeof import("./config.js").readConfig>} config a valid config (not {error})
 * @param {{ session?:object, kyc?:object, activeRampStore?:object, ephemeralStore?:object,
 *   getReferencePrice?:(symbol:string)=>({brl:number, updatedAt:number}|null), demoHoldings?:object|null }} deps
 * @returns {StocksRampAdapter}
 */
export function createRampAdapter(config, deps = {}) {
  if (config?.rampKind === "vortex") {
    return createVortexStocksAdapter({ ...deps, enabled: config.rampEnabled, network: config.network, apiBase: config.apiBase, rpcOverride: config.robinhoodRpcUrl });
  }
  // Demo holdings move only in demo; preview reads the real (usually empty) chain balance.
  return createSimulatedStocksAdapter({ ...deps, demoHoldings: config?.mode === "demo" ? deps.demoHoldings ?? null : null, speed: config?.mode === "demo" ? "fast" : "normal" });
}
