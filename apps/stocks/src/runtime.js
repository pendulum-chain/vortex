// The heavy half of the app, loaded lazily once someone signs in (or, while the live ramp is on, on
// the landing and a detail screen): the ramp adapter and the portfolio read (viem, about 90 KB gzip
// each). The landing, Explore and the detail screens render without it.
import { createBrazilKyc, robinhoodChain, session as tabStorage } from "@vortexfi/consumer-kit";
import { createDemoVerification } from "./lib/demo-verification.js";
import { serverHistoryRows } from "./lib/history.js";
import { DEMO_GAS_PRICE_WEI, DEMO_RESERVE_DUST_WEI, createDemoHoldings, createRobinhoodClient, readPortfolio, tokenFlags, valuePortfolio } from "./lib/portfolio.js";
import { createRampAdapter, withIssuerPauses } from "./lib/ramp-adapter.js";
import { STOCKS_KEYS, createRampStores } from "./lib/stores.js";
import { getVortexSession } from "./services.js";
import { createUsdcCheckout } from "./lib/usdc-checkout.js";

/**
 * @param {{ config:object, market:ReturnType<typeof import("./lib/market.js").createMarket> }} args
 */
export function createRuntime({ config, market }) {
  const demo = config.mode === "demo";
  const stores = createRampStores({ simulated: config.rampKind === "simulated" });
  const demoHoldings = demo ? createDemoHoldings() : null;
  const scopedHoldings = new Map();
  const usdcHoldings = (wallet) => {
    if (demoHoldings) return demoHoldings;
    if (config.rampKind !== "simulated") return null;
    const owner = wallet.toLowerCase();
    if (!scopedHoldings.has(owner)) {
      const scopedStorage = {
        get: (_key, fallback) => tabStorage.get(STOCKS_KEYS.usdcPreviewHoldings, {})[owner] ?? fallback,
        set: (_key, value) => tabStorage.set(STOCKS_KEYS.usdcPreviewHoldings, { ...tabStorage.get(STOCKS_KEYS.usdcPreviewHoldings, {}), [owner]: value }),
        remove: () => { const data = tabStorage.get(STOCKS_KEYS.usdcPreviewHoldings, {}); delete data[owner]; return tabStorage.set(STOCKS_KEYS.usdcPreviewHoldings, data); },
      };
      scopedHoldings.set(owner, createDemoHoldings({ storage: scopedStorage, initial: {}, initialEthWei: 0n }));
    }
    return scopedHoldings.get(owner);
  };
  const usdc = createUsdcCheckout({ mode: config.mode, storage: tabStorage, activeRampStore: stores.activeRamp, holdings: usdcHoldings,
    getPrice: (symbol) => { const s = market.peek(); const p = s.status === "unavailable" ? null : s.prices[symbol]; return p ? { usd: p.usd, updatedAt: p.updatedAt ?? s.savedAt } : null; },
  });
  const session = getVortexSession();
  const demoVerification = demo ? createDemoVerification() : null;
  const kyc = demoVerification ? demoVerification.kyc : createBrazilKyc({ session });
  const adapter = createRampAdapter(config, {
    session, kyc, activeRampStore: stores.activeRamp, ephemeralStore: stores.ephemeral,
    getReferencePrice: market.referencePrice, demoHoldings,
  });

  // The e-mail code step before money moves: the Vortex session (live), a stand-in (demo), or none
  // (preview makes no Vortex calls at all).
  const verification = demoVerification ?? (adapter.requiresVortexSession
    ? { required: true, demoCode: null, hasSession: (who) => session.hasSession(who), requestOtp: (email) => session.requestOtp(email), verifyOtp: (email, code, options) => session.verifyOtp(email, code, options) }
    : { required: false, demoCode: null, hasSession: () => true, requestOtp: async () => {}, verifyOtp: async () => {} });

  // KYC readiness goes through the adapter (it is gated in live); demo uses its stand-in.
  const getReadiness = () => (demoVerification ? kyc.getReadiness() : adapter.getReadiness());

  let client = null;
  const chainClient = () => client ?? (client = createRobinhoodClient({ rpcOverride: config.robinhoodRpcUrl }));
  async function readHoldings(owner) {
    if (demoHoldings) return demoHoldings.read();
    return readPortfolio({ client: chainClient(), owner });
  }

  /** The base fee on Robinhood Chain (eth_gasPrice), for the sell review's ETH check; read only there, not in the 30 s portfolio poll. */
  async function readGasPrice() {
    return demoHoldings ? DEMO_GAS_PRICE_WEI : chainClient().getGasPrice();
  }

  /** Server history (spec S10), only with a Vortex session already verified in this tab; never prompts. */
  async function serverHistory({ email, privyDid }) {
    if (adapter.kind !== "vortex" || !adapter.enabled || !session.hasSession({ email, privyDid })) return null;
    return serverHistoryRows(await session.authenticatedApi("/v1/ramp/history?limit=20", { method: "GET" }), config.network);
  }

  /** The wallet a real sell signs with, on Robinhood Chain. A simulated sell never touches it. */
  async function walletSeam(auth) {
    if (adapter.kind !== "vortex") return { provider: null, chain: robinhoodChain };
    await auth.switchChain(robinhoodChain);
    const provider = await auth.getEthereumProvider();
    if (!provider) throw Object.assign(new Error("Sua carteira ainda está sendo preparada. Aguarde alguns segundos."), { code: "WALLET_NOT_READY" });
    return { provider, chain: robinhoodChain };
  }

  /** Demo deep link sell-reserve-used only: the demo gas reserve spent down to dust. */
  function spendDemoReserve() {
    demoHoldings?.setEthWei(DEMO_RESERVE_DUST_WEI);
  }

  /** Demo only: back to the illustrative start (holdings, simulated ramps, code and KYC). */
  function resetDemo() {
    if (!demo) return;
    demoHoldings.reset();
    demoVerification.reset();
    for (const key of [STOCKS_KEYS.simRamps, STOCKS_KEYS.simActiveRamp, STOCKS_KEYS.simHistory, STOCKS_KEYS.usdcSimulation, STOCKS_KEYS.usdcPreviewHoldings]) tabStorage.remove(key);
  }

  return {
    adapter, usdc, activeRampStore: stores.activeRamp, verification, kyc, getReadiness,
    readHoldings, readGasPrice, valuePortfolio, tokenFlags, withIssuerPauses, serverHistory, walletSeam, resetDemo, spendDemoReserve,
    simulated: adapter.kind === "simulated",
  };
}
