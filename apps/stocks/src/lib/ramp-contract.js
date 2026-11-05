// The parts of the ramp adapter contract that both implementations need. They live
// here, re-exported by ramp-adapter.js, so ramp-adapter.js can import both adapters without an
// import cycle. The UI imports from ramp-adapter.js.
import { classifyRamp, explorerUrl, rampStartDeadline, robinhoodChain } from "@vortexfi/consumer-kit";
import { findStock, findStockByAddress } from "./stocks.js";

/** @typedef {"not_enabled"|"network_not_supported"|"token_not_listed"|"address_mismatch"|"paused"|"error"} UnavailableReason */
/** @typedef {Record<string, {buy:boolean, sell:boolean, reason:UnavailableReason|null}>} AvailabilityMap  (keyed by symbol) */
/** @typedef {{ id:string, direction:"BUY"|"SELL", symbol:string, tokenAddress:`0x${string}`,
 *   brlAmount:number,          // BUY: BRL paid; SELL: BRL received (net)
 *   tokenAmount:string,        // decimal token units (18 dp max) — BUY: received; SELL: sold
 *   tokenAmountWei:string,     // bigint as string
 *   fees:{network:number, service:number, total:number, currency:"BRL"},
 *                              // total = reported fees incl. gas reserve; may exclude rate-embedded price effects
 *                              // network excludes the reserve; rawQuote.providerCosts explains fee/rate inclusion
 *   impliedBrlPerToken:number, // price net of fees: BUY (brl-total)/tokens, SELL (brl+total)/tokens
 *   expiresAt:number,          // ms epoch
 *   gasless:boolean,           // SELL: true if Vortex uses permit (no ETH needed); false otherwise
 *   gasReserve:import("./gas-reserve.js").GasReserve|null, // BUY: ETH delivered with the tokens for later sells (its brl is inside fees.total)
 *   simulated:boolean,
 *   rawQuote:object }} StockQuote */
/** @typedef {{ id:string, direction:"BUY"|"SELL", symbol:string|null, status:string, currentPhase:string,
 *   classification:"awaiting_payment"|"processing"|"success"|"failure",
 *   brlAmount:string, tokenAmount:string, depositQrCode:string|null, simulatedPix:boolean,
 *   createdAt:string, startDeadline:number|null, explorerLink:string|null, unsignedTxs?:object[] }} StockRamp */

export const RAMP_ADAPTER_METHODS = Object.freeze(["getAvailability", "getReadiness", "quoteBuy", "quoteSell", "registerBuy",
  "registerSell", "resumeSell", "startRamp", "getRamp", "pollStatus"]);

export const UNAVAILABLE_REASONS = Object.freeze(["not_enabled", "network_not_supported", "token_not_listed", "address_mismatch", "paused", "error"]);

export const ERROR_CODES = Object.freeze(["STOCKS_RAMP_NOT_ENABLED", "NETWORK_NOT_SUPPORTED", "TOKEN_NOT_ALLOWED", "TOKEN_UNAVAILABLE",
  "WRONG_ROUTE", "INVALID_QUOTE", "INVALID_FEES", "AMOUNT_MISMATCH", "INSUFFICIENT_BALANCE", "WALLET_NOT_READY", "AUTH_REQUIRED",
  "RAMP_IN_PROGRESS", "INSUFFICIENT_GAS", "SELL_EXPIRED", "SELL_NOT_ENABLED", "MAINTENANCE_ACTIVE", "MAINTENANCE_STATUS_UNAVAILABLE"]);

const DEFAULT_MESSAGES = Object.freeze({
  STOCKS_RAMP_NOT_ENABLED: "A compra e a venda de Stock Tokens ainda não estão disponíveis pela Vortex.",
  NETWORK_NOT_SUPPORTED: "A Vortex ainda não oferece a rede Robinhood Chain.",
  TOKEN_NOT_ALLOWED: "Este token não está disponível aqui.",
  TOKEN_UNAVAILABLE: "Este token está indisponível no momento. Tente novamente mais tarde.",
  WRONG_ROUTE: "A cotação não corresponde à operação solicitada.",
  INVALID_QUOTE: "A cotação não está disponível. Tente novamente.",
  INVALID_FEES: "Não foi possível confirmar as taxas. Atualize a cotação.",
  AMOUNT_MISMATCH: "A cotação não corresponde ao valor informado. Atualize a cotação.",
  INSUFFICIENT_BALANCE: "Saldo de tokens insuficiente. Atualize o saldo ou escolha uma quantidade menor.",
  WALLET_NOT_READY: "Sua carteira ainda está sendo preparada. Aguarde alguns segundos.",
  AUTH_REQUIRED: "Confirme seu e-mail com o código antes de continuar.",
  RAMP_IN_PROGRESS: "Você já tem uma operação em andamento. Acompanhe-a no Início e conclua-a antes de começar outra.",
});

