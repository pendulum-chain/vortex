// The simulated ramp adapter for demo and preview. It makes ZERO calls to the Vortex
// API and ZERO wallet (provider.request) calls, and it never produces a Pix code: a simulated ramp
// has depositQrCode === null and the UI shows a watermarked "Simulação — sem código Pix" box.
// (Gold's demo shows an EMV-shaped Pix payload; nothing like it exists here, see pilot-safety.test.mjs.)
// Progress is derived from the wall clock (startedAt + phase length), so a reload or a new tab
// state resumes where it was; records live in sessionStorage.
// Gas reserve: it mirrors the Vortex rule. A buy quoted while the demo ETH
// balance is below the threshold includes the top-up (target - balance) as its own fee; the demo
// holdings receive that ETH on success, so later buys do not include it again. Without demo
// holdings (preview) the balance is unknown and the full reserve is quoted, as Vortex does
// without a destinationAddress.
import { session } from "@vortexfi/consumer-kit";
import { formatUnits, parseUnits } from "viem";
import { simulatedFees, simulatedProviderCosts } from "./fee-model.js";
import { StocksRampError, assertNoOtherActiveRamp, settleRamp, toStockRamp } from "./ramp-contract.js";
import { STOCK_TOKENS } from "./stocks.js";
import { STOCKS_KEYS } from "./stores.js";
import { WEI, assertSellBalance, tokensToWei } from "./token.js";

export const SIM_PHASES = Object.freeze({
  BUY: Object.freeze(["brlaOnrampMint", "nablaSwap", "relayBridge", "uniswapSwap", "destinationTransfer", "complete"]),
  SELL: Object.freeze(["uniswapSwap", "relayBridge", "nablaSwap", "brlaPayoutOnBase", "complete"]),
});
export const SIM_PHASE_MS = Object.freeze({ fast: 1_200, normal: 3_000 });
export const SIM_QUOTE_TTL_MS = 60_000;
export const SIM_START_WINDOW_MS = 15 * 60_000;
const SIM_NETWORK = "robinhood";
const KEEP_RAMPS = 20;

// The illustrative fee model lives in fee-model.js (the landing's cost example uses it too).
export { SIM_FEES, simulatedFees } from "./fee-model.js";

// The reserve rule: below 0.00002 ETH, top up to 0.00005 ETH.
// BRL at an illustrative ETH price: US$ 2,716.75 (Coinbase, 2026-09-29 14:13 UTC) x 5.2165 BRL/USD
// (AwesomeAPI mid, 13:40 UTC) = R$ 14,172 per ETH, so 0.00005 ETH = R$ 0.71.
export const SIM_GAS_RESERVE = Object.freeze({ targetWei: 50_000_000_000_000n, thresholdWei: 20_000_000_000_000n, brlPerEth: 14_172 });

/**
 * The simulated reserve for a wallet holding balanceWei ETH (null = unknown: the full target, as
 * Vortex quotes without a destinationAddress); null from the threshold up.
 * @returns {import("./gas-reserve.js").GasReserve|null}
 */
export function simulatedGasReserve(balanceWei) {
  const balance = balanceWei == null ? 0n : BigInt(balanceWei);
  if (balance >= SIM_GAS_RESERVE.thresholdWei) return null;
  const wei = SIM_GAS_RESERVE.targetWei - balance;
  const amount = formatUnits(wei, 18);
  return Object.freeze({ amount, amountWei: wei.toString(), currency: "ETH", brl: Math.round(Number(amount) * SIM_GAS_RESERVE.brlPerEth * 100) / 100, usd: null });
}

const priceWei = (brl) => parseUnits(String(Number(brl)), 18);

function abortError() {
  return new DOMException("Aborted", "AbortError");
}

