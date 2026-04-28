import { EvmToken, RampDirection } from "@vortexfi/shared";
import { QuoteContext } from "../../core/types";
import { BaseNablaSwapEngineEvm, NablaSwapEvmComputation } from "./base-evm";

export class OffRampSwapEngineEvm extends BaseNablaSwapEngineEvm {
  readonly outputToken: EvmToken;

  constructor(outputToken: EvmToken) {
    super();
    this.outputToken = outputToken;
  }

  readonly config = {
    direction: RampDirection.SELL,
    skipNote: "OffRampSwapEngineEvm: Skipped because rampType is BUY, this engine handles SELL operations only"
  } as const;

  protected validate(ctx: QuoteContext): void {
    if (!ctx.preNabla?.deductibleFeeAmountInSwapCurrency) {
      throw new Error(
        "OffRampSwapEngineEvm: Missing deductibleFeeAmountInSwapCurrency in preNabla context - ensure initialize stage ran successfully"
      );
    }
  }

  protected compute(ctx: QuoteContext): NablaSwapEvmComputation {
    const inputAmountPreFees = ctx.evmToEvm?.outputAmountDecimal;
    if (!inputAmountPreFees) {
      throw new Error(
        "OffRampSwapEngineEvm: Missing input amount from previous stage - ensure initialize stage ran successfully"
      );
    }

    // We receive USDC on Base.
    const inputToken = EvmToken.USDC;
    return {
      inputAmountPreFees,
      inputToken,
      outputToken: this.outputToken
    };
  }
}
