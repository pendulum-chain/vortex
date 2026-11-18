import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { transformWithEsbuild } from "vite";

const source = new URL("../src/components/FairFeesHero.jsx", import.meta.url);
const requireFromSource = createRequire(source);
const transformed = await transformWithEsbuild(await readFile(source, "utf8"), fileURLToPath(source), {
  jsx: "automatic", define: { "import.meta.env.BASE_URL": JSON.stringify("/pt-br/stocks/") }
});
const code = transformed.code.replace(/from\s+["']([^"']+)["']/g, (_, specifier) => `from ${JSON.stringify(specifier.startsWith(".") ? new URL(specifier, source).href : pathToFileURL(requireFromSource.resolve(specifier)).href)}`);
const { FairFeesHero } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

async function harness(locale, run, props = {}) {
  const previous = [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT];
  const dom = new JSDOM('<div id="root"></div><section id="purchase"><select><option>NVDA</option></select></section>');
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const target = document.getElementById("purchase"), checkoutScrolls = [], slides = [], captured = new Set();
  target.scrollIntoView = options => checkoutScrolls.push(options);
  dom.window.matchMedia = () => ({ matches: true });
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(createElement(FairFeesHero, { locale, previewId: "purchase", ...props })));
    const track = document.querySelector(".fair-hero__track");
    Object.defineProperty(track, "clientWidth", { value: 400, configurable: true });
    track.scrollTo = options => { slides.push(options); track.scrollLeft = options.left; track.dispatchEvent(new dom.window.Event("scroll")); };
    track.setPointerCapture = id => captured.add(id);
    track.hasPointerCapture = id => captured.has(id);
    track.releasePointerCapture = id => captured.delete(id);
    const dots = [...document.querySelectorAll(".fair-hero__pagination button")];
    const active = () => dots.findIndex(button => button.getAttribute("aria-pressed") === "true");
    const pointer = async (type, x, y = 100, pointerType = "mouse") => {
      const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerType, pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y });
      await act(async () => { track.dispatchEvent(event); track.dispatchEvent(new dom.window.Event("scroll")); });
      return event;
    };
    const key = name => act(async () => track.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })));
    await run({ track, dots, active, pointer, key, slides, checkoutScrolls, captured, click: node => act(async () => node.click()),
      nativeScroll: left => act(async () => { track.scrollLeft = left; track.dispatchEvent(new dom.window.Event("scroll")); }) });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = previous;
  }
}

for (const locale of ["pt-BR", "en"]) {
  test(`${locale}: dot and keyboard navigation select localized highlights, without changing the purchase handoff`, () => harness(locale, async s => {
    assert.equal(s.dots.length, 3);
    assert.equal(s.active(), 0);
    await s.click(s.dots[1]);
    assert.equal(s.active(), 1);
    assert.match(document.querySelector("h1").textContent, locale === "en" ? /Companies you know/ : /Empresas que você conhece/);
    await s.key("End"); assert.equal(s.active(), 2);
    await s.key("ArrowRight"); assert.equal(s.active(), 2);
    await s.key("Home"); assert.equal(s.active(), 0);
    assert.ok(s.slides.every(scroll => scroll.behavior === "auto"), "reduced motion is respected");
    assert.equal(s.checkoutScrolls.length, 0);
    const action = document.querySelector(".fair-hero__action");
    assert.equal(action.textContent, locale === "en" ? "Buy with USDC" : "Comprar com Pix");
    await s.click(action);
    assert.equal(document.activeElement?.tagName, "SELECT");
    assert.deepEqual(s.checkoutScrolls, [{ behavior: "auto", block: "start" }]);
    assert.equal(document.querySelectorAll("h1").length, 1);
    assert.equal(document.querySelector(".fair-hero img").getAttribute("src"), "/pt-br/stocks/images/carousel-fair-fees-800.jpg");
  }));

  test(`${locale}: touch stays native and scroll position drives the selected dot`, () => harness(locale, async s => {
    await s.pointer("pointerdown", 300, 100, "touch");
    const move = await s.pointer("pointermove", 80, 105, "touch");
    assert.equal(move.defaultPrevented, false);
    assert.equal(s.slides.length, 0);
    await s.nativeScroll(400); assert.equal(s.active(), 1);
    await s.nativeScroll(800); assert.equal(s.active(), 2);
    await s.nativeScroll(900); assert.equal(s.active(), 2);
    await s.nativeScroll(-20); assert.equal(s.active(), 0);
    assert.equal(s.checkoutScrolls.length, 0);
  }));
}

for (const [locale, buy, preview, soon] of [["pt-BR", "Comprar com Pix", "Ver custos da compra", "Compra com Pix em breve"],
  ["en", "Buy with USDC", "See purchase costs", "USDC purchases are coming soon"]]) {
  test(`${locale}: the hero promises a purchase only while buying is open, and neither promise while it is unknown`, async () => {
    for (const [buyOpen, action, notice] of [[true, buy, null], [false, preview, soon], [null, preview, null]]) {
      await harness(locale, async () => {
        assert.equal(document.querySelector(".fair-hero__action").textContent, action);
        assert.equal(document.querySelector(".hero__soon")?.textContent ?? null, notice);
      }, { buyOpen });
    }
  });
}

test("mouse drag advances, clamps at the edges and releases pointer capture", () => harness("en", async s => {
  await s.pointer("pointerdown", 300);
  const move = await s.pointer("pointermove", 160);
  assert.equal(move.defaultPrevented, true);
  assert.equal(s.captured.has(1), true);
  await s.pointer("pointerup", 160);
  assert.equal(s.active(), 1);
  assert.equal(s.captured.size, 0);
  assert.equal(s.track.classList.contains("is-dragging"), false);
  await s.click(s.dots[2]);
  await s.pointer("pointerdown", 300); await s.pointer("pointermove", 160); await s.pointer("pointerup", 160);
  assert.equal(s.active(), 2);
  assert.equal(s.checkoutScrolls.length, 0);
}));

test("small clicks, vertical movement and cancelled drags cannot leave the carousel stuck", () => harness("en", async s => {
  await s.pointer("pointerdown", 100); await s.pointer("pointerup", 104);
  assert.equal(s.slides.length, 0);
  await s.pointer("pointerdown", 100);
  const vertical = await s.pointer("pointermove", 105, 240);
  assert.equal(vertical.defaultPrevented, false);
  assert.equal(s.captured.size, 0);
  await s.pointer("pointerdown", 300); await s.pointer("pointermove", 180); await s.pointer("pointercancel", 0);
  assert.equal(s.active(), 0);
  assert.equal(s.captured.size, 0);
  assert.equal(s.track.classList.contains("is-dragging"), false);
}));
