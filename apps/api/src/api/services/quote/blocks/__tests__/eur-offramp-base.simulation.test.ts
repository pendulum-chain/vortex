import { describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { simulateMykoboOfframpPayout } from "../phases/mykobo-offramp-payout/simulation";

const resolveMykoboWithdrawFee = mock(async () => "0.35");
mock.module("../../engines/mykobo-fee", () => ({ resolveMykoboWithdrawFee }));
const { simulateMykoboOfframpFee } = await import("../phases/mykobo-offramp-fee/simulation");

function phaseContext() {
  return {
    addNote: () => {},
    fees: {
      displayFiat: { anchor: "0", currency: FiatToken.EURC, network: "1.25", partnerMarkup: "0.2", total: "1.55", vortex: "0.1" },
      usd: { anchor: "0", network: "1.25", partnerMarkup: "0.2", total: "1.55", vortex: "0.1" }
    },
    notes: [],
    now: new Date(),
    partner: null,
    request: {
      from: Networks.Base,
      inputAmount: "100",
      inputCurrency: EvmToken.USDC,
      network: Networks.Base,
      outputCurrency: FiatToken.EURC,
      rampType: RampDirection.SELL,
      to: EPaymentMethod.SEPA
    },
    targetFeeFiatCurrency: FiatToken.EURC
  };
}

describe("EUR offramp fee and payout simulation", () => {
  it("replaces the anchor fee without discarding the source provider fee", async () => {
    const originalConvert = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as never;
    try {
      const result = await simulateMykoboOfframpFee(
        { amount: new Big("98.987"), amountRaw: "98987000", chain: Networks.Base, token: EvmToken.EURC },
        phaseContext()
      );
      expect(result.metadata).toEqual({ anchorFeeEur: "0.35", grossAmountEur: "98.98" });
      expect(result.fees?.usd).toMatchObject({ anchor: "0.35", network: "1.25", total: "1.900000" });
    } finally {
      priceFeedService.convertCurrency = originalConvert;
    }
  });

  it("floors provider settlement to cents and subtracts the anchor only from fiat output", async () => {
    const ctx = phaseContext();
    ctx.fees.displayFiat.anchor = "0.35";
    const result = await simulateMykoboOfframpPayout(
      { amount: new Big("98.987654"), amountRaw: "98987654", chain: Networks.Base, token: EvmToken.EURC },
      ctx
    );
    expect(result.metadata).toEqual({
      payoutAmountDecimal: new Big("98.63"),
      payoutAmountRaw: "9863",
      transferAmountDecimal: new Big("98.98"),
      transferAmountRaw: "98980000"
    });
    expect(result.output.amount.toString()).toBe("98.63");
  });
});
