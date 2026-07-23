import { EPaymentMethod, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CorridorId } from "@/domain/types";
import { buildQuoteRequest } from "./quote.service";

const CASES: Array<[CorridorId, FiatToken, EPaymentMethod]> = [
  ["BR", FiatToken.BRL, EPaymentMethod.PIX],
  ["MX", FiatToken.MXN, EPaymentMethod.SPEI],
  ["CO", FiatToken.COP, EPaymentMethod.ACH],
  ["US", FiatToken.USD, EPaymentMethod.ACH],
  ["AR", FiatToken.ARS, EPaymentMethod.CBU]
];

describe("buildQuoteRequest", () => {
  for (const [corridorId, fiat, paymentMethod] of CASES) {
    it(`builds a ${fiat} BUY quote: fiat in, token out`, () => {
      const request = buildQuoteRequest({
        corridorId,
        direction: RampDirection.BUY,
        inputAmount: "125.5",
        network: Networks.Polygon,
        token: "USDC" as never
      });

      assert.equal(request.rampType, RampDirection.BUY);
      assert.equal(request.from, paymentMethod);
      assert.equal(request.to, Networks.Polygon);
      assert.equal(request.network, Networks.Polygon);
      assert.equal(request.paymentMethod, paymentMethod);
      assert.equal(request.inputCurrency, fiat);
      assert.equal(request.inputAmount, "125.5");
      assert.equal(request.outputCurrency, "USDC");
    });

    it(`builds a ${fiat} SELL quote: token in, fiat out`, () => {
      const request = buildQuoteRequest({
        corridorId,
        direction: RampDirection.SELL,
        inputAmount: "125.5",
        network: Networks.Polygon,
        token: "USDC" as never
      });

      assert.equal(request.rampType, RampDirection.SELL);
      assert.equal(request.from, Networks.Polygon);
      assert.equal(request.to, paymentMethod);
      assert.equal(request.network, Networks.Polygon);
      assert.equal(request.paymentMethod, paymentMethod);
      assert.equal(request.inputCurrency, "USDC");
      assert.equal(request.inputAmount, "125.5");
      assert.equal(request.outputCurrency, fiat);
    });
  }

  it("passes the amount to the wire untouched", () => {
    const request = buildQuoteRequest({
      corridorId: "BR",
      direction: RampDirection.BUY,
      inputAmount: "1234.567890",
      network: Networks.Polygon,
      token: "USDC" as never
    });

    assert.equal(request.inputAmount, "1234.567890");
  });
});
