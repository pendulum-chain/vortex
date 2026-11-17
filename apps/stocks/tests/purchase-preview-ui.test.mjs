import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import { importJsx } from "./jsx-module.mjs";
const { PurchasePreview } = await importJsx(new URL("../src/components/PurchasePreview.jsx", import.meta.url));
const prices = { NVDA: { brl: 1000, usd: 200 } };

async function harness(run) {
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/pt-br/stocks/" });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById("root"));
  const render = props => act(async () => root.render(createElement(PurchasePreview, { prices, onContinue: () => {}, ...props })));
  const buttons = () => [...document.querySelectorAll("button")];
  const button = name => { const found = buttons().find(b => b.textContent.replace(/\s+/g, " ").trim() === name); assert.ok(found, `button ${name}`); return found; };
  const click = name => act(async () => button(name).click());
  try { await run({ render, button, click, text: () => document.body.textContent }); }
  finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, value] of [["window", previous.window], ["document", previous.document], ["IS_REACT_ACT_ENVIRONMENT", previous.act]]) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
}

test("anonymous Pix preview needs no sign-in and hands off only the selected amount after review", () => harness(async s => {
  const calls = [];
  await s.render({ onContinue: selection => calls.push(selection) });
  await s.click("R$ 100");
  assert.equal(document.querySelector("input").value, "100");
  await s.click("Ver custos da compra");
  assert.match(s.text(), /Sua estimativa/);
  assert.match(document.querySelector(".fee-summary > summary").textContent.replace(/\u00a0/g, " "), /R\$ 2,40/);
  assert.match(document.querySelector(".reserve-balance").textContent.replace(/\u00a0/g, " "), /R\$ 0,71/);
  assert.match(document.querySelector(".fee-card .is-total").textContent.replace(/\u00a0/g, " "), /R\$ 96,89/);
  // R$ 100 paid \u2212 R$ 2,40 costs \u2212 R$ 0,71 kept as ETH = R$ 96,89 used: all three rows sit in the card, in that order.
  assert.deepEqual([...document.querySelector(".fee-card").children].map(child => child.className), ["breakdown", "fee-summary", "reserve-balance", "breakdown"]);
  assert.match(document.querySelector(".fee-card .reserve-balance").textContent, /Sai do valor pago/);
  assert.equal(calls.length, 0);
  await act(async () => document.querySelector(".fee-summary > summary").click());
  assert.equal(document.querySelector(".fee-summary").open, true);
  assert.equal(calls.length, 0, "expanding costs never starts the purchase");
  await act(async () => document.querySelector(".fee-summary > summary").click());
  assert.equal(document.querySelector("input").value, "100");
  await s.click("Continuar com Pix");
  assert.deepEqual(calls, [{ symbol: "NVDA", method: "pix", amount: "100", locale: "pt-BR" }]);
}));

test("changing payment method discards the old preview and uses the USDC minimum and amount", () => harness(async s => {
  const calls = [];
  await s.render({ onContinue: selection => calls.push(selection) });
  await s.click("Ver custos da compra");
  await s.click("USDC · na Base");
  assert.doesNotMatch(s.text(), /Sua estimativa/);
  assert.equal(document.querySelector("input").value, "100");
  await s.click("10 USDC");
  await s.click("Ver custos da compra");
  await s.click("Continuar com USDC");
  assert.deepEqual(calls, [{ symbol: "NVDA", method: "usdc", amount: "10", locale: "pt-BR" }]);
}));

test("a method that cannot continue in this build is not offered", () => harness(async s => {
  await s.render({ canContinue: selection => selection.method === "pix" });
  assert.equal(s.button("Pix · em reais").getAttribute("aria-pressed"), "true");
  assert.doesNotMatch(s.text(), /USDC/);
  await s.click("Ver custos da compra");
  assert.equal(s.button("Continuar com Pix").disabled, false);
}));

test("English exposes USDC only and an inactive live rail cannot continue from an estimate", () => harness(async s => {
  const calls = [];
  await s.render({ locale: "en", canContinue: () => false, onContinue: selection => calls.push(selection) });
  assert.doesNotMatch(s.text(), /Pix/);
  await s.click("See purchase costs");
  assert.match(s.text(), /Your estimate/);
  assert.match(s.text(), /Purchases are coming soon/);
  assert.equal(s.button("Continue with USDC").disabled, true);
  await s.click("Continue with USDC");
  assert.equal(calls.length, 0);
}));

test("a failed intent write keeps the estimate visible and reports the error", () => harness(async s => {
  await s.render({ onContinue: () => { throw new Error("Não foi possível guardar sua simulação."); } });
  await s.click("Ver custos da compra");
  await s.click("Continuar com Pix");
  assert.match(document.querySelector('[role="alert"]').textContent, /guardar/);
  assert.match(s.text(), /Sua estimativa/);
}));

test("a missing reference price cannot reuse a previously displayed estimate", () => harness(async s => {
  await s.render(); await s.click("Ver custos da compra");
  await s.render({ prices: {} });
  assert.equal(Boolean(document.querySelector(".preview-result")), false);
  assert.equal(s.button("Continuar com Pix").disabled, true);
  assert.match(s.text(), /preço de referência disponível/);
  assert.doesNotMatch(s.text(), /Compra em breve/);
}));

test("while the ramp's answer is unknown the preview promises neither buying nor \"em breve\"", () => harness(async s => {
  await s.render({ canContinue: () => null });
  await s.click("Ver custos da compra");
  assert.equal(s.button("Continuar com Pix").disabled, true);
  assert.doesNotMatch(s.text(), /Compra em breve/);
  await s.render({ canContinue: () => false });
  assert.equal(s.button("Continuar com Pix").disabled, true);
  assert.match(s.text(), /Compra em breve/);
}));


for (const locale of ["pt-BR", "en"]) {
  test(`${locale}: the USDC sending-wallet notice appears once, including expanded fees`, () => harness(async s => {
    await s.render({ locale });
    if (locale !== "en") await s.click("USDC · na Base");
    await s.click(locale === "en" ? "See purchase costs" : "Ver custos da compra");
    const warning = locale === "en" ? /Your sending wallet or exchange may charge separately/g : /A carteira ou corretora de origem pode cobrar à parte/g;
    assert.equal((s.text().match(warning) || []).length, 1);
    await act(async () => document.querySelector(".fee-summary > summary").click());
    assert.equal((s.text().match(warning) || []).length, 1);
  }));
}
