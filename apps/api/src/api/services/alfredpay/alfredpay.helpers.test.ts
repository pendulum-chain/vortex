import { describe, expect, it } from "bun:test";
import { AlfredpayCustomerType, EvmToken, FiatToken, RampDirection } from "@vortexfi/shared";
import { resolveAlfredpayQuoteLimits } from "./alfredpay.helpers";

describe("resolveAlfredpayQuoteLimits", () => {
  it("uses the AlfredPay settlement token for a routed onramp", async () => {
    const limits = await resolveAlfredpayQuoteLimits({
      inputCurrency: FiatToken.MXN,
      outputCurrency: EvmToken.ETH,
      rampType: RampDirection.BUY
    });

    expect(limits).toMatchObject({
      customer: AlfredpayCustomerType.INDIVIDUAL,
      fiat: FiatToken.MXN,
      stablecoin: EvmToken.USDT
    });
  });
});
