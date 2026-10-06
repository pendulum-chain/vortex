import { FiatToken } from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { offrampStartsAfterDeadline } from "./transfer";

describe("offrampStartsAfterDeadline", () => {
  it("is true for a non-domestic SELL whose source hash the API accepted", () => {
    assert.equal(offrampStartsAfterDeadline(FiatToken.BRL, true), true);
  });

  it("is false while the source hash is still unsubmitted", () => {
    assert.equal(offrampStartsAfterDeadline(FiatToken.BRL, false), false);
  });

  it("is false for AlfredPay pay-outs, which the recovery worker never starts", () => {
    for (const currency of [FiatToken.USD, FiatToken.MXN, FiatToken.COP, FiatToken.ARS]) {
      assert.equal(offrampStartsAfterDeadline(currency, true), false);
    }
  });
});
