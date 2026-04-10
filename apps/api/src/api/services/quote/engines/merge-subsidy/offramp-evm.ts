import { RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { QuoteContext, Stage, StageKey } from "../../core/types";

interface MergeSubsidyConfig {
  direction: RampDirection;
  skipNote: string;
}

export class OffRampMergeSubsidyEvmEngine implements Stage {
  readonly key = StageKey.MergeSubsidy;

  readonly config: MergeSubsidyConfig = {
    direction: RampDirection.SELL,
    skipNote: "OffRampMergeSubsidyEvmEngine: Skipped because rampType is BUY, this engine handles SELL operations only"
  };

  async execute(ctx: QuoteContext): Promise<void> {
    const { direction, skipNote } = this.config;

    if (ctx.request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    if (!ctx.nablaSwapEvm) {
      throw new Error("OffRampMergeSubsidyEvmEngine requires nablaSwapEvm in context");
    }

    if (!ctx.subsidy) {
      throw new Error("OffRampMergeSubsidyEvmEngine requires subsidy in context");
    }

    ctx.nablaSwapEvm = {
      ...ctx.nablaSwapEvm,
      outputAmountDecimal: ctx.nablaSwapEvm.outputAmountDecimal.plus(ctx.subsidy.subsidyAmountInOutputTokenDecimal),
      outputAmountRaw: ctx.nablaSwapEvm.outputAmountDecimal.plus(ctx.subsidy.subsidyAmountInOutputTokenRaw).toFixed(0, 0)
    };

    ctx.addNote?.(
      `OffRampMergeSubsidyEvmEngine: merged subsidy ${ctx.subsidy.subsidyAmountInOutputTokenDecimal.toFixed(6)} into nablaSwapEvm output`
    );
  }
}
