import { FiatToken, RampCurrency, RampDirection } from "@packages/shared";
import { calculateNablaSwapOutput } from "../../core/nabla";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import { validateAmountLimits } from "../../core/validation-helpers";

export class OffRampSwapEngine implements Stage {
  readonly key = StageKey.OffRampSwap;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("OffRampSwapEngine: skipped for on-ramp request");
      return;
    }

    let nablaOutputCurrency: RampCurrency;
    if (req.to === "pix") {
      nablaOutputCurrency = FiatToken.BRL;
    } else if (req.to === "sepa") {
      nablaOutputCurrency = FiatToken.EURC;
    } else if (req.to === "cbu") {
      nablaOutputCurrency = FiatToken.ARS;
    } else {
      throw new Error(`OffRampSwapEngine: Unsupported off-ramp destination: ${req.to}`);
    }

    const inputAmountForSwap = ctx.preNabla.inputAmountForSwap?.toString() ?? req.inputAmount;

    const result = await calculateNablaSwapOutput({
      fromPolkadotDestination: req.from,
      inputAmountForSwap,
      inputCurrency: req.inputCurrency,
      nablaOutputCurrency,
      rampType: req.rampType,
      toPolkadotDestination: req.to
    });

    validateAmountLimits(result.nablaOutputAmountDecimal, req.outputCurrency as FiatToken, "max", req.rampType);

    ctx.nabla = {
      effectiveExchangeRate: result.effectiveExchangeRate,
      outputAmountDecimal: result.nablaOutputAmountDecimal,
      outputAmountRaw: result.nablaOutputAmountRaw,
      outputCurrency: nablaOutputCurrency
    };

    ctx.addNote?.(
      `OffRampSwapEngine: output=${result.nablaOutputAmountDecimal.toString()} ${String(
        nablaOutputCurrency
      )}, raw=${result.nablaOutputAmountRaw}`
    );
  }
}
