// Client-side deviation guard (defence in depth; the control is the server's price guard).
// Thresholds exclude fees, which the confirm screen shows separately.
import { formatNumber } from "@vortexfi/consumer-kit";

export const PRICE_GUARD = Object.freeze({ warnPct: Object.freeze({ A: 1.0, B: 2.0 }), blockPct: 5.0, maxReferenceAgeMs: 15 * 60_000 });

/**
 * deviation = (quote.impliedBrlPerToken - reference) / reference * 100. Sign-aware: a BUY warns
 * when the user pays MORE than the reference (+), a SELL when the user receives LESS (-). A
 * deviation in the user's favour is "ok".
 * @param {{quote:{direction:"BUY"|"SELL", impliedBrlPerToken:number}, reference:{brl:number, updatedAt:number}|null,
 *   tier?:"A"|"B", now?:number}} args
 * @returns {{status:"ok"|"warn"|"block"|"unknown", deviationPct:number|null}}
 */
export function checkQuotePrice({ quote, reference, tier = "A", now = Date.now() }) {
  const brl = Number(reference?.brl);
  const updatedAt = Number(reference?.updatedAt);
  const implied = Number(quote?.impliedBrlPerToken);
  if (!(brl > 0) || !Number.isFinite(updatedAt) || now - updatedAt > PRICE_GUARD.maxReferenceAgeMs || !(implied > 0)) return { status: "unknown", deviationPct: null };
  const deviationPct = ((implied - brl) / brl) * 100;
  const againstUser = quote.direction === "SELL" ? -deviationPct : deviationPct;
  const warnPct = PRICE_GUARD.warnPct[tier] ?? PRICE_GUARD.warnPct.A;
  if (againstUser > PRICE_GUARD.blockPct) return { status: "block", deviationPct };
  if (againstUser > warnPct) return { status: "warn", deviationPct };
  return { status: "ok", deviationPct };
}

const brasiliaTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * Confirm-screen copy. warn needs a second checkbox; block has no confirm button.
 * @returns {{tone:"warning"|"error"|"neutral", title:string|null, text:string}|null} null when ok
 */
export function priceGuardCopyPt(result, { direction = "BUY", reference } = {}) {
  if (result.status === "ok") return null;
  if (result.status === "block") return { tone: "error", title: "Cotação bloqueada", text: "Esta cotação está muito longe do preço de referência. Tente novamente mais tarde." };
  if (result.status === "unknown") return { tone: "neutral", title: null, text: "Preço de referência indisponível; confira o valor da cotação." };
  const pct = formatNumber(Math.abs(result.deviationPct), 2);
  const when = reference?.updatedAt ? `, ${brasiliaTime.format(new Date(reference.updatedAt))}` : "";
  const side = direction === "SELL" ? "abaixo" : "acima";
  const title = direction === "SELL" ? "Preço abaixo do esperado" : "Preço acima do esperado";
  return { tone: "warning", title, text: `O preço desta cotação está ${pct}% ${side} do preço de referência (CoinGecko${when}). Compare antes de confirmar ou tente mais tarde.` };
}
