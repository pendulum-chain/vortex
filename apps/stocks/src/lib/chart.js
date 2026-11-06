// Detail-screen price chart data. Fetched lazily, one token at a time, only when a detail screen
// opens: about eight rapid market_chart calls from one IP were answered with HTTP 429 for minutes.
// So: 6 h cache per series, at most 8 cached series, one request per id at a
// time, and a cool-down after a 429 during which only cached series are shown.
// Most tokens use the CoinGecko xStocks series of the same share as a labelled reference (another
// issuer's token); SGOV uses its own token series. Any length >= 2 points works.
import { local } from "@vortexfi/consumer-kit";
import { COINGECKO_API, DEMO_CHANGE_24H_PCT, DEMO_PRICES_BRL } from "./market.js";
import { STOCK_TOKENS, findStock } from "./stocks.js";
import { chartKey } from "./stores.js";

export const CHART_PERIODS = Object.freeze(["7D", "30D", "3M", "1A"]);
// Daily points per period: one more point than days, so the change spans the whole period (Gold).
export const PERIOD_POINTS = Object.freeze({ "7D": 8, "30D": 31, "3M": 91, "1A": 366 });
export const MAX_PERIOD = "Máx.";
export const CHART_TTL_MS = 6 * 3_600_000;
export const MAX_CHART_ENTRIES = 8;
export const RATE_LIMIT_COOLDOWN_MS = 2 * 60_000;

/** @typedef {{t:number, value:number}} ChartPoint  (t = ms epoch, value = BRL) */
/** @typedef {{status:"ok", points:ChartPoint[], source:"xstocks-proxy"|"token"|"demo", coingeckoId:string|null, savedAt:number, stale:boolean}
 *   | {status:"rate_limited"|"unavailable", retryAt:number|null}} ChartResult */

export function buildChartUrl(coingeckoId) {
  return `${COINGECKO_API}/coins/${encodeURIComponent(coingeckoId)}/market_chart?vs_currency=brl&days=365&interval=daily`;
}

/** market_chart JSON -> points sorted by time, invalid prices dropped. */
export function toPoints(json) {
  const prices = Array.isArray(json?.prices) ? json.prices : [];
  return prices
    .map(([t, value]) => ({ t: Number(t), value: Number(value) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => a.t - b.t);
}

/** Periods the series is long enough for; "Máx." (the whole series) when "1A" is not. Fewer than 2 points: none. */
export function availablePeriods(points) {
  const length = points?.length ?? 0;
  if (length < 2) return [];
  const periods = CHART_PERIODS.filter((period) => PERIOD_POINTS[period] <= length);
  return periods.includes("1A") ? periods : [...periods, MAX_PERIOD];
}

/** Gold's window: the last N points and the change over the whole shown window. */
export function chartWindow(points, period) {
  const shown = period === MAX_PERIOD ? points.slice() : points.slice(-PERIOD_POINTS[period]);
  const first = shown[0]?.value;
  const last = shown[shown.length - 1]?.value;
  return { points: shown, change: first && last ? ((last - first) / first) * 100 : 0 };
}

// Daily points are stamped 00:00 UTC: their calendar date is the UTC one (in Brasília time the
// same instant is still the previous evening).
const monthYear = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short", year: "numeric" });
const fullDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });

/** "Máx. (desde jun/2026)" */
export function maxPeriodLabelPt(points) {
  if (!points?.length) return MAX_PERIOD;
  const [month, year] = monthYear.format(new Date(points[0].t)).replace(/\./g, "").split(" de ");
  return `${MAX_PERIOD} (desde ${month}/${year})`;
}

/** Source caption under the chart; every statistic names its source and period. */
export function chartCaptionPt(token, result) {
  if (result?.status !== "ok" || !result.points.length) return "";
  const first = fullDate.format(new Date(result.points[0].t));
  const last = fullDate.format(new Date(result.points[result.points.length - 1].t));
  if (result.source === "demo") return "Série ilustrativa (ambiente de teste)";
  if (result.source === "token") return `Preço deste token em reais (fonte: CoinGecko, desde ${first})`;
  const subject = token.type === "etf" ? "do fundo" : "da ação";
  return `Preço de referência ${subject} ${token.namePt} em reais (fonte: CoinGecko, série xStocks de outro emissor; ${first}–${last})`;
}

