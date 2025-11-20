import { RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import Partner from "../../../../../models/partner.model";
import { QuoteContext, Stage, StageKey } from "../../core/types";

const DEFAULT_PARTNER_NAME = "vortex";

type ActivePartner = Pick<Partner, "id" | "targetDiscount" | "maxSubsidy" | "name"> | null;

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

interface DiscountSubsidyPayload {
  actualOutputAmountDecimal: Big;
  actualOutputAmountRaw: string;
  expectedOutputAmountDecimal: Big;
}

export interface DiscountStageConfig {
  direction: RampDirection;
  skipNote: string;
  missingContextMessage: string;
  isOfframp: boolean;
}

/**
 * Calculate expected output amount based on oracle price and target discount
 * @param inputAmount - The input amount from the request
 * @param oraclePrice - The oracle price (FIAT-USD format, e.g., BRL-USD)
 * @param targetDiscount - The target discount rate to apply
 * @param isOfframp - Whether this is an offramp (requires price inversion)
 * @returns Expected output amount
 */
function calculateExpectedOutput(inputAmount: string, oraclePrice: Big, targetDiscount: number, isOfframp: boolean): Big {
  const inputAmountBig = new Big(inputAmount);

  // For offramps, we need to invert the oracle price
  // Oracle price is FIAT-USD, so for offramps we want USD-FIAT
  const effectivePrice = isOfframp ? new Big(1).div(oraclePrice) : oraclePrice;
  console.log(`Oracle Price:`, oraclePrice.toString());
  console.log(`Effective Price (${isOfframp ? "Inverted" : "Direct"}):`, effectivePrice.toString());

  const discountedRate = effectivePrice.plus(targetDiscount);
  console.log(`Discounted Rate (Effective Price + Target Discount):`, discountedRate.toString());
  return inputAmountBig.mul(discountedRate);
}

/**
 * Calculate the subsidy amount by comparing expected vs actual output
 * Caps at maxSubsidy if configured
 * @param expectedOutput - The expected output amount
 * @param actualOutput - The actual output amount from nabla swap
 * @param maxSubsidy - Maximum subsidy rate (decimal)
 * @returns Subsidy amount as Big
 */
function calculateSubsidyAmount(expectedOutput: Big, actualOutput: Big, maxSubsidy: number): Big {
  // If actual output is already >= expected, no subsidy needed
  if (actualOutput.gte(expectedOutput)) {
    return new Big(0);
  }

  // Calculate the shortfall
  const shortfall = expectedOutput.minus(actualOutput);

  // Cap at maxSubsidy if configured
  const maxSubsidyBig = new Big(maxSubsidy);
  const cappedMaxSubsidy = expectedOutput.mul(maxSubsidyBig);

  return shortfall.gt(cappedMaxSubsidy) ? cappedMaxSubsidy : shortfall;
}

export async function resolveDiscountPartner(ctx: QuoteContext, rampType: RampDirection): Promise<ActivePartner> {
  const partnerId = ctx.partner?.id;

  const where = {
    isActive: true,
    rampType
  } as const;

  if (partnerId) {
    const partner = await Partner.findOne({
      where: {
        ...where,
        id: partnerId
      }
    });

    if (partner) {
      return partner;
    }
  }

  return Partner.findOne({
    where: {
      ...where,
      name: DEFAULT_PARTNER_NAME
    }
  });
}

export function buildDiscountSubsidy(
  subsidyAmount: Big,
  partner: ActivePartner,
  payload: DiscountSubsidyPayload
): QuoteContext["subsidy"] {
  const subsidyAmountInOutputTokenDecimal = subsidyAmount;
  const rate = payload.expectedOutputAmountDecimal.gt(0) ? subsidyAmount.div(payload.expectedOutputAmountDecimal) : new Big(0);

  // Calculate raw subsidy amount
  const subsidyAmountInOutputTokenRaw = subsidyAmount
    .mul(new Big(payload.actualOutputAmountRaw))
    .div(payload.actualOutputAmountDecimal)
    .toFixed(0, 0);

  return {
    applied: subsidyAmount.gt(0),
    partnerId: partner?.id,
    rate: rate.toString(),
    subsidyAmountInOutputTokenDecimal,
    subsidyAmountInOutputTokenRaw
  };
}

export function formatPartnerNote(
  partner: ActivePartner,
  targetDiscount: number,
  maxSubsidy: number,
  subsidyAmount: Big
): string {
  return (
    `partner=${partner?.name || DEFAULT_PARTNER_NAME} (${partner?.id || "N/A"}), ` +
    `targetDiscount=${targetDiscount}, maxSubsidy=${maxSubsidy}, ` +
    `calculatedSubsidy=${subsidyAmount.toString()}`
  );
}