function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const abort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/**
 * @param {{ getReferencePrice:(symbol:string)=>({brl:number}|null), speed?:"fast"|"normal",
 *   activeRampStore?:ReturnType<typeof import("@vortexfi/consumer-kit").createActiveRampStore>,
 *   storage?:object, now?:()=>number, sleep?:(ms:number, signal?:AbortSignal)=>Promise<void>,
 *   demoHoldings?:{apply:Function, balanceOf:Function, ethWei:Function}|null, tokens?:ReadonlyArray<object> }} deps
 *   demoHoldings (demo mode only) is credited/debited on success and checked before a sell; its ETH
 *   decides the gas reserve.
 */
export function createSimulatedStocksAdapter({
  getReferencePrice, speed = "normal", activeRampStore = null, storage = session,
  now = Date.now, sleep = abortableSleep, demoHoldings = null, tokens = STOCK_TOKENS,
} = {}) {
  const phaseMs = SIM_PHASE_MS[speed] ?? SIM_PHASE_MS.normal;
  const quotes = new Map();

  const load = () => {
    const state = storage.get(STOCKS_KEYS.simRamps, null);
    return state && typeof state === "object" && state.ramps ? state : { seq: 0, ramps: {} };
  };
  const save = (state) => {
    const ids = Object.keys(state.ramps).sort((a, b) => Date.parse(state.ramps[b].createdAt) - Date.parse(state.ramps[a].createdAt));
    for (const id of ids.slice(KEEP_RAMPS)) delete state.ramps[id];
    if (!storage.set(STOCKS_KEYS.simRamps, state)) throw new Error("Não foi possível salvar a operação simulada. Tente novamente.");
  };
  const nextId = (prefix) => {
    const state = load();
    state.seq = Number(state.seq || 0) + 1;
    save(state);
    return `${prefix}-${state.seq}`;
  };
  const findToken = (symbol) => {
    const token = tokens.find((item) => item.symbol === String(symbol || "").toUpperCase());
    if (!token) throw new StocksRampError("TOKEN_NOT_ALLOWED");
    return token;
  };
  const referenceFor = (token) => {
    const brl = Number(getReferencePrice?.(token.symbol)?.brl);
    if (!(brl > 0)) throw new StocksRampError("TOKEN_UNAVAILABLE", "Preço indisponível agora. Tente novamente em instantes.");
    return brl;
  };

  function makeQuote({ direction, token, brlAmount, tokenAmountWei, fees, gasReserve = null }) {
    const id = nextId("sim-q");
    const tokenAmount = formatUnits(tokenAmountWei, 18);
    const tokens = Number(tokenAmount);
    const quote = Object.freeze({
      id, direction, symbol: token.symbol, tokenAddress: token.address, brlAmount, tokenAmount,
      tokenAmountWei: tokenAmountWei.toString(), fees: Object.freeze(fees),
      impliedBrlPerToken: direction === "BUY" ? (brlAmount - fees.total) / tokens : (brlAmount + fees.total) / tokens,
      expiresAt: now() + SIM_QUOTE_TTL_MS, gasless: false, gasReserve, simulated: true,
      rawQuote: Object.freeze({ id, simulated: true, rampType: direction, network: SIM_NETWORK, routingStrategy: "direct",
        totalFeeFiat: fees.total, partnerFeeFiat: 0,
        providerCosts: simulatedProviderCosts(direction === "BUY" ? brlAmount : brlAmount + fees.total),
      }),
    });
    quotes.set(id, quote);
    return quote;
  }

  async function quoteBuy({ symbol, brlAmount }) {
    const token = findToken(symbol);
    const amount = Number(brlAmount);
    if (!Number.isFinite(amount) || amount <= 0) throw new StocksRampError("INVALID_QUOTE", "Informe um valor válido.");
    // As in the wire contract: the reserve is inside the total, and fees.network excludes it.
    const gasReserve = simulatedGasReserve(demoHoldings ? demoHoldings.ethWei() : null);
    const base = simulatedFees(amount);
    const fees = gasReserve ? { ...base, total: Math.round((base.total + gasReserve.brl) * 100) / 100 } : base;
    if (amount <= fees.total) throw new StocksRampError("INVALID_QUOTE", "O valor é pequeno demais para cobrir as taxas.");
    // tokens = floor18((amount - total) / price)
    const tokenAmountWei = (parseUnits((amount - fees.total).toFixed(2), 18) * WEI) / priceWei(referenceFor(token));
    return makeQuote({ direction: "BUY", token, brlAmount: amount, tokenAmountWei, fees, gasReserve });
  }

  async function quoteSell({ symbol, tokenAmount }) {
    const token = findToken(symbol);
    let tokenAmountWei;
    try { tokenAmountWei = tokensToWei(tokenAmount); } catch (error) { throw new StocksRampError("INVALID_QUOTE", error.message); }
    if (tokenAmountWei <= 0n) throw new StocksRampError("INVALID_QUOTE", "Informe uma quantidade válida de tokens.");
    const gross = Number(formatUnits((tokenAmountWei * priceWei(referenceFor(token))) / WEI, 18));
    const fees = simulatedFees(gross);
    const net = Math.floor((gross - fees.total) * 100) / 100;
    if (!(net > 0)) throw new StocksRampError("INVALID_QUOTE", "A quantidade é pequena demais para cobrir as taxas.");
    return makeQuote({ direction: "SELL", token, brlAmount: net, tokenAmountWei, fees });
  }

  function acceptQuote(quote, direction) {
    const own = quotes.get(quote?.id);
    if (!own || own.direction !== direction) throw new StocksRampError("INVALID_QUOTE");
    if (own.expiresAt <= now()) throw new StocksRampError("INVALID_QUOTE", "A cotação expirou. Atualize a cotação.");
    quotes.delete(quote.id);
    return own;
  }

  function createRecord(quote, walletAddress) {
    const buy = quote.direction === "BUY";
    const id = nextId("sim-r");
    const record = {
      id, type: quote.direction, symbol: quote.symbol, network: SIM_NETWORK,
      from: buy ? "pix" : SIM_NETWORK, to: buy ? SIM_NETWORK : "pix",
      inputAmount: buy ? String(quote.brlAmount) : quote.tokenAmount, inputCurrency: buy ? "BRL" : quote.tokenAddress,
      outputAmount: buy ? quote.tokenAmount : String(quote.brlAmount), outputCurrency: buy ? quote.tokenAddress : "BRL",
      tokenAmountWei: quote.tokenAmountWei, walletAddress: walletAddress.toLowerCase(),
      gasReserveWei: buy && quote.gasReserve ? quote.gasReserve.amountWei : "0",
      status: "PENDING", currentPhase: "initial", depositQrCode: null, simulatedPix: buy,
      createdAt: new Date(now()).toISOString(), startedAt: null, settled: false,
    };
    const state = load();
    state.ramps[id] = record;
    save(state);
    return record;
  }

  const recovery = (record, stage) => ({ rampId: record.id, walletAddress: record.walletAddress, inputAmount: record.inputAmount, outputAmount: record.outputAmount, rampType: record.type, stage, symbol: record.symbol, tokenAddress: record.type === "BUY" ? record.outputCurrency : record.inputCurrency, simulated: true, createdAt: Date.parse(record.createdAt) });

  function materialize(record) {
    if (!record.startedAt) return record;
    const phases = SIM_PHASES[record.type];
    const index = Math.min(Math.floor((now() - record.startedAt) / phaseMs), phases.length - 1);
    const currentPhase = phases[Math.max(0, index)];
    return { ...record, currentPhase, status: currentPhase === "complete" ? "COMPLETE" : "PENDING" };
  }

  function loadRecord(rampId) {
    const record = load().ramps[rampId];
    if (!record) throw Object.assign(new Error("Esta operação simulada não existe mais nesta aba."), { status: 404, code: "SIM_RAMP_NOT_FOUND" });
    return record;
  }

  async function getRamp(rampId) {
    const record = materialize(loadRecord(rampId));
    const ramp = toStockRamp(record, { symbolHint: record.symbol, now: now() });
    if ((ramp.classification === "success" || ramp.classification === "failure") && !record.settled) {
      if (ramp.classification === "success") demoHoldings?.apply({ operationId: record.id, direction: record.type, symbol: record.symbol, tokenAmountWei: record.tokenAmountWei, gasReserveWei: record.gasReserveWei ?? "0" });
      settleRamp(activeRampStore, ramp, { walletAddress: record.walletAddress, simulated: true });
      const state = load();
      if (state.ramps[rampId]) { state.ramps[rampId].settled = true; save(state); }
    }
    return ramp;
  }

  async function registerBuy({ quote, walletAddress }) {
    const own = acceptQuote(quote, "BUY");
    if (!walletAddress) throw new StocksRampError("WALLET_NOT_READY");
    assertNoOtherActiveRamp(activeRampStore, walletAddress);
    const record = createRecord(own, walletAddress);
    activeRampStore?.save(recovery(record, "registered"));
    return getRamp(record.id);
  }

  async function registerSell({ quote, walletAddress, onRegistered }) {
    const own = acceptQuote(quote, "SELL");
    if (!walletAddress) throw new StocksRampError("WALLET_NOT_READY");
    assertNoOtherActiveRamp(activeRampStore, walletAddress);
    if (demoHoldings) assertSellBalance(demoHoldings.balanceOf(own.symbol), own.tokenAmountWei);
    const record = createRecord(own, walletAddress);
    activeRampStore?.save(recovery(record, "signing"));
    const ramp = await getRamp(record.id);
    onRegistered?.(ramp);
    // Nothing to sign: the simulated sell never asks the wallet.
    activeRampStore?.save(recovery(record, "ready"));
    return ramp;
  }

  async function resumeSell({ rampId }) {
    const record = loadRecord(rampId);
    const ramp = await getRamp(rampId);
    if (!record.settled && ramp.classification !== "success" && ramp.classification !== "failure") activeRampStore?.save(recovery(record, "ready"));
    return ramp;
  }

  async function abandonRamp(rampId) {
    const { walletAddress } = loadRecord(rampId);
    const ramp = await getRamp(rampId);
    if (ramp.currentPhase === "initial") settleRamp(activeRampStore, { ...ramp, classification: "failure" }, { walletAddress, simulated: true });
    return ramp;
  }

  async function startRamp(rampId) {
    const record = loadRecord(rampId);
    if (!record.startedAt) {
      if (record.type === "BUY" && now() > Date.parse(record.createdAt) + SIM_START_WINDOW_MS) {
        throw new StocksRampError("INVALID_QUOTE", "O prazo para iniciar esta compra terminou. Gere um novo Pix.");
      }
      const state = load();
      state.ramps[rampId] = { ...record, startedAt: now() };
      save(state);
    }
    return getRamp(rampId);
  }

  async function pollStatus(rampId, { signal, onUpdate, intervalMs, timeoutMs = 20 * 60_000 } = {}) {
    const startedAt = now();
    for (;;) {
      if (signal?.aborted) throw abortError();
      const ramp = await getRamp(rampId);
      onUpdate?.(ramp);
      if (ramp.classification === "success" || ramp.classification === "failure") return ramp;
      if (now() - startedAt >= timeoutMs) throw Object.assign(new Error("A operação continua em processamento. Você pode fechar esta tela e acompanhar depois."), { code: "POLL_TIMEOUT" });
      await sleep(intervalMs ?? Math.round(phaseMs / 2), signal);
    }
  }

  return {
    kind: "simulated",
    enabled: true,
    requiresVortexSession: false,
    async getAvailability() {
      return Object.freeze(Object.fromEntries(tokens.map((token) => [token.symbol, Object.freeze({ buy: true, sell: true, reason: null })])));
    },
    async getReadiness() { return { kycStatus: "approved", canBuy: true, canSell: true }; },
    quoteBuy,
    quoteSell,
    registerBuy,
    registerSell,
    resumeSell,
    abandonRamp,
    startRamp,
    getRamp,
    pollStatus,
  };
}
