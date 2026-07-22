import { EPaymentMethod, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CorridorId } from "@/domain/types";
import { buildOnrampQuoteRequest } from "./quote.service";

const CASES: Array<[CorridorId, FiatToken, EPaymentMethod]> = [
  ["BR", FiatToken.BRL, EPaymentMethod.PIX],
  ["MX", FiatToken.MXN, EPaymentMethod.SPEI],
  ["CO", FiatToken.COP, EPaymentMethod.ACH],
  ["US", FiatToken.USD, EPaymentMethod.ACH],
  ["AR", FiatToken.ARS, EPaymentMethod.CBU]
];

describe("buildOnrampQuoteRequest", () => {
  for (const [corridorId, fiat, paymentMethod] of CASES) {
    it(`builds a ${fiat} BUY quote`, () => {
      const request = buildOnrampQuoteRequest({
        corridorId,
        inputAmount: "125.5",
        network: Networks.Polygon,
        outputCurrency: "USDC" as never
      });

      assert.equal(request.rampType, RampDirection.BUY);
      assert.equal(request.from, paymentMethod);
      assert.equal(request.to, Networks.Polygon);
      assert.equal(request.network, Networks.Polygon);
      assert.equal(request.inputCurrency, fiat);
      assert.equal(request.inputAmount, "125.5");
      assert.equal(request.outputCurrency, "USDC");
    });
  }
});
