import { FiatToken, getAnyFiatTokenDetailsMoonbeam, multiplyByPowerOfTen, RampDirection, XcmFees } from "@packages/shared";
import Big from "big.js";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampInitializeAveniaEngine implements Stage {
  readonly key = StageKey.OnRampInitialize;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    const brlaTokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);
    const amountIn = new Big(req.inputAmount);
    const amountInRaw = multiplyByPowerOfTen(amountIn, brlaTokenDetails.decimals).toString();

    // We received minted BRLA on the ephemeral account
    // TODO get actual quote from Avenia API to get estimate for fees
    const fee = Big(0.01); // assume 0.01 BRLA fees for minting
    const mintedBrla = new Big(req.inputAmount).minus(fee);
    const mintedBrlaRaw = multiplyByPowerOfTen(mintedBrla, brlaTokenDetails.decimals).toString();

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
