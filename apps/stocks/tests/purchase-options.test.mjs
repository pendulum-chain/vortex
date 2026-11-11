import assert from "node:assert/strict";
import test from "node:test";
import { sourceFiles } from "./helpers.mjs";
import {
  DEFAULT_BUY, MIN_BUY, QUICK_BUY_VALUES, QUOTE_REFRESH_BEFORE_MS, SMALL_BUY_NOTE_BELOW,
  buyFeePercent, quoteNeedsRefresh, showSmallBuyNote, stepAfterCode, validBuyAmount, validSellAmount,
} from "../src/lib/purchase-options.js";

test("R$100 is the minimum and default; quick values 100 / 500 / 1.000", () => {
  assert.equal(MIN_BUY, 100);
  assert.equal(DEFAULT_BUY, 100);
  assert.deepEqual([...QUICK_BUY_VALUES], [100, 500, 1000]);
  for (const value of QUICK_BUY_VALUES) assert.equal(validBuyAmount(value), true);
});

test("buy amounts are whole reais at or above the minimum", () => {
  for (const value of ["", "0", "-100", "99", "99.99", "100.5", "100,5", "1e3", "NaN", "Infinity", " ", null, undefined, 150.5]) assert.equal(validBuyAmount(value), false, String(value));
  assert.equal(validBuyAmount("100"), true);
  assert.equal(validBuyAmount(" 250 "), true);
  assert.equal(validBuyAmount(1000), true);
});

test("the small-buy note shows below R$250 only", () => {
  assert.equal(SMALL_BUY_NOTE_BELOW, 250);
  assert.equal(showSmallBuyNote(100), true);
  assert.equal(showSmallBuyNote(249), true);
  assert.equal(showSmallBuyNote(250), false);
  assert.equal(showSmallBuyNote(50), false, "an invalid amount shows the minimum error instead");
});

test("the fee share comes from the quote, never from a hard-coded example", () => {
  assert.ok(Math.abs(buyFeePercent({ fees: { network: 0.3, service: 3.75, total: 4.05 } }, 500) - 0.81) < 1e-9);
  assert.ok(Math.abs(buyFeePercent({ totalFee: 10.74 }, 50) - 21.48) < 1e-9, "Gold's quote shape");
  assert.equal(buyFeePercent({ networkFee: 5, serviceFee: 1 }, 50), 12);
  assert.equal(buyFeePercent({ fees: { total: 4 } }, 0), null);
  assert.equal(buyFeePercent({}, 100), null);
});

test("a quote expiring within 15 s is refreshed before confirming", () => {
  const now = 1_000_000;
  assert.equal(QUOTE_REFRESH_BEFORE_MS, 15_000);
  assert.equal(quoteNeedsRefresh({ expiresAt: now + 15_000 }, now), false);
  assert.equal(quoteNeedsRefresh({ expiresAt: now + 14_999 }, now), true);
  assert.equal(quoteNeedsRefresh({}, now), true);
});

test("a sell amount must parse, be positive and fit the balance", () => {
  const balance = 1_500000000000000000n;
  assert.equal(validSellAmount("1,5", balance), true);
  assert.equal(validSellAmount("1.500000000000000001", balance), false);
  assert.equal(validSellAmount("0", balance), false);
  assert.equal(validSellAmount("abc", balance), false);
  assert.equal(validSellAmount("1", 0n), false);
});

test("after the e-mail code a registered operation continues; only a flow without one re-quotes", () => {
  assert.equal(stepAfterCode({ direction: "BUY" }), "prepare");
  assert.equal(stepAfterCode({ direction: "SELL" }), "prepare");
  // A 401 at "Já fiz o Pix" (startRamp) after the Pix was registered: back to that ramp, no new quote.
  assert.equal(stepAfterCode({ direction: "BUY", rampId: "ramp-1" }), "existing");
  // A 401 while signing or starting a registered sell: continue its confirmations.
  assert.equal(stepAfterCode({ direction: "SELL", rampId: "ramp-1" }), "sign");
  assert.equal(stepAfterCode({ direction: "SELL", rampId: "ramp-1", resuming: true }), "sign");
  assert.equal(stepAfterCode({ direction: "BUY", resuming: true }), "existing");
  assert.equal(stepAfterCode({ direction: "SELL", resuming: true }), "existing");
});

// No DOM renderer in this app's tests: pin that both flows route the code step through stepAfterCode.
test("both flows decide the step after the e-mail code with stepAfterCode", () => {
  for (const path of ["src/flows/BuyFlow.jsx", "src/flows/SellFlow.jsx"]) {
    const text = sourceFiles().find((file) => file.path === path).text;
    const verify = text.slice(text.indexOf("const verifyOtp"), text.indexOf("\n  });", text.indexOf("const verifyOtp")));
    assert.match(verify, /stepAfterCode\(\{ direction: "(BUY|SELL)", rampId: ramp\?\.id/, path);
  }
});
