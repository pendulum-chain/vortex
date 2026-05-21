import { EvmToken, FiatToken, RampCurrency, RampDirection } from "@vortexfi/shared";
import { getMykoboFees } from "../../../mykobo";
import { QuoteContext } from "../../core/types";
import { BaseFeeEngine, FeeComputation, FeeConfig } from "./index";

export class OnRampMykoboToEvmFeeEngine extends BaseFeeEngine {
  readonly config: FeeConfig = {
    direction: RampDirection.BUY,
    skipNote: "Skipped for off-ramp request"
  };

  protected validate(_ctx: QuoteContext): void {
    // No specific validation needed
  }

  protected async compute(ctx: QuoteContext, _anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation> {
    const value = ctx.mykoboMint?.inputAmountDecimal?.toString() ?? ctx.request.inputAmount;
    const fees = await getMykoboFees(value, "deposit");
    return {
      anchor: { amount: fees.total, currency: FiatToken.EURC as RampCurrency },
      forcedPartnerMarkupFee: { amount: "0", currency: feeCurrency },
      forcedVortexFee: { amount: "0", currency: feeCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency }
    };
  }
}
