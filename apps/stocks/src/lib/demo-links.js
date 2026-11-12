// Demo builds only: deep links that open a sheet or a flow step, so a reviewer can share a link to
// one screen, e.g. #/acao/NVDA?demoFlow=buy-quote. App imports this module dynamically behind
// DEMO_TOOLS (src/lib/config.js), which Vite folds to false in preview and live builds, so neither
// this file nor its handling ships there (checked in tests/demo-links.test.mjs and the manifest).
//   login      the "Entrar com Vortex" sheet (signed out)
//   learn      "Como funciona?"
//   welcome    signs the demo user in and shows the welcome sheet
//   buy        signs in and opens the buy flow for the route's stock (NVDA elsewhere)
//   buy-quote  the same, with the demo code and KYC done, straight to the quote (confirm step)
//   sell       signs in and opens the sell flow (after the demo holdings load)
//   sell-reserve-used  the same, with the demo code and KYC done, the demo gas reserve spent down to
//              dust and the whole holding for sale: straight to the review that blocks the sale
import { stockHash } from "./routes.js";

export const DEMO_FLOWS = Object.freeze(["login", "learn", "welcome", "buy", "buy-quote", "sell", "sell-reserve-used"]);
const PARAM = "demoFlow";

const splitHash = (hash) => {
  const raw = String(hash || "").replace(/^#/, "");
  const at = raw.indexOf("?");
  return at < 0 ? [raw, ""] : [raw.slice(0, at), raw.slice(at + 1)];
};

/** "#/acao/NVDA?demoFlow=buy-quote" -> "buy-quote"; unknown values -> null. */
export function parseDemoFlow(hash) {
  const value = new URLSearchParams(splitHash(hash)[1]).get(PARAM);
  return DEMO_FLOWS.includes(value) ? value : null;
}

/** The same hash without the demoFlow parameter (other parameters are kept). */
export function withoutDemoFlow(hash) {
  const [path, query] = splitHash(hash);
  const params = new URLSearchParams(query);
  params.delete(PARAM);
  const rest = params.toString();
  return `#${path || "/"}${rest ? `?${rest}` : ""}`;
}

/**
 * What App should do for a demo flow.
 * @returns {null|{ signIn:boolean, route:string|null, modal:object, needsHoldings?:boolean }}
 */
export function planDemoFlow(flow, { signedIn, symbol }) {
  const stock = symbol || "NVDA";
  if (flow === "login") return signedIn ? null : { signIn: false, route: null, modal: { type: "login" } };
  if (flow === "learn") return { signIn: false, route: null, modal: { type: "learn" } };
  if (flow === "welcome") return { signIn: !signedIn, route: null, modal: { type: "welcome" } };
  if (flow === "buy" || flow === "buy-quote") return { signIn: !signedIn, route: stockHash(stock), modal: { type: "buy", symbol: stock, demoQuote: flow === "buy-quote" } };
  if (flow === "sell" || flow === "sell-reserve-used") {
    return { signIn: !signedIn, route: stockHash(stock), modal: { type: "sell", symbol: stock, ...(flow === "sell-reserve-used" ? { demoReserveUsed: true } : {}) }, needsHoldings: true };
  }
  return null;
}
