// Presentation only: never changes an executable quote, payment amount or approval.
const round = (value, currency) => {
  const scale = currency === "USDC" ? 1e6 : 100;
  const result = Math.round(value * scale) / scale;
  return result === 0 ? 0 : result;
};

export function groupedFees({ rows, total, reserve = 0, currency = "BRL", method = "pix", direction = "BUY" }) {
  const selling = direction === "SELL";
  const definitions = method === "usdc"
    ? [{ id: "trade", ids: ["swap"] }, { id: "delivery", ids: ["bridge", "network"] }, { id: "service", ids: ["vortex"] }]
    : [{ id: "payment", ids: selling ? ["conversion", "ramp"] : ["ramp", "conversion"] }, { id: "tradeDelivery", ids: selling ? ["swap", "bridge", "network"] : ["bridge", "swap", "network"] }, { id: "service", ids: ["vortex"] }];
  const groups = definitions.map(group => {
    const items = group.ids.map(id => {
      const row = rows.find(item => item.id === id);
      return { id, amount: typeof row?.amount === "number" && Number.isFinite(row.amount) ? row.amount : null, includedIn: row?.includedIn || "fees" };
    });
    return { id: group.id, items, amount: items.every(item => item.amount !== null) ? round(items.reduce((sum, item) => sum + item.amount, 0), currency) : null };
  });
  const items = groups.flatMap(group => group.items);
  const reported = round(total - reserve, currency);
  const feeSum = round(items.filter(item => item.includedIn === "fees").reduce((sum, item) => sum + (item.amount ?? 0), 0), currency);
  const complete = items.every(item => item.amount !== null) && Math.abs(feeSum - reported) < (currency === "USDC" ? 0.0000005 : 0.005);
  const hasPriceEffects = items.some(item => item.includedIn === "rate");
  const priceEffects = items.filter(item => item.includedIn === "rate").reduce((sum, item) => sum + (item.amount ?? 0), 0);
  return { groups, complete, hasPriceEffects, reported, amount: complete ? round(reported + priceEffects, currency) : reported, label: !complete ? "reported" : hasPriceEffects ? "costs" : "fees" };
}

export function formatCostAmount(amount, currency = "BRL", locale = "pt-BR") {
  if (amount === null || !Number.isFinite(amount)) return locale === "en" ? "Not itemized" : "Não discriminado";
  const digits = currency === "USDC" || (amount !== 0 && Math.abs(amount) < 0.01) ? 6 : 2;
  const options = { minimumFractionDigits: 2, maximumFractionDigits: digits };
  const language = locale === "en" ? "en-US" : "pt-BR";
  return currency === "USDC" ? `${new Intl.NumberFormat(language, options).format(amount)} USDC`
    : new Intl.NumberFormat(language, { ...options, style: "currency", currency: "BRL" }).format(amount);
}

export function formatCostPercent(amount, basis, locale = "pt-BR") {
  if (!Number.isFinite(amount) || !Number.isFinite(basis) || basis <= 0) return null;
  const percent = amount / basis * 100;
  return `${new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: percent !== 0 && Math.abs(percent) < 0.01 ? 6 : 2 }).format(percent)}%`;
}
