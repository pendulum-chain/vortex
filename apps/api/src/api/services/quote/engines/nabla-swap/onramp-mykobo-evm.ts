import { EvmToken, RampDirection } from "@vortexfi/shared";
import { QuoteContext } from "../../core/types";
import { BaseNablaSwapEngineEvm, NablaSwapEvmComputation } from "./base-evm";

export class OnRampSwapEngineMykoboEvm extends BaseNablaSwapEngineEvm {
  readonly config = {
    direction: RampDirection.BUY,
    skipNote: "OnRampSwapEngineMykoboEvm: Skipped because rampType is SELL, this engine handles BUY operations only"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.fees?.usd) {
      throw new Error("OnRampSwapEngineMykoboEvm: Fees in USD must be calculated first - ensure fee stage ran successfully");
    }
    if (!ctx.mykoboMint) {
      throw new Error(
        "OnRampSwapEngineMykoboEvm: Missing mykoboMint quote data from previous stage - ensure initialize stage ran successfully"
      );
    }
  }

  protected compute(ctx: QuoteContext): NablaSwapEvmComputation {
    // biome-ignore lint/style/noNonNullAssertion: validated above
    const inputAmountPreFees = ctx.mykoboMint!.outputAmountDecimal;

    return {
      inputAmountPreFees,
      inputToken: EvmToken.EURC,
      outputToken: EvmToken.USDC
    };
  }
}
