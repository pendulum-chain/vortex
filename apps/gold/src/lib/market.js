const PRICE_KEY = "satoshi:paxg-market:v2";
const MAX_AGE = 10 * 60 * 1000;
const HISTORY_DAYS = 365;
// Daily points per chart period: one more point than days, so the change spans the whole period.
const PERIOD_POINTS = { "7D": 8, "30D": 31, "1A": HISTORY_DAYS + 1 };
export const CHART_PERIODS = Object.keys(PERIOD_POINTS);

function buildDemoPoints() {
  const labels = Array.from({ length: HISTORY_DAYS + 1 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (HISTORY_DAYS - index));
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
  });
  return labels.map((label, index) => ({ label, value: Number((559 + index * 0.47 + Math.sin(index / 2.8) * 4.2 + Math.cos(index / 5) * 2.1).toFixed(2)) }));
}

export function getDemoMarket() {
  const points = buildDemoPoints();
  return { brlPerGram: points.at(-1).value, brlPerOunce: points.at(-1).value * 31.1034768, points, source: "demo" };
}

export function chartWindow(points, period) {
  const shown = points.slice(-PERIOD_POINTS[period]);
  const first = shown[0]?.value;
  const last = shown.at(-1)?.value;
  return { points: shown, change: first && last ? ((last - first) / first) * 100 : 0 };
}

export async function fetchPaxgMarket() {
  const cached = JSON.parse(localStorage.getItem(PRICE_KEY) || "null");
  if (cached && Date.now() - cached.savedAt < MAX_AGE) return cached.data;
  const response = await fetch(`https://api.coingecko.com/api/v3/coins/pax-gold/market_chart?vs_currency=brl&days=${HISTORY_DAYS}&interval=daily`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Não foi possível atualizar o preço do ouro.");
  const json = await response.json();
  const points = json.prices.map(([timestamp, ouncePrice]) => ({ label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(timestamp)), value: Number((ouncePrice / 31.1034768).toFixed(2)) }));
  if (!points.length) throw new Error("Não foi possível atualizar o preço do ouro.");
  const last = points.at(-1).value;
  const data = { brlPerGram: last, brlPerOunce: last * 31.1034768, points, source: "coingecko" };
  localStorage.setItem(PRICE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  return data;
}
