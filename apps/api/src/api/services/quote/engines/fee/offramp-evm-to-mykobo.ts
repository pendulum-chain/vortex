import { EvmToken, FiatToken, RampCurrency, RampDirection } from "@vortexfi/shared";
import { getMykoboFees } from "../../../mykobo";
import { QuoteContext } from "../../core/types";
import { BaseFeeEngine, FeeComputation, FeeConfig } from "./index";

export class OffRampEvmToMykoboFeeEngine extends BaseFeeEngine {
  readonly config: FeeConfig = {
    direction: RampDirection.SELL,
    skipNote: "Skipped for on-ramp request"
  };

  protected validate(_ctx: QuoteContext): void {
    // No specific validation needed
  }

  protected async compute(ctx: QuoteContext, _anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation> {
    const value = ctx.mykoboOffRamp?.outputAmountDecimal?.toString() ?? ctx.request.inputAmount;
    const fees = await getMykoboFees(value, "withdraw");
    return {
      anchor: { amount: fees.total, currency: FiatToken.EURC as RampCurrency },
      forcedPartnerMarkupFee: { amount: "0", currency: feeCurrency },
      forcedVortexFee: { amount: "0", currency: feeCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency }
    };
  }
}
