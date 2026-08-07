import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampDecimals,
  formatAmount,
  formatCurrencyAmount,
  stripTrailingSeparator,
  toDisplayAmount,
  toRawAmount,
  trimTrailingZeros
} from "./amount";

describe("toRawAmount", () => {
  it("strips thousand separators and normalises the decimal separator", () => {
    assert.equal(toRawAmount("1,234.56", ".", ","), "1234.56");
    assert.equal(toRawAmount("1.234,56", ",", "."), "1234.56");
  });

  it("leaves an already raw value untouched", () => {
    assert.equal(toRawAmount("1234.56", ".", ","), "1234.56");
    assert.equal(toRawAmount("", ".", ","), "");
  });
});

describe("toDisplayAmount", () => {
  it("swaps the dot for the locale decimal separator", () => {
    assert.equal(toDisplayAmount("1234.56", ","), "1234,56");
    assert.equal(toDisplayAmount("1234.56", "."), "1234.56");
  });
});

describe("clampDecimals", () => {
  it("cuts digits past the limit", () => {
    assert.equal(clampDecimals("1.234567", 2), "1.23");
    assert.equal(clampDecimals("1.5", 0), "1");
  });

  it("keeps values already within the limit", () => {
    assert.equal(clampDecimals("1.2", 2), "1.2");
    assert.equal(clampDecimals("1234", 2), "1234");
    assert.equal(clampDecimals("", 2), "");
  });

  it("keeps a trailing separator so typing the first decimal is not swallowed", () => {
    assert.equal(clampDecimals("12.", 2), "12.");
  });
});

describe("trimTrailingZeros", () => {
  it("removes insignificant fractional zeroes", () => {
    assert.equal(trimTrailingZeros("1503.430000000000000000"), "1503.43");
    assert.equal(trimTrailingZeros("1.000000000000000000"), "1");
    assert.equal(trimTrailingZeros("1.2304"), "1.2304");
  });
});

describe("formatAmount", () => {
  it("caps decimals and omits insignificant zeroes", () => {
    assert.equal(formatAmount("1.000000000000000000", 4), "1");
    assert.equal(formatAmount("1503.430000000000000000", 2), "1,503.43");
    assert.equal(formatAmount("1.234567", 4), "1.2345");
  });

  it("selects the display cap from the currency", () => {
    assert.equal(formatCurrencyAmount("1503.439", "ARS"), "1,503.43");
    assert.equal(formatCurrencyAmount("1.234567", "USDC"), "1.2345");
  });
});

describe("stripTrailingSeparator", () => {
  it("drops a trailing dot the wire would reject", () => {
    assert.equal(stripTrailingSeparator("12."), "12");
  });

  it("leaves a complete amount alone", () => {
    assert.equal(stripTrailingSeparator("12.5"), "12.5");
    assert.equal(stripTrailingSeparator("12"), "12");
    assert.equal(stripTrailingSeparator(""), "");
  });
});
