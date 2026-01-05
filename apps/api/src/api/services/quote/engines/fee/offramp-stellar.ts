import { EvmToken, RampCurrency, RampDirection } from "@vortexfi/shared";
import { QuoteContext } from "../../core/types";
import { BaseFeeEngine, FeeComputation, FeeConfig } from "./index";

export class OffRampFeeStellarEngine extends BaseFeeEngine {
  readonly config: FeeConfig = {
    direction: RampDirection.SELL,
    skipNote: "Skipped for on-ramp request"
  };

  protected validate(ctx: QuoteContext): void {
    // No specific validation needed
  }

  protected async compute(ctx: QuoteContext, anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation> {
    return {
      anchor: { amount: anchorFee, currency: feeCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency }
    };
  }
}