export class StocksRampError extends Error {
  /** @param {string} code one of ERROR_CODES */
  constructor(code, message = DEFAULT_MESSAGES[code], { status = 0, details = null, cause } = {}) {
    super(message || "A operação não pôde ser concluída.");
    this.name = "StocksRampError";
    this.code = code;
    this.status = status;
    this.details = details;
    if (cause !== undefined) this.cause = cause;
  }
}

// Today's live answers for an unknown network [P1]: the listing says "Invalid network: 'robinhood'…",
// a quote says "Unable to determine network from to destination".
export const NETWORK_UNKNOWN_PATTERN = /Invalid network|Unable to determine network/i;

export function isNetworkNotSupportedError(error) {
  return Number(error?.status) === 400 && NETWORK_UNKNOWN_PATTERN.test(String(error?.message || ""));
}

/**
 * Maps a Vortex/SDK error to the adapter's codes where the UI needs a distinct state: a 401 sends the
 * flow back to the e-mail code, an unknown network shows "em breve". Anything else keeps its own
 * (already pt-BR) message and status. (vortex-stocks.js also words the kit's INSUFFICIENT_NATIVE_GAS
 * as INSUFFICIENT_GAS; that copy stays out of this module, which the landing loads.)
 */
export function mapRampError(error) {
  if (error instanceof StocksRampError || error?.name === "AbortError") return error;
  if (Number(error?.status) === 401) return new StocksRampError("AUTH_REQUIRED", undefined, { status: 401, cause: error });
  if (isNetworkNotSupportedError(error)) return new StocksRampError("NETWORK_NOT_SUPPORTED", undefined, { status: 400, cause: error });
  return error;
}

/**
 * One operation at a time per device: the kit keeps ONE recovery record (and a new rampId resets its
 * transaction checkpoints), so registering a second ramp would orphan an unfinished one, e.g. a paid
 * Pix or a sell whose token transfer was already broadcast. Throws RAMP_IN_PROGRESS while the store
 * holds another ramp on this device, including another wallet's private record.
 */
export function assertNoOtherActiveRamp(activeRampStore, walletAddress, rampId = null) {
  const active = activeRampStore?.get(walletAddress);
  if (active && active.rampId !== rampId) throw new StocksRampError("RAMP_IN_PROGRESS", undefined, { details: { rampId: active.rampId } });
  if (activeRampStore?.hasActive?.() && !active) throw new StocksRampError("RAMP_IN_PROGRESS");
}

/** The two reasons the UI shows as "Em breve" (the ramp is not live for Robinhood Chain yet). */
export const isComingSoon = (reason) => reason === "not_enabled" || reason === "network_not_supported";

/**
 * Whether buying with Pix is open, for the landing, home and welcome copy: true (simulated, or the
 * live answer says so), false ("em breve": ramp off, or the API does not know the network) and null
 * while the live answer is not known yet, so neither "Comprar com Pix" nor "em breve" is promised.
 * @param {{rampKind:"vortex"|"simulated", rampEnabled:boolean}} config
 * @param {AvailabilityMap|null} map
 * @returns {boolean|null}
 */
export function rampOpenState({ rampKind, rampEnabled }, map) {
  if (rampKind === "simulated") return true;
  if (!rampEnabled) return false;
  if (!map) return null;
  return !Object.values(map).every((entry) => isComingSoon(entry.reason));
}

export const UNAVAILABLE_COPY_PT = Object.freeze({
  not_enabled: "Em breve",
  network_not_supported: "Em breve",
  token_not_listed: "Indisponível no momento",
  address_mismatch: "Indisponível no momento",
  paused: "Negociação pausada pelo emissor",
  error: "Indisponível no momento",
});

/** Same answer for every symbol (gated adapter, unknown network, failed listing). */
export function uniformAvailability(tokens, reason) {
  return Object.freeze(Object.fromEntries(tokens.map((token) => [token.symbol, Object.freeze({ buy: false, sell: false, reason })])));
}

/**
 * The issuer can pause a token (corporate actions): paused || oraclePaused from the chain read
 * overrides whatever the ramp reports. flags: {[symbol]: {paused:boolean|null}} (portfolio.js).
 */
