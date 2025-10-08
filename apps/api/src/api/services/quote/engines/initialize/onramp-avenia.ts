import {
  AveniaPaymentMethod,
  BrlaApiService,
  BrlaCurrency,
  FiatToken,
  getAnyFiatTokenDetailsMoonbeam,
  multiplyByPowerOfTen,
  RampDirection,
  XcmFees
} from "@packages/shared";
import Big from "big.js";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampInitializeAveniaEngine implements Stage {
  readonly key = StageKey.Initialize;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    const brlaTokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);
    const amountIn = new Big(req.inputAmount);
    const amountInRaw = multiplyByPowerOfTen(amountIn, brlaTokenDetails.decimals).toString();

    const brlaApiService = BrlaApiService.getInstance();
    const aveniaQuote = await brlaApiService.createPayInQuote({
      inputAmount: amountIn.toString(),
      inputCurrency: BrlaCurrency.BRL,
      inputPaymentMethod: AveniaPaymentMethod.PIX,
      inputThirdParty: false,
      outputCurrency: BrlaCurrency.BRLA,
      outputPaymentMethod: AveniaPaymentMethod.MOONBEAM,
      outputThirdParty: false
    });

    // We add a small buffer for the gas fees
    const gasFee = aveniaQuote.appliedFees.find(fee => fee.type === "Gas Fee");
    let gasFeeBuffer = new Big(0.1); // Default to 0.1 BRL if we can't find the gas fee
    if (gasFee) {
      const gasFeeAmount = new Big(gasFee.amount);
      // We add a 50% buffer to the applied gas fee
      gasFeeBuffer = gasFeeAmount.mul(0.5);
    }

    // We received minted BRLA on the ephemeral account
    const mintedBrla = new Big(aveniaQuote.outputAmount).minus(gasFeeBuffer);
    const mintedBrlaRaw = multiplyByPowerOfTen(mintedBrla, brlaTokenDetails.decimals).toString();

    const fee = amountIn.minus(mintedBrla);

    ctx.aveniaMint = {
      amountIn,
      amountInRaw,
      amountOut: mintedBrla,
      amountOutRaw: mintedBrlaRaw,
      currency: FiatToken.BRL,
      fee
    };

    // TODO implement actual derivation of XCM fees
    const xcmFees: XcmFees = {
      destination: { amount: "0.01", amountRaw: "1000", currency: "USDC" },
      origin: { amount: "0.01", amountRaw: "1000", currency: "USDC" }
    };

    // The fees are not deducted from the minted BRLA because they are paid in GLMR,
    // so the input and output amounts are the same
    ctx.moonbeamToPendulumXcm = {
      fromToken: FiatToken.BRL,
      inputAmountDecimal: mintedBrla,
      inputAmountRaw: mintedBrlaRaw,
      outputAmountDecimal: mintedBrla,
      outputAmountRaw: mintedBrlaRaw,
      toToken: FiatToken.BRL,
      xcmFees
    };

    ctx.addNote?.(`Assuming ${mintedBrla.toFixed()} BRLA minted on ephemeral account`);
  }
}
