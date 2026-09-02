import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import type { PhaseCtx } from "../../core/types";
import { simulateFinalSettlementSubsidy } from "./simulation";

function buildCtx(): PhaseCtx {
  return {
    addNote() {},
    notes: [],
    now: new Date("2026-01-01T00:00:00.000Z"),
    partner: {
      id: "partner-id",
      maxSubsidy: 0.5,
      targetDiscount: 0.1
    },
    request: {
      from: EPaymentMethod.PIX,
      inputAmount: "500",
      inputCurrency: FiatToken.BRL,
      network: Networks.Ethereum,
      outputCurrency: EvmToken.ETH,
      rampType: RampDirection.BUY,
      to: Networks.Ethereum
    }
  } as PhaseCtx;
}

describe("simulateFinalSettlementSubsidy", () => {
  it("records an arbitrary destination-token target without advertising a cross-denominated subsidy", async () => {
    const result = await simulateFinalSettlementSubsidy(
      {
        amount: new Big("0.025"),
        amountRaw: "25000000000000000",
        chain: Networks.Ethereum,
        token: EvmToken.ETH
      },
      buildCtx()
    );

    expect(result.metadata.amountRaw).toBe("25000000000000000");
    expect(result.metadata.network).toBe(Networks.Ethereum);
    expect(result.metadata.token).toBe(EvmToken.ETH);
    expect(result.metadata.applied).toBe(false);
    expect(Big(result.metadata.actualOutputAmountDecimal).toFixed()).toBe("0.025");
    expect(Big(result.metadata.expectedOutputAmountDecimal).toFixed()).toBe("0.025");
    expect(Big(result.metadata.subsidyAmountInOutputTokenDecimal).toFixed()).toBe("0");
    expect(result.metadata.targetOutputAmountRaw).toBe("25000000000000000");
  });
});
