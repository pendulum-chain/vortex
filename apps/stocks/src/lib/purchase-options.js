// Buy/sell amount rules. MIN_BUY is R$100: fees are partly fixed, so they weigh more on small buys.
import { tokensToWei } from "./token.js";

export const MIN_BUY = 100;
export const QUICK_BUY_VALUES = Object.freeze([100, 500, 1000]);
export const DEFAULT_BUY = MIN_BUY;
// Below this the amount step shows "as taxas pesam mais em compras pequenas".
export const SMALL_BUY_NOTE_BELOW = 250;
// A quote that expires within this window is re-quoted before "Gerar Pix" / the sell confirmation.
export const QUOTE_REFRESH_BEFORE_MS = 15_000;

/** Whole reais only, at least MIN_BUY. */
export function validBuyAmount(value) {
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return false;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= MIN_BUY;
}

export const showSmallBuyNote = (value) => validBuyAmount(value) && Number(value) < SMALL_BUY_NOTE_BELOW;

/** Fee share of the amount from the quote itself (never a hard-coded example). */
export function buyFeePercent(quote, amount) {
  const fees = quote?.fees?.total ?? quote?.totalFee ?? (Number(quote?.fees?.network ?? quote?.networkFee) + Number(quote?.fees?.service ?? quote?.serviceFee));
  return Number(amount) > 0 && Number.isFinite(Number(fees)) ? (Number(fees) / Number(amount)) * 100 : null;
}

export const quoteNeedsRefresh = (quote, now = Date.now()) => !(Number(quote?.expiresAt) - now >= QUOTE_REFRESH_BEFORE_MS);

/** A sell amount is valid when it parses (comma or dot, at most 18 dp), is positive and fits the raw balance. */
export function validSellAmount(input, rawBalance) {
  try {
    const wei = tokensToWei(input);
    return wei > 0n && wei <= BigInt(rawBalance ?? 0n);
  } catch { return false; }
}

/**
 * Where a flow goes after the e-mail code (any 401 sends it to the code step, also after a ramp was
 * registered). A registered operation always continues: "sign" (a sell's wallet confirmations) or
 * "existing" (reload it: Pix, processing or the result). Only a flow without one gets a new quote
 * ("prepare"), which could otherwise register a second ramp next to a paid or half-signed one.
 * @param {{direction:"BUY"|"SELL", rampId?:string|null, resuming?:boolean}} flow
 * @returns {"prepare"|"existing"|"sign"}
 */
export function stepAfterCode({ direction, rampId = null, resuming = false }) {
  if (rampId) return direction === "SELL" ? "sign" : "existing";
  return resuming ? "existing" : "prepare";
}
