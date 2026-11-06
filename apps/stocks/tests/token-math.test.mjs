import assert from "node:assert/strict";
import test from "node:test";
import { findStock } from "../src/lib/stocks.js";
import {
  assertSellBalance, estimateTokensForBrl, floorDisplay, maxSellAmount, multiplierWeiFor, positionValueBrl, sharesWei, tokensToWei, weiToTokens,
} from "../src/lib/token.js";

test("token input accepts a comma or a dot and at most 18 decimals", () => {
  assert.equal(tokensToWei("1,5"), 1_500000000000000000n);
  assert.equal(tokensToWei("1.5"), 1_500000000000000000n);
  assert.equal(tokensToWei(" 2 "), 2_000000000000000000n);
  assert.equal(tokensToWei(",5"), 500000000000000000n);
  assert.equal(tokensToWei("0.000000000000000001"), 1n);
  assert.throws(() => tokensToWei("0.0000000000000000001"), /18 casas decimais/);
  for (const bad of ["", " ", "-1", "1.234,5", "1,2,3", "abc", "1e3", ".", "+1", null, undefined]) assert.throws(() => tokensToWei(bad), bad);
  assert.equal(weiToTokens(1_500000000000000000n), "1.5");
});

test("shares follow the uiMultiplier, with bigint maths only", () => {
  assert.equal(sharesWei(10n ** 18n, 1000775159164630595n), 1000775159164630595n);
  assert.equal(sharesWei(2n * 10n ** 18n, 10n ** 18n), 2n * 10n ** 18n);
  const nvda = findStock("NVDA");
  assert.equal(multiplierWeiFor(nvda), 1000775159164630595n);
  assert.equal(multiplierWeiFor(nvda, 1000800000000000000n), 1000800000000000000n, "the chain read wins over the snapshot");
});

test("display truncation never rounds up", () => {
  assert.equal(floorDisplay("0.489899999", 4), "0.4898");
  assert.equal(floorDisplay("0.9999999", 2), "0.99");
  assert.equal(floorDisplay("3", 4), "3.0000");
  assert.equal(floorDisplay("12.5", 0), "12");
});

test("\"Usar tudo\" sells the exact raw balance: no dust, no oversell", () => {
  const raw = 1_234567890123456789n;
  const amount = maxSellAmount(raw);
  assert.equal(amount, "1.234567890123456789");
  assert.equal(tokensToWei(amount), raw);
  assert.doesNotThrow(() => assertSellBalance(raw, tokensToWei(amount)));
});

test("the sell balance check rejects a shortfall and a zero amount", () => {
  assert.throws(() => assertSellBalance(10n, 11n), (error) => error.code === "INSUFFICIENT_BALANCE");
  assert.throws(() => assertSellBalance(10n, 0n), (error) => error.code === "INSUFFICIENT_BALANCE");
  assert.throws(() => assertSellBalance(null, 1n), (error) => error.code === "INSUFFICIENT_BALANCE");
  assert.doesNotThrow(() => assertSellBalance(10n, 10n));
});

test("position value and the pre-fee estimate are display-only and never invent a price", () => {
  assert.equal(positionValueBrl(2n * 10n ** 18n, 1163.89), 2327.78);
  assert.equal(positionValueBrl(10n ** 18n, null), null);
  assert.equal(positionValueBrl(10n ** 18n, 0), null);
  assert.equal(estimateTokensForBrl(500, 1163.89).slice(0, 8), "0.429593");
  assert.equal(estimateTokensForBrl(0, 1163.89), null);
  assert.equal(estimateTokensForBrl(500, undefined), null);
});
