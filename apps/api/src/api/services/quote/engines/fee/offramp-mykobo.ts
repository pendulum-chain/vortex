import { EvmToken, FiatToken, RampCurrency, RampDirection } from "@vortexfi/shared";
import { QuoteContext } from "../../core/types";
import { resolveMykoboWithdrawFee } from "../mykobo-fee";
import { BaseFeeEngine, FeeComputation, FeeConfig } from "./index";

export class OffRampFeeMykoboEngine extends BaseFeeEngine {
  readonly config: FeeConfig = {
    direction: RampDirection.SELL,
    skipNote: "Skipped for on-ramp request"
  };

  protected validate(ctx: QuoteContext): void {
    if (!ctx.nablaSwapEvm) {
      throw new Error("OffRampFeeMykoboEngine requires nablaSwapEvm in context");
    }
  }

  protected async compute(ctx: QuoteContext, _anchorFee: string, _feeCurrency: RampCurrency): Promise<FeeComputation> {
    // biome-ignore lint/style/noNonNullAssertion: validated above
    const swapOutputEurc = ctx.nablaSwapEvm!.outputAmountDecimal.toFixed(2, 0);

    const mykoboFeeTotal = await resolveMykoboWithdrawFee(swapOutputEurc);
    const anchorFeeCurrency = FiatToken.EURC as RampCurrency;

    return {
      anchor: { amount: mykoboFeeTotal, currency: anchorFeeCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency }
    };
  }
}
