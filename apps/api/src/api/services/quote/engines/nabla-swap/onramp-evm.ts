import { EvmToken, RampDirection } from "@vortexfi/shared";
import { QuoteContext } from "../../core/types";
import { BaseNablaSwapEngineEvm, NablaSwapEvmComputation } from "./base-evm";

export class OnRampSwapEngineEvm extends BaseNablaSwapEngineEvm {
  readonly config = {
    direction: RampDirection.BUY,
    skipNote: "OnRampSwapEngineEvm: Skipped because rampType is SELL, this engine handles BUY operations only"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.fees?.usd) {
      throw new Error("OnRampSwapEngineEvm: Fees in USD must be calculated first - ensure fee stage ran successfully");
    }
  }

  protected compute(ctx: QuoteContext): NablaSwapEvmComputation {
    const { request } = ctx;

    if (!ctx.aveniaTransfer) {
      throw new Error(
        "OnRampSwapEngineEvm: Missing aveniaTransfer quote data from previous stage - ensure initialize stage ran successfully"
      );
    }

    const inputAmountPreFees = ctx.aveniaTransfer.outputAmountDecimal;

    // For Onramp EVM, the input token for Nabla is the output of Avenia transfer (BRLA on Base)
    // The output token is fixed at USDC.
    const inputToken = EvmToken.BRLA;
    const outputToken = EvmToken.USDC;

    return {
      inputAmountPreFees,
      inputToken,
      outputToken
    };
  }
}
