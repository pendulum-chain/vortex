import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { importJsx } from "./jsx-module.mjs";
import { simulatedProviderCosts } from "../src/lib/fee-model.js";
const { FeeSummary, ReserveBalance } = await importJsx(new URL("../src/components/FeeSummary.jsx", import.meta.url));
const { QuoteCosts, LiveUsdcCosts, UsdcQuoteCosts } = await importJsx(new URL("../src/components/QuoteCosts.jsx", import.meta.url));
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const marker = css.indexOf("/* Shared cost presentation:");
assert.ok(marker >= 0);
const rows = () => simulatedProviderCosts(1000).map(row => ({ id: row.id, amount: row.amountFiat, includedIn: "fees" }));
const text = element => element.textContent.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

async function harness(run) {
  const previous = [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT];
  const dom = new JSDOM(`<style>${css.slice(marker)}</style><div id="root"></div>`, { url: "http://localhost/" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root"));
  try { await run(element => act(async () => root.render(element))); }
  finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, value] of [["window", previous[0]], ["document", previous[1]], ["IS_REACT_ACT_ENVIRONMENT", previous[2]]]) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
}

for (const locale of ["pt-BR", "en"]) {
  test(`${locale}: the fee-total row itself expands/collapses and shows each cost once`, () => harness(async render => {
    await render(createElement(Fragment, null,
      createElement(FeeSummary, { rows: rows(), total: 6.71, reserve: 0.71, basis: 1000, locale }),
      createElement(ReserveBalance, { amount: 0.71, locale })));
    const details = document.querySelector("details"), summary = details.querySelector("summary");
    assert.equal(details.open, false);
    assert.match(text(summary), locale === "en" ? /Purchase fees.*R\$6.00.*0.60%/ : /Taxas da compra.*R\$ 6,00.*0,60%/);
    assert.equal(window.getComputedStyle(summary.querySelector(".fee-summary__hide")).display, "none");
    assert.notEqual(window.getComputedStyle(summary.querySelector(".fee-summary__show")).display, "none");
    await act(async () => summary.click());
    assert.equal(details.open, true);
    assert.equal(window.getComputedStyle(summary.querySelector(".fee-summary__show")).display, "none");
    assert.notEqual(window.getComputedStyle(summary.querySelector(".fee-summary__hide")).display, "none");
    assert.equal(document.querySelectorAll("[data-fee-group]").length, 3);
    for (const id of ["ramp", "conversion", "bridge", "swap", "network", "vortex", "reserve"]) {
      assert.equal(document.querySelectorAll(`[data-cost-id="${id}"]`).length, 1, id);
    }
    assert.equal(details.querySelector('[data-cost-id="reserve"]'), null);
    assert.match(text(document.querySelector('[data-cost-id="bridge"] dt')), locale === "en" ? /^Transfer between networks Relay/ : /^Transferência entre redes Relay/);
    assert.match(text(document.querySelector('[data-cost-id="swap"] dt')), locale === "en" ? /^Token purchase Uniswap/ : /^Compra do token Uniswap/);
    assert.doesNotMatch(text(details), /\bbps\b/);
    await act(async () => summary.click()); assert.equal(details.open, false);
  }));

  test(`${locale}: USDC has appropriate categories, localized money and no Pix/Nabla fee`, () => harness(async render => {
    await render(createElement(FeeSummary, { rows: rows().filter(r => !["ramp", "conversion"].includes(r.id)), total: 4.1, reserve: 0.1, basis: 1000, currency: "USDC", method: "usdc", locale }));
    const summary = document.querySelector("summary");
    assert.match(text(summary), locale === "en" ? /4.00 USDC.*0.40%/ : /4,00 USDC.*0,40%/);
    assert.doesNotMatch(document.body.textContent, /Pix|Nabla|BRL|R\$/);
    assert.match(text(document.body), locale === "en" ? /Token purchase.*Network transfer and delivery.*Vortex service/ : /Compra do token.*Transferência e entrega.*Serviço Vortex/);
  }));

  test(`${locale}: missing provider detail is unknown, not a fabricated zero or complete cost`, () => harness(async render => {
    await render(createElement(FeeSummary, { rows: rows().filter(r => r.id !== "bridge"), total: 6, basis: 1000, locale }));
    assert.match(text(document.querySelector("summary")), locale === "en" ? /Reported fees/ : /Taxas informadas/);
    assert.equal(text(document.querySelector('[data-cost-id="bridge"] dd')), locale === "en" ? "Not itemized" : "Não discriminado");
    assert.match(text(document.querySelector('[role="note"]')), locale === "en" ? /Partial breakdown.*do not mean zero/ : /Detalhamento parcial.*não significam custo zero/);
  }));

  test(`${locale}: signed price effects and already-applied discounts keep the correct net total`, () => harness(async render => {
    const costs = rows(); costs.find(r => r.id === "conversion").includedIn = "rate"; costs.find(r => r.id === "conversion").amount = -0.5;
    await render(createElement(FeeSummary, { rows: costs, total: 5, basis: 1000, locale, subsidy: { amountFiat: "2.00" } }));
    assert.match(text(document.querySelector("summary")), locale === "en" ? /Purchase costs.*R\$4.50/ : /Custos da compra, já incluídos.*R\$ 4,50/);
    assert.match(text(document.querySelector('[data-cost-id="conversion"]')), locale === "en" ? /already reflected in the price/ : /já refletido no preço/);
    assert.match(text(document.querySelector('[data-cost-id="subsidy"]')), locale === "en" ? /not subtracted.*again/ : /Não é descontado novamente/);
  }));
}

