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

for (const locale of ["pt-BR", "en"]) {
  test(`${locale} hero takes keyboard focus to its own simulator and respects reduced motion`, async () => {
    const previous = [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT];
    const dom = new JSDOM('<div id="root"></div><section id="purchase"><select><option>NVDA</option></select></section>');
    globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const target = document.getElementById("purchase");
    const scrolls = [];
    target.scrollIntoView = options => scrolls.push(options);
    dom.window.matchMedia = () => ({ matches: true });
    const root = createRoot(document.getElementById("root"));
    try {
      await act(async () => root.render(createElement(FairFeesHero, { locale, previewId: "purchase" })));
      const action = document.querySelector('[aria-controls="purchase"]');
      assert.ok(Boolean(action));
      await act(async () => action.click());
      assert.equal(document.activeElement?.tagName, "SELECT");
      assert.deepEqual(scrolls, [{ behavior: "auto", block: "start" }]);
      assert.equal(document.querySelector(".fair-hero img").getAttribute("src"), "/pt-br/stocks/images/fair-fees-cafe-800.jpg");
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = previous;
    }
  });
}
