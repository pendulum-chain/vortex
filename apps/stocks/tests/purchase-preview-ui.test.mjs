import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { transformWithEsbuild } from "vite";

// Exercise the actual JSX with the app's existing Vite transformer; no browser or new runner.
const source = new URL("../src/components/PurchasePreview.jsx", import.meta.url);
const requireFromSource = createRequire(source);
const transformed = await transformWithEsbuild(await readFile(source, "utf8"), fileURLToPath(source), { jsx: "automatic" });
const code = transformed.code.replace(/from\s+["']([^"']+)["']/g, (_, specifier) => `from ${JSON.stringify(specifier.startsWith(".") ? new URL(specifier, source).href : pathToFileURL(requireFromSource.resolve(specifier)).href)}`);
const { PurchasePreview } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
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
  await s.click("Simular compra");
  assert.match(s.text(), /Sua estimativa/);
  assert.match(s.text().replace(/\u00a0/g, " "), /R\$ 2,07/);
  assert.equal(calls.length, 0);
  await s.click("Continuar com Pix");
  assert.deepEqual(calls, [{ symbol: "NVDA", method: "pix", amount: "100", locale: "pt-BR" }]);
}));

test("changing payment method discards the old preview and uses the USDC minimum and amount", () => harness(async s => {
  const calls = [];
  await s.render({ onContinue: selection => calls.push(selection) });
  await s.click("Simular compra");
  await s.click("USDC · na Base");
  assert.doesNotMatch(s.text(), /Sua estimativa/);
  assert.equal(document.querySelector("input").value, "100");
  await s.click("10 USDC");
  await s.click("Simular compra");
  await s.click("Continuar com USDC");
  assert.deepEqual(calls, [{ symbol: "NVDA", method: "usdc", amount: "10", locale: "pt-BR" }]);
}));

test("English exposes USDC only and an inactive live rail cannot continue from an estimate", () => harness(async s => {
  const calls = [];
  await s.render({ locale: "en", canContinue: () => false, onContinue: selection => calls.push(selection) });
  assert.doesNotMatch(s.text(), /Pix/);
  await s.click("Preview purchase");
  assert.match(s.text(), /Your estimate/);
  assert.match(s.text(), /Purchases are coming soon/);
  assert.equal(s.button("Continue with USDC").disabled, true);
  await s.click("Continue with USDC");
  assert.equal(calls.length, 0);
}));

test("a failed intent write keeps the estimate visible and reports the error", () => harness(async s => {
  await s.render({ onContinue: () => { throw new Error("Não foi possível guardar sua simulação."); } });
  await s.click("Simular compra");
  await s.click("Continuar com Pix");
  assert.match(document.querySelector('[role="alert"]').textContent, /guardar/);
  assert.match(s.text(), /Sua estimativa/);
}));

test("a missing reference price cannot reuse a previously displayed estimate", () => harness(async s => {
  await s.render(); await s.click("Simular compra");
  await s.render({ prices: {} });
  assert.equal(document.querySelector(".preview-result"), null);
  assert.equal(s.button("Continuar com Pix").disabled, true);
  assert.match(s.text(), /preço de referência disponível/);
  assert.doesNotMatch(s.text(), /Compra em breve/);
}));
