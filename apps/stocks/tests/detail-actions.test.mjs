import assert from "node:assert/strict";
import test from "node:test";
import { detailActions, flowFor } from "../src/lib/detail-actions.js";
import { uniformAvailability } from "../src/lib/ramp-contract.js";
import { STOCK_TOKENS } from "../src/lib/stocks.js";

const signedIn = { authenticated: true, address: "0x71c20000000000000000000000000000000093a4" };
const anonymous = { authenticated: false, address: null };
const open = Object.fromEntries(STOCK_TOKENS.map((token) => [token.symbol, { buy: true, sell: true, reason: null }]));
const holding = { raw: 10n ** 18n };

test("signed out: buy asks to sign in; with the ramp off it says 'Em breve' and offers nothing", () => {
  const ready = detailActions({ auth: anonymous, availability: open, comingSoon: false, holding: null, symbol: "NVDA" });
  assert.deepEqual(ready.buy, { label: "Comprar", disabled: false });
  assert.equal(ready.sell, null);
  const soon = detailActions({ auth: anonymous, availability: uniformAvailability(STOCK_TOKENS, "not_enabled"), comingSoon: true, holding: null, symbol: "NVDA" });
  assert.deepEqual(soon.buy, { label: "Em breve", disabled: true });
  assert.match(soon.note, /em breve/);
});

test("signed in: wallet not ready, availability loading, open, and sell only with a balance", () => {
  assert.equal(detailActions({ auth: { authenticated: true, address: null }, availability: open, comingSoon: false, holding, symbol: "NVDA" }).buy.label, "Preparando sua carteira…");
  const loading = detailActions({ auth: signedIn, availability: null, comingSoon: false, holding, symbol: "NVDA" });
  assert.equal(loading.buy.disabled, true);
  assert.equal(loading.buy.loading, true);
  const owner = detailActions({ auth: signedIn, availability: open, comingSoon: false, holding, symbol: "NVDA" });
  assert.deepEqual([owner.buy.disabled, owner.sell.disabled, owner.note], [false, false, null]);
  const empty = detailActions({ auth: signedIn, availability: open, comingSoon: false, holding: null, symbol: "NVDA" });
  assert.equal(empty.sell.disabled, true);
  assert.match(empty.note, /ainda não tem tokens NVDA/);
});

test("signed in with the balance unknown: never \"no tokens\", and a failed read says so", () => {
  const loading = detailActions({ auth: signedIn, availability: open, comingSoon: false, holding: null, symbol: "NVDA", balanceStatus: "loading" });
  assert.deepEqual([loading.sell.disabled, loading.note], [true, null]);
  const failed = detailActions({ auth: signedIn, availability: open, comingSoon: false, holding: null, symbol: "NVDA", balanceStatus: "rpc_error" });
  assert.equal(failed.note, "Saldo indisponível agora. Tente novamente em instantes.");
  const known = detailActions({ auth: signedIn, availability: open, comingSoon: false, holding, symbol: "NVDA", balanceStatus: "rpc_error" });
  assert.deepEqual([known.sell.disabled, known.note], [false, null], "a holding from the last good read still sells");
});

test("signed in: 'em breve', issuer pause and an unlisted token disable the buttons with the reason", () => {
  const soon = detailActions({ auth: signedIn, availability: uniformAvailability(STOCK_TOKENS, "network_not_supported"), comingSoon: true, holding, symbol: "SPY" });
  assert.deepEqual([soon.buy.label, soon.buy.disabled, soon.sell.disabled], ["Em breve", true, true]);
  const paused = detailActions({ auth: signedIn, availability: { ...open, META: { buy: false, sell: false, reason: "paused" } }, comingSoon: false, holding, symbol: "META" });
  assert.equal(paused.buy.label, "Negociação pausada pelo emissor");
  assert.match(paused.note, /pausou/);
  const unlisted = detailActions({ auth: signedIn, availability: { ...open, SGOV: { buy: false, sell: false, reason: "token_not_listed" } }, comingSoon: false, holding: null, symbol: "SGOV" });
  assert.deepEqual([unlisted.buy.label, unlisted.buy.disabled], ["Indisponível no momento", true]);
});

test("a holder whose sell direction is off is told why \"Vender\" is disabled", () => {
  const buyOnly = detailActions({ auth: signedIn, availability: { ...open, NVDA: { buy: true, sell: false, reason: null } }, comingSoon: false, holding, symbol: "NVDA" });
  assert.deepEqual([buyOnly.buy.disabled, buyOnly.sell.disabled], [false, true]);
  assert.equal(buyOnly.note, "A venda está indisponível no momento. Seus tokens continuam na sua carteira.");
});

test("signed in with an unfinished operation: one button that resumes it, no second operation", () => {
  const pending = { rampId: "ramp-1", rampType: "SELL", symbol: "NVDA", stage: "signing" };
  const actions = detailActions({ auth: signedIn, availability: open, comingSoon: false, holding, symbol: "TSLA", pending });
  assert.deepEqual(actions.buy, { label: "Ver operação em andamento", disabled: false });
  assert.equal(actions.sell, null);
  assert.match(actions.note, /uma venda de NVDA em andamento/);
  const loading = detailActions({ auth: signedIn, availability: null, comingSoon: true, holding: null, symbol: "TSLA", pending: { rampId: "r", rampType: "BUY", symbol: "SPY" } });
  assert.equal(loading.buy.disabled, false, "resuming works while availability loads or the ramp is off");
  assert.match(loading.note, /uma compra de SPY/);
  const now = Date.parse("2026-11-08T12:00:00Z");
  const old = detailActions({ auth: signedIn, availability: open, comingSoon: false, holding, symbol: "TSLA", pending: { ...pending, createdAt: now - 61 * 60_000 }, now });
  assert.doesNotMatch(old.note, /Conclua-a/, "past an hour it may be held for an operator");
  assert.match(old.note, /há mais de uma hora/);
  assert.match(detailActions({ auth: signedIn, availability: open, comingSoon: false, holding, symbol: "TSLA", pending: { ...pending, createdAt: now - 5 * 60_000 }, now }).note, /Conclua-a/);
});

test("a buy or sell request resumes the pending operation instead of starting a second one (Gold)", () => {
  assert.deepEqual(flowFor({ type: "buy", symbol: "TSLA" }, null), { type: "buy", symbol: "TSLA", resume: null });
  const sell = { rampId: "sell-earlier", rampType: "SELL", symbol: "NVDA", stage: "signing" };
  assert.deepEqual(flowFor({ type: "buy", symbol: "TSLA" }, sell), { type: "sell", symbol: "NVDA", resume: sell });
  const buy = { rampId: "buy-earlier", rampType: "BUY", symbol: "SPY", stage: "registered" };
  assert.deepEqual(flowFor({ type: "sell", symbol: "NVDA" }, buy), { type: "buy", symbol: "SPY", resume: buy });
  assert.equal(flowFor({ type: "buy", symbol: "TSLA" }, { rampId: "x", rampType: "BUY" }).symbol, "TSLA", "a record without a symbol keeps the requested one");
});
