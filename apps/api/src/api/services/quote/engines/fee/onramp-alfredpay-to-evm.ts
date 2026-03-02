import { EvmToken, FiatToken, RampCurrency, RampDirection } from "@vortexfi/shared";
import { QuoteContext } from "../../core/types";
import { BaseFeeEngine, FeeComputation, FeeConfig } from "./index";

export class OnRampAlfredpayToEvmFeeEngine extends BaseFeeEngine {
  readonly config: FeeConfig = {
    direction: RampDirection.BUY,
    skipNote: "Skipped for off-ramp request"
  };

  protected validate(ctx: QuoteContext): void {
    if (!ctx.alfredpayMint) {
      throw new Error("OnRampAlfredpayToEvmFeeEngine requires alfredpayMint in context");
    }
  }

  protected async compute(ctx: QuoteContext, anchorFee: string, feeCurrency: RampCurrency): Promise<FeeComputation> {
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const alfredpayFee = ctx.alfredpayMint!.fee.toString();
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const alfredpayFeeCurrency = ctx.alfredpayMint!.currency as RampCurrency;

    return {
      anchor: { amount: alfredpayFee, currency: alfredpayFeeCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency }
    };
  }
}
