import assert from "node:assert/strict";
import test from "node:test";
import { helloPt, welcomeTitlePt } from "../src/lib/greeting.js";

test("greetings use the first name when there is one, and never a placeholder in its place", () => {
  assert.equal(helloPt("Ana"), "Olá, Ana.");
  assert.equal(welcomeTitlePt("Ana"), "Boas-vindas, Ana.");
  // A Privy e-mail login has no name: no "Olá, Olá." and no "Bem-vindo(a), Olá.".
  for (const missing of [undefined, null, "", "   "]) {
    assert.equal(helloPt(missing), "Olá.");
    assert.equal(welcomeTitlePt(missing), "Boas-vindas.");
  }
  assert.equal(helloPt("  Ana Maria "), "Olá, Ana.");
});
