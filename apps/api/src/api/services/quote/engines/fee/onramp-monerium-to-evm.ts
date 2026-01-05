import { EvmToken, FiatToken, RampCurrency, RampDirection } from "@vortexfi/shared";
import { QuoteContext } from "../../core/types";
import { BaseFeeEngine, FeeComputation, FeeConfig } from "./index";

export class OnRampMoneriumToEvmFeeEngine extends BaseFeeEngine {
  readonly config: FeeConfig = {
    direction: RampDirection.BUY,
    skipNote: "Skipped for off-ramp request"
  };

  protected validate(ctx: QuoteContext): void {
    // No specific validation needed
  }

  protected async compute(ctx: QuoteContext, anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation> {
    return {
      anchor: { amount: "0", currency: FiatToken.EURC as RampCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency }
    };
  }
}
