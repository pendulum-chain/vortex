import { RampDirection } from "@vortexfi/shared";
import { QuoteContext, Stage, StageKey } from "../../core/types";
import {
  type ActivePartner,
  buildDiscountSubsidy,
  calculateExpectedOutput,
  calculateSubsidyAmount,
  type DiscountSubsidyPayload,
  formatPartnerNote,
  resolveDiscountPartner
} from "./helpers";

// Re-export types for external use
export type { ActivePartner, DiscountSubsidyPayload };

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

    // Compare actual vs expected and calculate subsidy
    const actualOutputAmount = nablaSwap.outputAmountDecimal;
    const subsidyAmount = calculateSubsidyAmount(expectedOutputAmount, actualOutputAmount, maxSubsidy);

    ctx.subsidy = buildDiscountSubsidy(subsidyAmount, partner, {
      actualOutputAmountDecimal: actualOutputAmount,
      actualOutputAmountRaw: nablaSwap.outputAmountRaw,
      expectedOutputAmountDecimal: expectedOutputAmount
    });

    ctx.addNote?.(formatPartnerNote(partner, targetDiscount, maxSubsidy, subsidyAmount));
  }
}