test("retained balance is omitted when no reserve was quoted", () => harness(async render => {
  await render(createElement(ReserveBalance, { amount: 0 })); assert.equal(document.querySelector(".reserve-balance"), null);
  await render(createElement(ReserveBalance, {})); assert.equal(document.querySelector(".reserve-balance"), null);
}));

test("real Pix quote wrapper uses gross sell proceeds as the percentage basis and does not mutate the quote", () => harness(async render => {
  const quote = { direction: "SELL", brlAmount: 94, fees: { total: 6 }, rawQuote: { totalFeeFiat: 6, providerCosts: simulatedProviderCosts(1000) } };
  const original = structuredClone(quote);
  await render(createElement(QuoteCosts, { quote }));
  assert.match(text(document.querySelector("summary")), /Taxas da venda, já descontadas.*6,00%/);
  assert.match(text(document.body), /Venda do token.*Robinhood Chain → Base/);
  assert.deepEqual(quote, original);
}));

test("real USDC wrapper is complete without unused Pix providers and keeps reserve in USDC units", () => harness(async render => {
  const costs = simulatedProviderCosts(1000).filter(r => !["ramp", "conversion"].includes(r.id));
  const quote = { direction: "BUY", usdcAmount: 1000, fees: { total: 4.1 }, gasReserve: { brl: 0.1 }, rawQuote: { totalFeeFiat: 4.1, providerCosts: costs } };
  await render(createElement(Fragment, null, createElement(LiveUsdcCosts, { quote, locale: "pt-BR" }), createElement(ReserveBalance, { amount: quote.gasReserve.brl, currency: "USDC", locale: "pt-BR" })));
  assert.match(text(document.querySelector("summary")), /Taxas da compra.*4,00 USDC/);
  assert.doesNotMatch(text(document.body), /Detalhamento parcial|R\$|Nabla|Pix/);
  assert.match(text(document.querySelector(".reserve-balance")), /0,10 USDC/);
}));

for (const locale of ["en", "pt-BR"]) test(`${locale}: simulated USDC quote wrapper separates retained ETH from costs`, () => harness(async render => {
  const quote = { direction: "BUY", grossRaw: "1000000000", totalFeesRaw: "3200000", costs: [
    { id: "bridge", raw: "1000000" }, { id: "swap", raw: "1000000" }, { id: "vortex", raw: "1000000" }, { id: "network", raw: "100000" }, { id: "reserve", raw: "100000" },
  ] };
  await render(createElement(UsdcQuoteCosts, { quote, locale }));
  assert.match(text(document.querySelector("summary")), locale === "en" ? /Purchase fees.*3.10 USDC/ : /Taxas da compra.*3,10 USDC/);
  assert.match(text(document.body), locale === "en" ? /Illustrative amounts/ : /Valores ilustrativos/);
}));
