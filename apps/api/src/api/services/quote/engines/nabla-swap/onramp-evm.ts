import { EvmToken, RampDirection } from "@vortexfi/shared";
import { QuoteContext } from "../../core/types";
import { BaseNablaSwapEngineEvm, NablaSwapEvmComputation } from "./base-evm";

export class OnRampSwapEngineEVM extends BaseNablaSwapEngineEvm {
  readonly config = {
    direction: RampDirection.BUY,
    skipNote: "OnRampSwapEngineEVM: Skipped because rampType is SELL, this engine handles BUY operations only"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.fees?.usd) {
      throw new Error("OnRampSwapEngineEVM: Fees in USD must be calculated first - ensure fee stage ran successfully");
    }
  }

  protected compute(ctx: QuoteContext): NablaSwapEvmComputation {
    const { request } = ctx;

    if (!ctx.aveniaTransfer) {
      throw new Error(
        "OnRampSwapEngineEVM: Missing aveniaTransfer quote data from previous stage - ensure initialize stage ran successfully"
      );
    }

    const inputAmountPreFees = ctx.aveniaTransfer.outputAmountDecimal;

    // For Onramp EVM, the input token for Nabla is the output of Avenia transfer (BRL on Base)
    // The output token is fixed at USDC.
    const inputToken = ctx.aveniaTransfer.currency as EvmToken;
    const outputToken = EvmToken.USDC;

    return {
      inputAmountPreFees,
      inputToken,
      outputToken
    };
  }
}