// Demo only: deterministic, illustrative daily series ending at the demo price. SPCX and MU are
// shorter, like their real series (IPO 2026-06-12; proxy since 2026-06-04), so "Máx." shows up.
const DEMO_LENGTH = Object.freeze({ SPCX: 108, MU: 112 });
export function demoSeries(token, now = Date.now()) {
  const length = DEMO_LENGTH[token.symbol] ?? 366;
  const end = DEMO_PRICES_BRL[token.symbol] ?? 100;
  const seed = [...token.symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const today = Math.floor(now / 86_400_000) * 86_400_000;
  // SGOV (T-bills, yield reinvested) barely moves; index funds move less than single stocks.
  const calm = token.role === "dollar-reserve";
  const swing = calm ? 0.01 : token.badgesPt.includes("Oscila mais") ? 1.35 : token.type === "etf" ? 0.55 : 0.9;
  const trend = calm ? 0.00012 : 0.0003 + (seed % 7) * 0.00012;
  const change = DEMO_CHANGE_24H_PCT[token.symbol];
  // Built backwards from today's demo price with smooth daily returns; the last step is the
  // illustrative 24 h change, so the chart agrees with the price list.
  const values = new Array(length);
  values[length - 1] = end;
  for (let index = length - 2; index >= 0; index -= 1) {
    const step = index === length - 2 && Number.isFinite(change)
      ? change / 100
      : trend + (Math.sin((index + seed) / 5.3) * 0.011 + Math.cos((index + seed) / 14) * 0.006) * swing;
    values[index] = values[index + 1] / (1 + step);
  }
  return values.map((value, index) => ({ t: today - (length - 1 - index) * 86_400_000, value: Number(value.toFixed(2)) }));
}

/**
 * @param {{ mode?:"demo"|"live", storage?:object, fetchImpl?:typeof fetch, now?:()=>number, tokens?:ReadonlyArray<object>, timeoutMs?:number }} cfg
 */
export function createChartLoader({ mode = "live", storage = local, fetchImpl, now = Date.now, tokens = STOCK_TOKENS, timeoutMs = 10_000 } = {}) {
  const inFlight = new Map();
  let cooldownUntil = 0;

  const cachedEntry = (id) => {
    const entry = storage.get(chartKey(id), null);
    return entry && Array.isArray(entry.points) && Number.isFinite(Number(entry.savedAt)) ? entry : null;
  };
  const okResult = (entry, stale) => ({ status: "ok", points: entry.points, source: entry.source, coingeckoId: entry.coingeckoId, savedAt: entry.savedAt, stale });

  // Every possible chart key is known (the allowlist), so eviction needs no index key.
  function evict() {
    const ids = [...new Set(tokens.flatMap((token) => [token.chart.coingeckoId, token.coingeckoId]))];
    const entries = ids.map((id) => ({ id, entry: cachedEntry(id) })).filter((item) => item.entry).sort((a, b) => b.entry.savedAt - a.entry.savedAt);
    for (const { id } of entries.slice(MAX_CHART_ENTRIES)) storage.remove(chartKey(id));
  }

  async function fetchSeries(id) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await (fetchImpl ?? globalThis.fetch)(buildChartUrl(id), { headers: { accept: "application/json" }, signal: controller.signal });
      if (response.status === 429) throw Object.assign(new Error("rate limited"), { rateLimited: true });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return toPoints(await response.json());
    } finally { clearTimeout(timer); }
  }

  async function loadFresh(token, primaryId) {
    let points = await fetchSeries(primaryId);
    let source = token.chart.source;
    let id = primaryId;
    // A proxy series that is empty or too short falls back to the token's own series (one extra call).
    if (points.length < 2 && token.chart.source === "xstocks-proxy" && token.coingeckoId !== primaryId) {
      points = await fetchSeries(token.coingeckoId);
      source = "token";
      id = token.coingeckoId;
    }
    if (points.length < 2) return { status: "unavailable", retryAt: null };
    const entry = { savedAt: now(), coingeckoId: id, source, points };
    storage.set(chartKey(primaryId), entry);
    evict();
    return okResult(entry, false);
  }

  /**
   * @param {string|object} symbolOrToken
   * @returns {Promise<ChartResult>}
   */
  async function load(symbolOrToken, { force = false } = {}) {
    const token = typeof symbolOrToken === "string" ? findStock(symbolOrToken) : symbolOrToken;
    if (!token) return { status: "unavailable", retryAt: null };
    if (mode === "demo") return { status: "ok", points: demoSeries(token, now()), source: "demo", coingeckoId: null, savedAt: now(), stale: false };
    const id = token.chart.coingeckoId;
    const cached = cachedEntry(id);
    if (cached && !force && now() - cached.savedAt <= CHART_TTL_MS) return okResult(cached, false);
    // After a 429, show whatever is cached (even older than 6 h: daily data ages slowly) or wait.
    if (now() < cooldownUntil) return cached ? okResult(cached, true) : { status: "rate_limited", retryAt: cooldownUntil };
    if (inFlight.has(id)) return inFlight.get(id);
    const request = loadFresh(token, id)
      .catch((error) => {
        if (error?.rateLimited) cooldownUntil = now() + RATE_LIMIT_COOLDOWN_MS;
        if (cached) return okResult(cached, true);
        return error?.rateLimited ? { status: "rate_limited", retryAt: cooldownUntil } : { status: "unavailable", retryAt: null };
      })
      .finally(() => inFlight.delete(id));
    inFlight.set(id, request);
    return request;
  }

  return { load };
}
