import assert from "node:assert/strict";
import test from "node:test";
import { exploreHash, hashFor, parseHash, stockHash } from "../src/lib/routes.js";
import { saveReturnHash, takeReturnHash } from "../src/lib/stores.js";
import { jsonMemory } from "./helpers.mjs";

test("hash routes: landing/home, explore with collection and search, detail, history", () => {
  assert.deepEqual(parseHash(""), { name: "home" });
  assert.deepEqual(parseHash("#/"), { name: "home" });
  assert.deepEqual(parseHash("#/explorar"), { name: "explore", collection: null, query: "" });
  assert.deepEqual(parseHash("#/explorar?c=big-techs&q=nvdc34"), { name: "explore", collection: "big-techs", query: "nvdc34" });
  assert.deepEqual(parseHash("#/explorar?c=not-a-collection"), { name: "explore", collection: null, query: "" });
  assert.deepEqual(parseHash("#/acao/NVDA"), { name: "stock", symbol: "NVDA" });
  assert.deepEqual(parseHash("#/acao/nvda/"), { name: "stock", symbol: "NVDA" });
  assert.deepEqual(parseHash("#/historico"), { name: "history" });
  assert.deepEqual(parseHash("#/qualquer-coisa"), { name: "home" });
});

test("an unknown or non-launch symbol opens Explore with a note, never a detail page", () => {
  assert.deepEqual(parseHash("#/acao/NU"), { name: "explore", collection: null, query: "", notFound: "NU" });
  assert.deepEqual(parseHash("#/acao/%3Cscript%3E"), { name: "explore", collection: null, query: "", notFound: "SCRIPT" });
  assert.equal(parseHash("#/acao/%E0%A4%A").name, "explore", "a malformed escape does not throw");
});

test("hashes round-trip, and the search text is encoded", () => {
  assert.equal(stockHash("SPY"), "#/acao/SPY");
  assert.equal(exploreHash({}), "#/explorar");
  assert.equal(exploreHash({ collection: "fundos-de-indice" }), "#/explorar?c=fundos-de-indice");
  assert.equal(exploreHash({ query: "ações nubank" }), "#/explorar?q=a%C3%A7%C3%B5es+nubank");
  for (const hash of ["#/", "#/explorar?c=big-techs&q=apple", "#/acao/MSFT", "#/historico"]) assert.equal(hashFor(parseHash(hash)), hash);
  assert.equal(parseHash(exploreHash({ query: "ações nubank" })).query, "ações nubank");
});

test("the return hash for the OAuth round trip only ever restores an app route", () => {
  const { storage } = jsonMemory();
  saveReturnHash(exploreHash({ collection: "big-techs", query: "ações" }), storage);
  assert.equal(takeReturnHash(storage), "#/explorar?c=big-techs&q=a%C3%A7%C3%B5es");
  assert.equal(takeReturnHash(storage), null, "used once");
  saveReturnHash("https://evil.example/#/acao/NVDA", storage);
  assert.equal(takeReturnHash(storage), null);
});

test("an explore search with a space survives sign-in; a cancelled login is not restored later", () => {
  const { storage } = jsonMemory();
  const search = exploreHash({ query: "big tech" });
  assert.equal(search, "#/explorar?q=big+tech");
  saveReturnHash(search, storage);
  assert.equal(takeReturnHash(storage), search);
  // A Privy login started on a detail screen and cancelled, then a new sign-in from the home screen.
  saveReturnHash("#/acao/NVDA", storage);
  saveReturnHash("#/", storage);
  assert.equal(takeReturnHash(storage), null);
  saveReturnHash("#/explorar?q=a:b//c", storage);
  assert.equal(takeReturnHash(storage), null, "still no URL-like hash");
});
