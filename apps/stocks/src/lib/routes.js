// Hash routes: deep links and the back button work without a Netlify SPA rewrite.
//   #/                          Landing (anonymous) / Home (signed in)
//   #/explorar?c=<id>&q=<text>  Explore, optionally one collection and a search
//   #/acao/<SYMBOL>             Stock detail; an unknown symbol opens Explore with a note
//   #/historico                 History (signed in)
// Flows (buy, sell, sign-in, code, KYC) are modals over the current screen and are not routed.
import { COLLECTIONS, findStock } from "./stocks.js";

const MAX_QUERY = 60;

/** @typedef {{name:"home"}|{name:"explore", collection:string|null, query:string, notFound?:string}|{name:"stock", symbol:string}|{name:"history"}} Route */

/** "#/acao/nvda" -> {name:"stock", symbol:"NVDA"}; anything unknown -> home. @returns {Route} */
export function parseHash(hash) {
  const raw = String(hash || "").replace(/^#/, "") || "/";
  const [pathPart, queryPart = ""] = raw.split("?");
  const path = pathPart.replace(/\/+$/, "") || "/";
  if (path === "/explorar") {
    const params = new URLSearchParams(queryPart);
    const collection = params.get("c");
    return {
      name: "explore",
      collection: COLLECTIONS.some((item) => item.id === collection) ? collection : null,
      query: String(params.get("q") || "").slice(0, MAX_QUERY),
    };
  }
  const stock = /^\/acao\/([^/]+)$/.exec(path);
  if (stock) {
    let symbol = stock[1];
    try { symbol = decodeURIComponent(symbol); } catch { /* keep the raw text */ }
    const token = findStock(symbol);
    if (token) return { name: "stock", symbol: token.symbol };
    return { name: "explore", collection: null, query: "", notFound: symbol.replace(/[^\w.-]/g, "").slice(0, 12).toUpperCase() };
  }
  if (path === "/historico") return { name: "history" };
  return { name: "home" };
}

export const homeHash = () => "#/";
export const historyHash = () => "#/historico";
export const stockHash = (symbol) => `#/acao/${encodeURIComponent(symbol)}`;

/** exploreHash({collection:"big-techs", query:"nvdc"}) -> "#/explorar?c=big-techs&q=nvdc" */
export function exploreHash({ collection = null, query = "" } = {}) {
  const params = new URLSearchParams();
  if (collection) params.set("c", collection);
  if (query.trim()) params.set("q", query.trim().slice(0, MAX_QUERY));
  const text = params.toString();
  return text ? `#/explorar?${text}` : "#/explorar";
}

/** Canonical hash of a route (used to compare and to restore after sign-in). */
export function hashFor(route) {
  if (route.name === "explore") return exploreHash(route);
  if (route.name === "stock") return stockHash(route.symbol);
  if (route.name === "history") return historyHash();
  return homeHash();
}
