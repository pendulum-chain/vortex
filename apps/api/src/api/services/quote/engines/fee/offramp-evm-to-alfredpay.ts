import { EvmToken, RampCurrency, RampDirection } from "@vortexfi/shared";
import { QuoteContext } from "../../core/types";
import { BaseFeeEngine, FeeComputation, FeeConfig } from "./index";

export class OffRampEvmToAlfredpayFeeEngine extends BaseFeeEngine {
  readonly config: FeeConfig = {
    direction: RampDirection.SELL,
    skipNote: "Skipped for off-ramp request"
  };

  protected validate(ctx: QuoteContext): void {
    if (!ctx.alfredpayOfframp) {
      throw new Error("OffRampEvmToAlfredpayFeeEngine requires alfredpayOfframp in context");
    }
  }

  protected async compute(ctx: QuoteContext, anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation> {
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const alfredpayFee = ctx.alfredpayOfframp!.fee.toString();
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const alfredpayFeeCurrency = ctx.alfredpayOfframp!.currency as RampCurrency;

    return {
      anchor: { amount: alfredpayFee, currency: alfredpayFeeCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency }
    };
  }
}
