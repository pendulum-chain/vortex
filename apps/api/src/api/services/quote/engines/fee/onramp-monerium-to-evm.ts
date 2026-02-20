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
    // For this specific engine, no fees are applied, so we return zero amounts for all fee components
    return {
      anchor: { amount: "0", currency: FiatToken.EURC as RampCurrency },
      forcedPartnerMarkupFee: { amount: "0", currency: feeCurrency },
      forcedVortexFee: { amount: "0", currency: feeCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency }
    };
  }
}
