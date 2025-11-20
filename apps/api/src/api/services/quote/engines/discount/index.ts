import { RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import {
  buildDiscountSubsidy,
  calculateExpectedOutput,
  calculateSubsidyAmount,
  formatPartnerNote,
  resolveDiscountPartner
} from "./helpers";

export interface DiscountStageConfig {
  direction: RampDirection;
  skipNote: string;
  missingContextMessage: string;
  isOfframp: boolean;
}

export abstract class BaseDiscountEngine implements Stage {
  abstract readonly config: DiscountStageConfig;

  readonly key = StageKey.Discount;

  async execute(ctx: QuoteContext): Promise<void> {
    const { request } = ctx;
    const { direction, skipNote, missingContextMessage, isOfframp } = this.config;

    if (request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    const nablaSwap = ctx.nablaSwap;
    if (!nablaSwap) {
      throw new Error(missingContextMessage);
    }

    if (!nablaSwap.oraclePrice) {
      throw new Error(`${missingContextMessage}: oraclePrice is required`);
    }

    if (!request.inputAmount) {
      throw new Error(`${missingContextMessage}: request.inputAmount is required`);
    }

    const partner = await resolveDiscountPartner(ctx, request.rampType);
    const targetDiscount = partner?.targetDiscount ?? 0;
    const maxSubsidy = partner?.maxSubsidy ?? 0;

    // Calculate expected output amount based on oracle price + target discount
    const expectedOutputAmount = calculateExpectedOutput(request.inputAmount, nablaSwap.oraclePrice, targetDiscount, isOfframp);
    const actualOutputAmount = nablaSwap.outputAmountDecimal;

    // Calculate ideal subsidy (uncapped - the full shortfall needed to reach expected output)
    const idealSubsidyAmount = actualOutputAmount.gte(expectedOutputAmount)
      ? new Big(0)
      : expectedOutputAmount.minus(actualOutputAmount);

    // Calculate actual subsidy (capped by maxSubsidy)
    const actualSubsidyAmount =
      targetDiscount > 0 ? calculateSubsidyAmount(expectedOutputAmount, actualOutputAmount, maxSubsidy) : Big(0);

    ctx.subsidy = buildDiscountSubsidy(actualSubsidyAmount, idealSubsidyAmount, partner, {
      actualOutputAmountDecimal: actualOutputAmount,
      actualOutputAmountRaw: nablaSwap.outputAmountRaw,
      expectedOutputAmountDecimal: expectedOutputAmount
    });

    ctx.addNote?.(formatPartnerNote(partner, targetDiscount, maxSubsidy, actualSubsidyAmount, idealSubsidyAmount));
  }
}
