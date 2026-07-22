import {describe, expect, it} from "bun:test";
import {AssetHubToken, EPaymentMethod, FiatToken, Networks, RampDirection} from "@vortexfi/shared";
import {APIError} from "../../../errors/api-error";
import {createQuoteContext} from "../core/quote-context";
import {RouteResolver} from "./route-resolver";

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

  it("rejects BRL onramp to non-USDC AssetHub before selecting the disabled Hydration route", () => {
    const ctx = createQuoteContext({
      partner: null,
      request: {
        from: EPaymentMethod.PIX,
        inputAmount: "100",
        inputCurrency: FiatToken.BRL,
        network: Networks.AssetHub,
        outputCurrency: AssetHubToken.USDT,
        rampType: RampDirection.BUY,
        to: Networks.AssetHub
      },
      targetFeeFiatCurrency: FiatToken.BRL
    });

    expect(() => new RouteResolver().resolve(ctx)).toThrow(APIError);
  });

  it("keeps BRL onramp to AssetHub USDC disabled", () => {
    const ctx = createQuoteContext({
      partner: null,
      request: {
        from: EPaymentMethod.PIX,
        inputAmount: "100",
        inputCurrency: FiatToken.BRL,
        network: Networks.AssetHub,
        outputCurrency: AssetHubToken.USDC,
        rampType: RampDirection.BUY,
        to: Networks.AssetHub
      },
      targetFeeFiatCurrency: FiatToken.BRL
    });

    expect(() => new RouteResolver().resolve(ctx)).toThrow(APIError);
  });
});
