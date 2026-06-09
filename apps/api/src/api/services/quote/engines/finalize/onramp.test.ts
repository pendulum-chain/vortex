import {describe, expect, it} from "bun:test";
import {EvmToken, FiatToken, Networks, RampDirection} from "@vortexfi/shared";
import Big from "big.js";
import {OnRampFinalizeEngine} from "./onramp";

class TestOnRampFinalizeEngine extends OnRampFinalizeEngine {
  compute(ctx: Parameters<OnRampFinalizeEngine["execute"]>[0]) {
    return this.computeOutput(ctx);
  }
}

describe("OnRampFinalizeEngine", () => {
  it("uses destination EVM token decimals for BRL onramp output precision", async () => {
    const result = await new TestOnRampFinalizeEngine().compute({
      evmToEvm: {
        outputAmountDecimal: new Big("4817.805726163073314321")
      },
      request: {
        inputCurrency: FiatToken.BRL,
        outputCurrency: EvmToken.USDT,
        rampType: RampDirection.BUY,
        to: Networks.BSC
      }
    } as never);

    expect(result.decimals).toBe(18);
    expect(result.amount.toFixed(result.decimals, 0)).toBe("4817.805726163073314321");
  });

  it("uses destination EVM token decimals for Alfredpay routed onramp output precision", async () => {
    const result = await new TestOnRampFinalizeEngine().compute({
      evmToEvm: {
        outputAmountDecimal: new Big("4817.805726163073314321")
      },
      request: {
        inputCurrency: FiatToken.USD,
        outputCurrency: EvmToken.USDT,
        rampType: RampDirection.BUY,
        to: Networks.BSC
      }
    } as never);

    expect(result.decimals).toBe(18);
    expect(result.amount.toFixed(result.decimals, 0)).toBe("4817.805726163073314321");
  });
});
