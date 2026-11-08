// The detail screen's buy/sell buttons and the line under them (the availability states), as a
// pure function so every state is unit-tested: signed out ("Comprar" asks to sign in, "Em breve"
// while the ramp is off), wallet not ready, an unfinished operation (resume it), availability still
// loading, not listed / paused by the issuer, and "Vender" only with a balance.
import { UNAVAILABLE_COPY_PT, isComingSoon } from "./ramp-contract.js";
import { MIN_BUY } from "./purchase-options.js";

/**
 * @param {{ auth:{authenticated:boolean, address:string|null}, availability:Record<string,{buy:boolean, sell:boolean, reason:string|null}>|null,
 *   comingSoon:boolean, holding:{raw:bigint}|null, symbol:string, pending?:{rampType:string, symbol?:string}|null,
 *   balanceStatus?:"ok"|"loading"|"rpc_error"|"idle" }} args
 *   pending: the wallet's unfinished operation on this device (activeRampStore.get)
 *   balanceStatus: usePortfolio's status; only "ok" lets a missing holding mean "no tokens"
 * @returns {{ buy:{label:string, disabled:boolean, loading?:boolean}, sell:{label:string, disabled:boolean}|null, note:string|null }}
 */
export function detailActions({ auth, availability, comingSoon, holding, symbol, pending = null, balanceStatus = "ok" }) {
  const entry = availability?.[symbol] ?? null;
  const owns = Boolean(holding && holding.raw > 0n);
  if (!auth.authenticated) {
    if (comingSoon) return { buy: { label: "Em breve", disabled: true }, sell: null, note: "A compra com Pix será liberada em breve. Enquanto isso, acompanhe o preço." };
    return { buy: { label: "Comprar", disabled: false }, sell: null, note: "Entre com Vortex para comprar. É o mesmo acesso do ouro." };
  }
  if (!auth.address) return { buy: { label: "Preparando sua carteira…", disabled: true }, sell: { label: "Vender", disabled: true }, note: "Sua carteira está sendo preparada." };
  if (pending) {
    const what = `${pending.rampType === "SELL" ? "uma venda" : "uma compra"}${pending.symbol ? ` de ${pending.symbol}` : ""}`;
    return { buy: { label: "Ver operação em andamento", disabled: false }, sell: null, note: `Você tem ${what} em andamento. Conclua-a antes de começar outra.` };
  }
  if (!entry) return { buy: { label: "Comprar", disabled: true, loading: true }, sell: { label: "Vender", disabled: true }, note: null };
  const buy = entry.buy ? { label: "Comprar", disabled: false } : { label: UNAVAILABLE_COPY_PT[entry.reason] || "Indisponível no momento", disabled: true };
  const sell = entry.sell && owns ? { label: "Vender", disabled: false } : { label: "Vender", disabled: true };
  let note = null;
  if (isComingSoon(entry.reason)) note = "A compra com Pix será liberada em breve. Enquanto isso, acompanhe o preço.";
  else if (entry.reason === "paused") note = "O emissor pausou a negociação deste token (por exemplo, num evento corporativo). Tente mais tarde.";
  else if (owns && !entry.sell) note = "A venda está indisponível no momento. Seus tokens continuam na sua carteira.";
  else if (!owns && balanceStatus === "rpc_error") note = "Saldo indisponível agora. Tente novamente em instantes.";
  else if (!owns && entry.sell && balanceStatus === "ok") note = `Você ainda não tem tokens ${symbol}. Compre a partir de R$ ${MIN_BUY} com Pix.`;
  return { buy, sell, note };
}


/**
 * What a buy or sell request opens: while the wallet has an unfinished operation on this device,
 * every request resumes that one (as Gold does), never a second one that would overwrite its
 * recovery record. The adapters refuse such a registration too (assertNoOtherActiveRamp).
 * @param {{type:"buy"|"sell", symbol:string}} request
 * @param {{rampType:string, symbol?:string}|null} pending activeRampStore.get(wallet)
 * @returns {{type:"buy"|"sell", symbol:string, resume:object|null}}
 */
export function flowFor(request, pending) {
  if (!pending) return { type: request.type, symbol: request.symbol, resume: null };
  if (pending.paymentMethod === "usdc") return { type: "usdc", symbol: pending.symbol || request.symbol, resume: pending };
  return { type: pending.rampType === "SELL" ? "sell" : "buy", symbol: pending.symbol || request.symbol, resume: pending };
}
