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
import { QuoteContext } from "../../core/types";
import { assignMoonbeamToPendulumXcm, BaseInitializeEngine, buildXcmMeta } from "./index";

export class OnRampInitializeAveniaEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.BUY,
    skipNote: "OnRampInitializeAveniaEngine: Skipped because rampType is SELL, this engine handles BUY operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

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

    const xcmFees = buildXcmMeta();
    await assignMoonbeamToPendulumXcm(ctx, xcmFees, mintedBrla, mintedBrlaRaw);

    ctx.addNote?.(`Assuming ${mintedBrla.toFixed()} BRLA minted on ephemeral account`);
  }
}
