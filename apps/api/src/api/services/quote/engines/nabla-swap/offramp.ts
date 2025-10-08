import {
  AssetHubToken,
  FiatToken,
  getAnyFiatTokenDetails,
  getPendulumDetails,
  multiplyByPowerOfTen,
  Networks,
  PENDULUM_USDC_AXL,
  RampCurrency,
  RampDirection
} from "@packages/shared";
import { calculateNablaSwapOutput } from "../../core/nabla";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import { validateAmountLimits } from "../../core/validation-helpers";

export class OffRampSwapEngine implements Stage {
  readonly key = StageKey.NablaSwap;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("Skipped for on-ramp request");
      return;
    }

    if (!ctx.preNabla?.deductibleFeeAmountInSwapCurrency) {
      throw new Error("OffRampSwapEngine: Missing deductible fee amount from preNabla");
    }

    const inputAmountPreFees =
      req.from === "assethub" ? ctx.assethubToPendulumXcm?.outputAmountDecimal : ctx.evmToPendulum?.outputAmountDecimal;
    if (!inputAmountPreFees) {
      throw new Error("OffRampSwapEngine: Missing input amount from previous stage");
    }

    // If we are on-ramping from Sepa, we already swapped EUR to axlUSDC with Squidrouter
    const inputTokenPendulumDetails =
      req.from === "assethub" ? getPendulumDetails(req.inputCurrency, Networks.AssetHub) : PENDULUM_USDC_AXL;
    const outputTokenPendulumDetails = getPendulumDetails(req.outputCurrency as FiatToken);

    const inputAmountForSwap = inputAmountPreFees.minus(ctx.preNabla.deductibleFeeAmountInSwapCurrency).toString();
    const inputAmountForSwapRaw = multiplyByPowerOfTen(inputAmountForSwap, inputTokenPendulumDetails.decimals).toString();

    const result = await calculateNablaSwapOutput({
      inputAmountForSwap,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails,
      rampType: req.rampType
    });

    validateAmountLimits(result.nablaOutputAmountDecimal, req.outputCurrency as FiatToken, "max", req.rampType);

    ctx.nablaSwap = {
      ...ctx.nablaSwap,
      effectiveExchangeRate: result.effectiveExchangeRate,
      inputAmountForSwap,
      inputAmountForSwapRaw,
      inputCurrency: inputTokenPendulumDetails.currency,
      inputDecimals: inputTokenPendulumDetails.decimals,
      outputAmountDecimal: result.nablaOutputAmountDecimal,
      outputAmountRaw: result.nablaOutputAmountRaw,
      outputCurrency: outputTokenPendulumDetails.currency,
      outputDecimals: outputTokenPendulumDetails.decimals
    };

    ctx.addNote?.(
      `Nabla swap from ${inputTokenPendulumDetails.currency} to ${outputTokenPendulumDetails.currency}, input amount ${inputAmountForSwap}, output amount ${result.nablaOutputAmountDecimal.toFixed()}`
    );
  }
}
