import assert from "node:assert/strict";
import test from "node:test";
import { clearPurchaseSelection, estimatePurchase, PREVIEW_INTENT_TTL_MS, purchaseSelection, readPurchaseSelection, savePurchaseSelection } from "../src/lib/purchase-preview.js";
import { STOCKS_KEYS } from "../src/lib/stores.js";
import { jsonMemory, forbiddenFetch, withFetch } from "./helpers.mjs";

const pix = { symbol: "NVDA", method: "pix", amount: "500", locale: "pt-BR" };
const usdc = { ...pix, method: "usdc", amount: "100", locale: "en" };

test("Pix preview includes the full illustrative first-wallet reserve and reconciles the receipt", () => {
  const q = estimatePurchase(pix, 1000);
  assert.equal(q.total, 4.71);
  assert.equal(q.net, 495.29);
  assert.equal(q.tokenAmount, "0.49529");
  assert.equal(q.costs.find(c => c.provider === "reserve").amount, .71);
  assert.equal(q.costs.find(c => c.provider === "vortex").amount, .5);
  assert.equal(q.illustrative, true);
  assert.equal(q.quoteId, undefined);
});

test("USDC preview keeps micro-unit precision and rounds provider fees up", () => {
  const q = estimatePurchase({ ...usdc, amount: "10.000001" }, 100);
  assert.equal(q.total, .230003);
  assert.equal(q.net, 9.769998);
  assert.equal(q.tokenAmount, "0.09769998");
  assert.equal(q.costs.find(c => c.provider === "relay").amount, .010001);
  assert.deepEqual(q.costs.map(c => c.provider), ["relay", "uniswap", "vortex", "network", "reserve"]);
});

test("fractional tokens are available at each existing checkout minimum", () => {
  assert.equal(estimatePurchase({ ...pix, amount: "100" }, 1000).tokenAmount, "0.09689");
  assert.ok(Number(estimatePurchase({ ...usdc, amount: "10" }, 1000).tokenAmount) < 1);
  for (const input of [{ ...pix, amount: "99" }, { ...usdc, amount: "9.999999" }]) assert.equal(estimatePurchase(input, 100), null);
});

test("preview amounts use checkout-compatible plain decimal strings", () => {
  assert.equal(purchaseSelection({ ...pix, amount: "100,00" }).amount, "100");
  assert.equal(purchaseSelection({ ...usdc, amount: "10,123456" }).amount, "10.123456");
  for (const amount of ["1e3", "-100", "Infinity", "500abc", "1.000,00", "100.01", "1000001", ""]) assert.equal(purchaseSelection({ ...pix, amount }), null, amount);
  assert.equal(purchaseSelection({ ...usdc, amount: "10.0000001" }), null);
  assert.equal(purchaseSelection({ ...usdc, amount: "1000000" }).amount, "1000000");
});

test("unlisted assets, unsupported methods, locales and unavailable prices fail closed", () => {
  for (const input of [{ ...pix, symbol: "FAKE" }, { ...pix, method: "card" }, { ...pix, locale: "de" }, { ...pix, locale: "en" }, null]) assert.equal(purchaseSelection(input), null);
  for (const price of [0, -1, NaN, Infinity, 1e100, "missing", 0.000000001]) assert.equal(estimatePurchase(pix, price), null);
});

test("preview arithmetic never calls a quote, identity or payment provider", () => withFetch(forbiddenFetch(), () => {
  assert.ok(estimatePurchase(pix, 1000));
  assert.ok(estimatePurchase(usdc, 100));
}));

test("only the allowlisted selection survives sign-in; quote, consent and wallet are discarded", () => {
  const { storage, backing } = jsonMemory();
  const value = savePurchaseSelection({ ...pix, quote: { total: 0 }, accepted: true, wallet: "untrusted", type: "sell" }, { storage, now: 1000 });
  assert.deepEqual(value, pix);
  assert.deepEqual(JSON.parse(backing.getItem(STOCKS_KEYS.purchaseIntent)), { ...pix, createdAt: 1000 });
  assert.deepEqual(readPurchaseSelection({ storage, now: 1001, locale: "pt-BR" }), pix);
  clearPurchaseSelection(storage);
  assert.equal(readPurchaseSelection({ storage, now: 1001 }), null);
});

test("per-tab intent is locale-specific and never consumes the other entry point's draft", () => {
  const { storage } = jsonMemory();
  savePurchaseSelection(usdc, { storage, now: 1000 });
  assert.equal(readPurchaseSelection({ storage, now: 1001, locale: "pt-BR" }), null);
  assert.deepEqual(readPurchaseSelection({ storage, now: 1001, locale: "en" }), usdc);
});

test("expired, future-dated or tampered drafts cannot restore a checkout", () => {
  const { storage, backing } = jsonMemory();
  for (const value of [{ ...pix, createdAt: 0 }, { ...pix, createdAt: 9e9 }, { ...pix, createdAt: "now" }, { ...pix, createdAt: PREVIEW_INTENT_TTL_MS, symbol: "FAKE" }]) {
    storage.set(STOCKS_KEYS.purchaseIntent, value);
    assert.equal(readPurchaseSelection({ storage, now: PREVIEW_INTENT_TTL_MS + 1 }), null);
    assert.equal(backing.getItem(STOCKS_KEYS.purchaseIntent), null);
  }
});

test("unavailable session storage keeps the user on the preview instead of losing a draft", () => {
  assert.throws(() => savePurchaseSelection(pix, { storage: { set: () => false } }), /guardar/);
  assert.throws(() => savePurchaseSelection({ ...pix, amount: "0" }, { storage: { set: () => { throw new Error("must not write"); } } }), /Confira/);
});
