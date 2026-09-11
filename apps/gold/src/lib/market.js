const PRICE_KEY = "satoshi:paxg-market:v1";
const MAX_AGE = 10 * 60 * 1000;

function buildDemoPoints() {
  const labels = Array.from({ length: 42 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (41 - index));
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
  });
  return labels.map((label, index) => ({ label, value: Number((559 + index * 0.47 + Math.sin(index / 2.8) * 4.2 + Math.cos(index / 5) * 2.1).toFixed(2)) }));
}

export function getDemoMarket() {
  const points = buildDemoPoints();
  return { brlPerGram: points.at(-1).value, brlPerOunce: points.at(-1).value * 31.1034768, change: 2.34, points, source: "demo" };
}

export async function fetchPaxgMarket() {
  const cached = JSON.parse(localStorage.getItem(PRICE_KEY) || "null");
  if (cached && Date.now() - cached.savedAt < MAX_AGE) return cached.data;
  const response = await fetch("https://api.coingecko.com/api/v3/coins/pax-gold/market_chart?vs_currency=brl&days=42&interval=daily", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Não foi possível atualizar o preço do ouro.");
  const json = await response.json();
  const points = json.prices.map(([timestamp, ouncePrice]) => ({ label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(timestamp)), value: Number((ouncePrice / 31.1034768).toFixed(2)) }));
  const first = points[0]?.value || 1;
  const last = points.at(-1)?.value || first;
  const data = { brlPerGram: last, brlPerOunce: last * 31.1034768, change: ((last - first) / first) * 100, points, source: "coingecko" };
  localStorage.setItem(PRICE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  return data;
}
