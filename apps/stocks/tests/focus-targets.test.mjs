import assert from "node:assert/strict";
import test from "node:test";
import { sourceFiles } from "./helpers.mjs";

// The skip link and every route change call document.getElementById("conteudo").focus(): a <main>
// without tabIndex cannot take focus, so keyboard and screen-reader users would stay on <body>.
test("every screen's main#conteudo can take focus", () => {
  const mains = sourceFiles().flatMap((file) => [...file.text.matchAll(/<main\b[^>]*>/g)].map((match) => ({ path: file.path, tag: match[0] })));
  const targets = mains.filter((item) => item.tag.includes('id="conteudo"'));
  assert.ok(targets.length >= 5, "screens not found");
  for (const item of targets) assert.match(item.tag, /tabIndex=\{-1\}/, `${item.path}: ${item.tag}`);
  const app = sourceFiles().find((file) => file.path === "src/App.jsx").text;
  assert.match(app, /getElementById\("conteudo"\)\?\.focus\(/, "App focuses the content");
});
