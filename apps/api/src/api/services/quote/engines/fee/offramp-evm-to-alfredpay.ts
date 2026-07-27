import { ALFREDPAY_EVM_TOKEN, RampCurrency, RampDirection } from "@vortexfi/shared";
import { FeeComponentsResult } from "../../core/quote-fees";
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
    if (!ctx.preNabla?.platformFeeSnapshot) {
      throw new Error("OffRampEvmToAlfredpayFeeEngine requires the frozen platform fee snapshot");
    }
  }

  protected async getFeeComponents(ctx: QuoteContext): Promise<FeeComponentsResult> {
    const snapshot = ctx.preNabla?.platformFeeSnapshot;
    if (!snapshot) {
      throw new Error("OffRampEvmToAlfredpayFeeEngine requires the frozen platform fee snapshot");
    }
    return {
      anchorFee: "0",
      feeCurrency: snapshot.feeCurrency,
      partnerMarkupFee: snapshot.partnerMarkup.amount,
      vortexFee: snapshot.vortex.amount
    };
  }

  protected async compute(ctx: QuoteContext, _anchorFee: string, _feeCurrency: RampCurrency): Promise<FeeComputation> {
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const alfredpayFee = ctx.alfredpayOfframp!.fee.toString();
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const alfredpayFeeCurrency = ctx.alfredpayOfframp!.currency as RampCurrency;
    // biome-ignore lint/style/noNonNullAssertion: Context is validated in `validate`
    const feeSnapshot = ctx.preNabla!.platformFeeSnapshot!;

    return {
      anchor: { amount: alfredpayFee, currency: alfredpayFeeCurrency },
      forcedPartnerMarkupFee: {
        amount: feeSnapshot.partnerMarkup.amount,
        currency: feeSnapshot.feeCurrency,
        usdAmount: feeSnapshot.partnerMarkup.usd
      },
      forcedVortexFee: {
        amount: feeSnapshot.vortex.amount,
        currency: feeSnapshot.feeCurrency,
        usdAmount: feeSnapshot.vortex.usd
      },
      network: { amount: "0", currency: ALFREDPAY_EVM_TOKEN as RampCurrency }
    };
  }
}
