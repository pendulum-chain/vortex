import { RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import { ActivePartner, buildDiscountSubsidy, formatPartnerNote } from "./helpers";

export interface DiscountStageConfig {
  direction: RampDirection;
  skipNote: string;
  isOfframp: boolean;
}

export interface DiscountComputation {
  expectedOutputAmountDecimal: Big;
  expectedOutputAmountRaw: string;
  actualOutputAmountDecimal: Big;
  actualOutputAmountRaw: string;
  idealSubsidyAmountInOutputTokenDecimal: Big;
  idealSubsidyAmountInOutputTokenRaw: string;
  subsidyAmountInOutputTokenDecimal: Big;
  subsidyAmountInOutputTokenRaw: string;
  partnerId: string | null;
  subsidyRate: Big;
}

export abstract class BaseDiscountEngine implements Stage {
  abstract readonly config: DiscountStageConfig;

  readonly key = StageKey.Discount;

  protected abstract compute(ctx: QuoteContext, partner?: ActivePartner): Promise<DiscountComputation>;

  protected abstract validate(ctx: QuoteContext): void;

  async execute(ctx: QuoteContext): Promise<void> {
    const { request } = ctx;
    const { direction, skipNote } = this.config;

    if (request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    this.validate(ctx);

    const computation = await this.compute(ctx);

    ctx.subsidy = buildDiscountSubsidy(computation);

    ctx.addNote?.(formatPartnerNote(ctx, computation));
  }
}