export function withIssuerPauses(availability, flags = {}) {
  const next = { ...availability };
  for (const [symbol, flag] of Object.entries(flags)) {
    if (flag?.paused === true && next[symbol]) next[symbol] = Object.freeze({ buy: false, sell: false, reason: "paused" });
  }
  return Object.freeze(next);
}

/**
 * Before money moves, the issuer pause is decided by a FRESH chain read, never by the last portfolio
 * poll, and it fails closed: flag = tokenFlags(read)[symbol] ({paused:true|false|null}, portfolio.js).
 * @returns {null|"paused"|"error"} null = tradable; "error" = the read could not tell (no read, or both
 *   paused() or oraclePaused() failed)
 */
export function freshPauseReason(flag) {
  if (flag?.paused === false) return null;
  return flag?.paused === true ? "paused" : "error";
}

/** A token id in a ramp (contract address or symbol) -> launch token symbol, else null. */
export function resolveSymbol(currency) {
  if (!currency) return null;
  const value = String(currency);
  return (/^0x[0-9a-fA-F]{40}$/.test(value) ? findStockByAddress(value) : findStock(value))?.symbol ?? null;
}

/**
 * RampProcess / GetRampStatusResponse (or a simulated record of the same shape) -> StockRamp.
 * A simulated Pix ramp has no QR code, so "initial" is still "awaiting_payment" for it.
 */
export function toStockRamp(raw, { symbolHint = null, now = Date.now() } = {}) {
  const direction = String(raw?.type || raw?.rampType || (raw?.from === "pix" ? "BUY" : "SELL")).toUpperCase() === "SELL" ? "SELL" : "BUY";
  const buy = direction === "BUY";
  const currentPhase = String(raw?.currentPhase || "initial");
  let classification = classifyRamp(raw, now);
  if (raw?.simulatedPix === true && buy && currentPhase === "initial" && classification === "processing") classification = "awaiting_payment";
  const hash = raw?.transactionHash;
  const explorerLink = raw?.transactionExplorerLink || (buy && /^0x[0-9a-fA-F]{64}$/.test(hash || "") ? explorerUrl(robinhoodChain, "tx", hash) : null);
  return {
    id: String(raw?.id || ""),
    direction,
    symbol: resolveSymbol(buy ? raw?.outputCurrency : raw?.inputCurrency) ?? symbolHint,
    status: String(raw?.status || ""),
    currentPhase,
    classification,
    brlAmount: String((buy ? raw?.inputAmount : raw?.outputAmount) ?? ""),
    tokenAmount: String((buy ? raw?.outputAmount : raw?.inputAmount) ?? ""),
    depositQrCode: raw?.depositQrCode || null,
    simulatedPix: raw?.simulatedPix === true,
    createdAt: String(raw?.createdAt || ""),
    startDeadline: rampStartDeadline(raw),
    explorerLink,
    ...(Array.isArray(raw?.unsignedTxs) ? { unsignedTxs: raw.unsignedTxs } : {}),
  };
}

/**
 * Terminal ramps leave the device's recovery state, as in Gold: success -> history + clear,
 * failure -> clear (the issue screen keeps the operation code). Idempotent: clear() only removes
 * the matching ramp and history is keyed by rampId. A failed history write never hides a result.
 */
export function settleRamp(activeRampStore, ramp, { walletAddress, simulated = false } = {}) {
  if (!activeRampStore || !["success", "failure"].includes(ramp?.classification)) return;
  // A timeout/abandonment is not proof that an unacknowledged wallet send never happened.
  const active = activeRampStore.get(walletAddress);
  if (ramp.classification === "failure" && active?.rampId === ramp.id && Object.values(active.transactions ?? {}).some(Boolean)) return;
  if (ramp.classification === "success" && walletAddress) {
    try {
      activeRampStore.addHistory({ rampId: ramp.id, walletAddress: walletAddress.toLowerCase(), rampType: ramp.direction, symbol: ramp.symbol, brlAmount: ramp.brlAmount, tokenAmount: ramp.tokenAmount, explorerLink: ramp.explorerLink, ...(simulated ? { simulated: true } : {}) });
    } catch { /* history is a convenience; the ramp itself is final */ }
  }
  activeRampStore.clear(ramp.id);
}

/** Every method of the contract is present (both adapters are tested against this). */
export function assertAdapterShape(adapter) {
  for (const method of RAMP_ADAPTER_METHODS) if (typeof adapter?.[method] !== "function") throw new Error(`Ramp adapter is missing ${method}().`);
  return adapter;
}
