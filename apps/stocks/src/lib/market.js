// Display prices: ONE batched CoinGecko simple/price call for every launch token (BRL + USD, 24 h
// change), cached in localStorage. Keyless, CORS "*", 17/17 ids answered on 2026-09-26 [P2].
// Execution always uses the Vortex quote; these prices only display and feed the price guard.
// Robinhood brand rule: every figure names its source and time (sourceLinePt).
import { local } from "@vortexfi/consumer-kit";
import { STOCK_TOKENS } from "./stocks.js";
import { STOCKS_KEYS } from "./stores.js";

export const COINGECKO_API = "https://api.coingecko.com/api/v3";
export const FX_URL = "https://economia.awesomeapi.com.br/json/last/USD-BRL";
export const PRICE_FRESH_MS = 60_000;
export const PRICE_MAX_AGE_MS = 15 * 60_000;
export const FX_FRESH_MS = 5 * 60_000;
export const FX_MAX_AGE_MS = 24 * 3_600_000;

// Demo only (labelled "valores ilustrativos"): CoinGecko BRL per token, 2026-09-26 13:50 UTC [P2].
export const DEMO_PRICES_AT = Date.parse("2026-09-26T13:50:00Z");
export const DEMO_USD_BRL = 5.1866;
export const DEMO_PRICES_BRL = Object.freeze({
  SPY: 3997.21, TSLA: 1928.75, NVDA: 1163.89, AMZN: 1292.78, AAPL: 1764.33, GOOGL: 1776.93,
  MSFT: 2674.26, QQQ: 3858.5, SPCX: 769.97, META: 3878.13, MU: 5606.84, SGOV: 524.22,
});
// Demo only, illustrative 24 h changes (%) so the demo shows both directions; demoSeries() in
// chart.js ends on the same step, so the chart and the change agree.
export const DEMO_CHANGE_24H_PCT = Object.freeze({
  SPY: 0.42, TSLA: -1.87, NVDA: 1.24, AMZN: -0.36, AAPL: 0.38, GOOGL: 0.91,
  MSFT: -0.52, QQQ: 0.57, SPCX: 3.12, META: -1.07, MU: 2.46, SGOV: 0.01,
});

/** @typedef {{brl:number, usd:number|null, change24hPct:number|null, updatedAt:number|null}} Price */
/** @typedef {{status:"ok"|"stale"|"unavailable", source:"coingecko"|"demo", prices:Record<string, Price>,
 *   savedAt:number|null, error:null|{status:number, rateLimited:boolean, message:string}}} PriceState */

export function buildPricesUrl(tokens = STOCK_TOKENS) {
  const ids = tokens.map((token) => token.coingeckoId).join(",");
  return `${COINGECKO_API}/simple/price?ids=${ids}&vs_currencies=usd,brl&include_24hr_change=true&include_last_updated_at=true`;
}

const positive = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);

/** CoinGecko response -> {[symbol]: Price}. A missing or non-positive id means "no price", never 0. */
export function mapSimplePrice(json, tokens = STOCK_TOKENS) {
  const prices = {};
  for (const token of tokens) {
    const entry = json?.[token.coingeckoId];
    const brl = positive(entry?.brl);
    if (!brl) continue;
    const change = Number(entry.brl_24h_change);
    prices[token.symbol] = {
      brl,
      usd: positive(entry.usd),
      change24hPct: entry.brl_24h_change != null && Number.isFinite(change) ? change : null,
      updatedAt: positive(entry.last_updated_at) ? Number(entry.last_updated_at) * 1000 : null,
    };
  }
  return prices;
}

class MarketHttpError extends Error {
  constructor(status) {
    super(status === 429 ? "Muitas consultas de preço agora." : "Preços indisponíveis agora.");
    this.status = status;
  }
}

