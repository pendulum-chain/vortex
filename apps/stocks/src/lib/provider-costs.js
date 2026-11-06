// Stocks uses direct Relay + Uniswap execution and no additional product markup. Monetary
// details come from the quote; absent provider costs stay unknown, never a guessed zero.
export const DIRECT_PROVIDERS = Object.freeze([
  { id: "ramp", provider: "avenia", name: "Avenia", label: "Entrada ou saída com Pix" },
  { id: "conversion", provider: "nabla", name: "Nabla", label: "Conversão BRLA ↔ USDC" },
  { id: "bridge", provider: "relay", name: "Relay", label: "Base ↔ Robinhood Chain · USDC / USDG" },
  { id: "swap", provider: "uniswap", name: "Uniswap", label: "USDG ↔ Stock Token" },
  { id: "vortex", provider: "vortex", name: "Vortex", label: "Serviço e execução" },
  { id: "network", provider: "network", name: "Redes", label: "Gas na Base e na Robinhood Chain" },
]);

const cents = (value) => Math.round(value * 100) / 100;
const validAmount = (value) => (typeof value === "number" || typeof value === "string")
  && String(value).trim() !== "" && /^-?\d+(?:\.\d+)?$/.test(String(value)) && Number.isFinite(Number(value));

/** The quote's providerCosts[{id, provider, amountFiat, includedIn:"fees"|"rate"}].
 * "fees" entries partition totalFeeFiat (reserve excluded). "rate" entries are signed price
 * effects already embedded in outputAmount, outside totalFeeFiat. Never deduct either twice.
 */
export function providerCostProblem(raw, reserve = null) {
  if (raw.providerCosts == null) return null;
  if (!validAmount(raw.totalFeeFiat) || Number(raw.totalFeeFiat) < 0) return "invalid-total";
  if (!Array.isArray(raw.providerCosts) || raw.providerCosts.length > DIRECT_PROVIDERS.length) return "invalid-list";
  const seen = new Set();
  let feeSum = 0;
  for (const cost of raw.providerCosts) {
    const expected = DIRECT_PROVIDERS.find((item) => item.id === cost?.id);
    if (!expected || seen.has(cost.id) || cost.provider !== expected.provider || !validAmount(cost.amountFiat)
      || !["fees", "rate"].includes(cost.includedIn) || (cost.includedIn === "fees" && Number(cost.amountFiat) < 0)) return "invalid-entry";
    seen.add(cost.id);
    if (cost.includedIn === "fees") feeSum += Number(cost.amountFiat);
  }
  const feeTotal = Number(raw.totalFeeFiat) - (reserve?.brl || 0);
  const feeDifferenceCents = Math.round(feeSum * 100) - Math.round(feeTotal * 100);
  if (feeDifferenceCents > 1) return "fees-exceed-total";
  if (seen.size === DIRECT_PROVIDERS.length && Math.abs(feeDifferenceCents) > 1) return "fees-do-not-reconcile";
  // Vortex and network amounts cannot be hidden inside the execution rate.
  for (const cost of raw.providerCosts) {
    if (["vortex", "network"].includes(cost.id) && cost.includedIn !== "fees") return "invalid-inclusion";
  }
  const vortex = raw.providerCosts.find((cost) => cost.id === "vortex");
  if (vortex && raw.vortexFeeFiat != null && (!validAmount(raw.vortexFeeFiat)
    || Math.abs(Number(vortex.amountFiat) - Number(raw.vortexFeeFiat)) > 0.01)) return "vortex-fee-mismatch";
  return null;
}

export function quoteProviderCosts(raw, { reserve = null, simulated = false } = {}) {
  const fallback = {
    ramp: raw.anchorFeeFiat,
    vortex: raw.vortexFeeFiat,
    network: raw.networkFeeFiat == null ? null : Number(raw.networkFeeFiat) - (reserve?.brl || 0),
  };
  const rows = DIRECT_PROVIDERS.map((item) => {
    const supplied = raw.providerCosts?.find((cost) => cost.id === item.id);
    const value = supplied ? supplied.amountFiat : fallback[item.id];
    const amount = validAmount(value) && Number(value) >= 0 ? Number(value)
      : supplied?.includedIn === "rate" && validAmount(value) ? Number(value) : null;
    return { ...item, amount, includedIn: supplied?.includedIn || "fees" };
  });
  const complete = rows.every((row) => row.amount !== null);
  const rateEffects = rows.filter((row) => row.includedIn === "rate").reduce((sum, row) => sum + (row.amount || 0), 0);
  return {
    routing: raw.routingStrategy === "direct" ? "direct" : "unconfirmed", simulated, rows, complete,
    extraProductFee: 0,
    identifiedTotal: complete ? cents(Number(raw.totalFeeFiat) + rateEffects) : null,
  };
}

export function costBps(amount, basis) {
  return Number.isFinite(amount) && Number.isFinite(basis) && basis > 0 ? amount / basis * 10_000 : null;
}
