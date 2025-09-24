import { AssetHubToken, EvmToken, RampCurrency, RampDirection } from "@packages/shared";
import { calculateNablaSwapOutput } from "../../core/gross-output";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampSwapEngine implements Stage {
  readonly key = StageKey.OnRampSwap;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("OnRampSwapEngine: skipped for off-ramp request");
      return;
    }

    let nablaOutputCurrency: RampCurrency;
    if (req.to === "assethub") {
      nablaOutputCurrency = AssetHubToken.USDC;
    } else {
      nablaOutputCurrency = EvmToken.USDC;
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

    ctx.nabla = {
      effectiveExchangeRate: result.effectiveExchangeRate,
      outputAmountDecimal: result.nablaOutputAmountDecimal,
      outputAmountRaw: result.nablaOutputAmountRaw,
      outputCurrency: nablaOutputCurrency
    };

    ctx.addNote?.(
      `OnRampSwapEngine: output=${result.nablaOutputAmountDecimal.toString()} ${String(
        nablaOutputCurrency
      )}, raw=${result.nablaOutputAmountRaw}`
    );
  }
}
