import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampDecimals, toDisplayAmount, toRawAmount } from "./amount";

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
