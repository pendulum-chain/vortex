// History screen rows (spec S10). The device-local history (last 12 finished ramps per wallet) is
// always shown; with a Vortex session in this tab the server history (GET /v1/ramp/history) is
// merged in by id, filtered to the Stocks network. Pure functions, so both paths are tested.
import { classifyRamp } from "@vortexfi/consumer-kit";
import { resolveSymbol } from "./ramp-contract.js";

/** @typedef {{ id:string, direction:"BUY"|"SELL", symbol:string|null, brlAmount:number|null, tokenAmount:string|null,
 *   date:number|null, status:"success"|"failure"|"processing", simulated:boolean, explorerLink:string|null }} HistoryRow */

const numberOrNull = (value) => (value === "" || value == null || !Number.isFinite(Number(value)) ? null : Number(value));
const decimalOrNull = (value) => (/^\d+(?:\.\d+)?$/.test(String(value ?? "")) ? String(value) : null);

export const ownedHistoryRows = (snapshot, owner) => snapshot?.owner === owner && Array.isArray(snapshot.rows) ? snapshot.rows : [];

/** activeRampStore.history(wallet) entries -> rows (they are finished and successful by construction). */
export function localHistoryRows(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item.rampId || ""),
    direction: item.rampType === "SELL" ? "SELL" : "BUY",
    symbol: item.symbol || null,
    brlAmount: numberOrNull(item.brlAmount),
    ...(item.paymentMethod === "usdc" ? { usdcAmount: decimalOrNull(item.usdcAmount), paymentMethod: "usdc" } : {}),
    tokenAmount: decimalOrNull(item.tokenAmount),
    date: numberOrNull(item.completedAt),
    status: "success",
    simulated: item.simulated === true,
    explorerLink: item.explorerLink || null,
  })).filter((row) => row.id);
}

/**
 * /v1/ramp/history response -> rows for this network only (Gold's PAXG ramps are left out).
 * Shape: {transactions:[{id,type,from,to,fromAmount,toAmount,fromCurrency,toCurrency,status,currentPhase,date,externalTxExplorerLink?}]}
 */
export function serverHistoryRows(response, network) {
  const list = Array.isArray(response?.transactions) ? response.transactions : [];
  return list.filter((item) => item && (item.from === network || item.to === network)).map((item) => {
    const buy = String(item.type).toUpperCase() !== "SELL";
    const classification = classifyRamp({ status: item.status, currentPhase: item.currentPhase, createdAt: item.date });
    return {
      id: String(item.id || ""),
      direction: buy ? "BUY" : "SELL",
      symbol: resolveSymbol(buy ? item.toCurrency : item.fromCurrency),
      brlAmount: numberOrNull(buy ? item.fromAmount : item.toAmount),
      tokenAmount: decimalOrNull(buy ? item.toAmount : item.fromAmount),
      date: Number.isFinite(Date.parse(item.date)) ? Date.parse(item.date) : null,
      status: classification === "success" || classification === "failure" ? classification : "processing",
      simulated: false,
      explorerLink: item.externalTxExplorerLink || null,
    };
  }).filter((row) => row.id);
}

/**
 * Merged by id, newest first: the server wins (it knows the final status) except where it has no
 * value, so a local symbol or explorer link is never replaced by a server null.
 */
export function mergeHistory(local = [], server = []) {
  const byId = new Map(local.map((row) => [row.id, row]));
  for (const row of server) {
    const known = Object.fromEntries(Object.entries(row).filter(([, value]) => value != null));
    byId.set(row.id, { ...row, ...byId.get(row.id), ...known });
  }
  return [...byId.values()].sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
}