async function getJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (fetchImpl ?? globalThis.fetch)(url, { headers: { accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new MarketHttpError(response.status);
    return await response.json();
  } catch (error) {
    if (error instanceof MarketHttpError) throw error;
    throw Object.assign(new MarketHttpError(0), { cause: error });
  } finally { clearTimeout(timer); }
}

/**
 * @param {{ mode?:"demo"|"live", storage?:ReturnType<typeof import("@vortexfi/consumer-kit").createJsonStorage>,
 *   fetchImpl?:typeof fetch, now?:()=>number, tokens?:ReadonlyArray<object>, timeoutMs?:number }} cfg
 */
export function createMarket({ mode = "live", storage = local, fetchImpl, now = Date.now, tokens = STOCK_TOKENS, timeoutMs = 10_000 } = {}) {
  let inFlight = null;
  let last = null;

  function demoState() {
    const at = now();
    const prices = {};
    for (const token of tokens) {
      const brl = DEMO_PRICES_BRL[token.symbol];
      if (brl) prices[token.symbol] = { brl, usd: Number((brl / DEMO_USD_BRL).toFixed(2)), change24hPct: DEMO_CHANGE_24H_PCT[token.symbol] ?? null, updatedAt: at };
    }
    return { status: "ok", source: "demo", prices, savedAt: at, error: null };
  }

  function fromCache(error = null) {
    const cached = storage.get(STOCKS_KEYS.prices, null);
    const age = cached ? now() - Number(cached.savedAt) : Infinity;
    if (cached?.data && age <= PRICE_FRESH_MS && !error) return { status: "ok", source: "coingecko", prices: cached.data, savedAt: cached.savedAt, error: null };
    // 429/5xx/network: keep a cache up to 15 minutes ("atualizado há N min"); older prices show "—".
    if (cached?.data && age <= PRICE_MAX_AGE_MS) return { status: "stale", source: "coingecko", prices: cached.data, savedAt: cached.savedAt, error };
    return { status: "unavailable", source: "coingecko", prices: {}, savedAt: cached?.savedAt ?? null, error };
  }

  /** Last known state without a request (landing first paint). */
  function peek() {
    if (mode === "demo") return demoState();
    return last && last.status === "ok" && now() - last.savedAt <= PRICE_FRESH_MS ? last : fromCache();
  }

  /** @returns {Promise<PriceState>} a fresh cache (<= 60 s) makes no request unless forced */
  async function getPrices({ force = false } = {}) {
    if (mode === "demo") return (last = demoState());
    if (!force) {
      const cached = fromCache();
      if (cached.status === "ok") return (last = cached);
    }
    if (inFlight) return inFlight;
    inFlight = getJson(buildPricesUrl(tokens), fetchImpl, timeoutMs)
      .then((json) => {
        const data = mapSimplePrice(json, tokens);
        if (!Object.keys(data).length) throw new MarketHttpError(0);
        const savedAt = now();
        storage.set(STOCKS_KEYS.prices, { savedAt, data });
        return { status: "ok", source: "coingecko", prices: data, savedAt, error: null };
      })
      .catch((error) => fromCache({ status: Number(error.status || 0), rateLimited: error.status === 429, message: error.message }))
      .then((state) => (last = state))
      .finally(() => { inFlight = null; });
    return inFlight;
  }

  /** Price guard / simulated quotes: {brl, updatedAt} for a priced symbol, else null. */
  function referencePrice(symbol) {
    const state = peek();
    const price = state.status === "unavailable" ? null : state.prices[symbol];
    return price ? { brl: price.brl, updatedAt: price.updatedAt ?? state.savedAt } : null;
  }

  /** USD/BRL for the secondary USD line only. @returns {Promise<{bid:number, updatedAt:number}|null>} */
  async function getUsdBrl() {
    if (mode === "demo") return { bid: DEMO_USD_BRL, updatedAt: now() };
    const cached = storage.get(STOCKS_KEYS.fx, null);
    const age = cached ? now() - Number(cached.savedAt) : Infinity;
    if (cached?.bid && age <= FX_FRESH_MS) return { bid: cached.bid, updatedAt: cached.savedAt };
    try {
      const json = await getJson(FX_URL, fetchImpl, timeoutMs);
      const bid = positive(json?.USDBRL?.bid);
      if (!bid) throw new MarketHttpError(0);
      const savedAt = now();
      storage.set(STOCKS_KEYS.fx, { savedAt, bid });
      return { bid, updatedAt: savedAt };
    } catch {
      return cached?.bid && age <= FX_MAX_AGE_MS ? { bid: cached.bid, updatedAt: cached.savedAt } : null;
    }
  }

  return { getPrices, peek, referencePrice, getUsdBrl };
}

const brasiliaClock = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "Fonte: CoinGecko · atualizado 14:05" (Brasília time); demo prices say they are illustrative. */
export function sourceLinePt(state) {
  if (state?.source === "demo") return "Valores ilustrativos (ambiente de teste)";
  if (!state?.savedAt) return "Fonte: CoinGecko";
  return `Fonte: CoinGecko · atualizado ${brasiliaClock.format(new Date(state.savedAt))}`;
}

/** "atualizado agora" / "atualizado há 3 min" / "atualizado há 1 h" */
export function updatedAgoPt(savedAt, now = Date.now()) {
  const minutes = Math.floor(Math.max(0, now - Number(savedAt)) / 60_000);
  if (minutes < 1) return "atualizado agora";
  if (minutes < 60) return `atualizado há ${minutes} min`;
  return `atualizado há ${Math.floor(minutes / 60)} h`;
}

/**
 * Runs `run` every intervalMs while the page is visible, and immediately when it becomes visible
 * again if isStale() says so. Used for prices (60 s), the portfolio (30 s) and ramp availability
 * (60 s). Returns stop().
 */
export function pollWhileVisible(run, { intervalMs, isStale = () => true, doc = globalThis.document, timers = globalThis } = {}) {
  const visible = () => !doc || doc.visibilityState === undefined || doc.visibilityState === "visible";
  const tick = () => { if (visible()) run(); };
  const onVisibility = () => { if (visible() && isStale()) run(); };
  const id = timers.setInterval(tick, intervalMs);
  doc?.addEventListener?.("visibilitychange", onVisibility);
  return () => {
    timers.clearInterval(id);
    doc?.removeEventListener?.("visibilitychange", onVisibility);
  };
}
