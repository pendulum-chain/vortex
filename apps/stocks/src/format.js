// UI formatting (pt-BR). Money and change come from the kit so Gold and Stocks read the same.
import { formatBRL, formatChange, formatNumber, formatPercent, shortAddress } from "@vortexfi/consumer-kit";

export { formatBRL, formatChange, formatNumber, formatPercent, shortAddress };

const isPositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 && value !== null && value !== "";

/** "R$ 1.163,89", or "—" when there is no price (never "R$ 0,00"). */
export const priceBRL = (value) => (isPositive(value) ? formatBRL(value) : "—");

/**
 * The portfolio headline: "—" while it is not known (no balance read yet, e.g. the first Robinhood
 * Chain read failed, or no holding has a price), never "R$ 0,00" for a wallet that holds tokens.
 * @param {{holdings:object[], totalBrl:number, unpricedCount:number}|null} valued valuePortfolio()
 */
export function portfolioTotalPt(valued) {
  if (!valued || (valued.holdings.length > 0 && valued.unpricedCount === valued.holdings.length)) return "—";
  return formatBRL(valued.totalBrl);
}

/** "US$ 224,40" */
export const priceUSD = (value) => (isPositive(value) ? `US$ ${formatNumber(value, 2)}` : "—");

const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" });

/** "26/09/2026, 14:05" (Brasília) */
export const formatDateTime = (ms) => (Number.isFinite(Number(ms)) && ms ? dateTime.format(new Date(Number(ms))) : "");

/** "26 de set." */
export const formatDayMonth = (ms) => (Number.isFinite(Number(ms)) && ms ? dayMonth.format(new Date(Number(ms))) : "");

/** "Ana Silva" -> "AS" */
export const initials = (name) => String(name || "").split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "V";

/** Screen-reader wording for a 24 h change: "alta de 1,24% em 24 horas". */
export function changeLabel(pct, period = "em 24 horas") {
  if (pct == null || !Number.isFinite(Number(pct))) return "variação indisponível";
  const text = formatPercent(Math.abs(Number(pct)), { signed: false });
  if (/^[0.,]+%$/.test(text)) return `estável ${period}`;
  return `${Number(pct) < 0 ? "queda" : "alta"} de ${text} ${period}`;
}

/** CPF as typed: "12345678901" -> "123.456.789-01" (partial input stays partial). */
export function formatCpfInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  return digits.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/** CEP as typed: "01310100" -> "01310-100". */
export function formatCepInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}
