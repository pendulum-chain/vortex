import { describe, expect, it } from "bun:test";
import { AssetHubToken, EPaymentMethod, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import { APIError } from "../../../errors/api-error";
import { createQuoteContext } from "../core/quote-context";
import { RouteResolver } from "./route-resolver";

describe("RouteResolver", () => {
  it("rejects AssetHub to CBU before creating an unexecutable Alfredpay quote", () => {
    const ctx = createQuoteContext({
      partner: null,
      request: {
        from: Networks.AssetHub,
        inputAmount: "100",
        inputCurrency: AssetHubToken.USDC,
        network: Networks.AssetHub,
        outputCurrency: FiatToken.ARS,
        rampType: RampDirection.SELL,
        to: EPaymentMethod.CBU
      },
      targetFeeFiatCurrency: FiatToken.ARS
    });

    expect(() => new RouteResolver().resolve(ctx)).toThrow(APIError);
  });
});
