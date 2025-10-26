import { EvmToken, RampCurrency, RampDirection } from "@packages/shared";
import { QuoteContext } from "../../core/types";
import { BaseFeeEngine, FeeComputation, FeeConfig } from "./index";

export class OnRampMoneriumToAssethubFeeEngine extends BaseFeeEngine {
  readonly config: FeeConfig = {
    direction: RampDirection.BUY,
    skipNote: "Skipped for off-ramp request"
  };

  protected validate(ctx: QuoteContext): void {
    if (!ctx.evmToMoonbeam) {
      throw new Error("OnRampMoneriumToAssethubFeeEngine: evmToMoonbeam quote data is required");
    }
  }

  protected async compute(ctx: QuoteContext, anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation> {
    return {
      anchor: { amount: anchorFee, currency: feeCurrency },
      // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
      network: { amount: ctx.evmToMoonbeam!.networkFeeUSD, currency: EvmToken.USDC as RampCurrency }
    };
  }
}
