import { RampDirection } from "@packages/shared";
import Big from "big.js";
import Partner from "../../../../../models/partner.model";
import { QuoteContext, Stage, StageKey } from "../../core/types";

const DEFAULT_PARTNER_NAME = "vortex";

type ActivePartner = Pick<Partner, "id" | "discount" | "name"> | null;

export abstract class BaseDiscountEngine implements Stage {
  abstract readonly config: DiscountStageConfig;

  readonly key = StageKey.Discount;

  async execute(ctx: QuoteContext): Promise<void> {
    const { request } = ctx;
    const { direction, skipNote, missingContextMessage } = this.config;

    if (request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    const nablaSwap = ctx.nablaSwap;
    if (!nablaSwap) {
      throw new Error(missingContextMessage);
    }

    const partner = await resolveDiscountPartner(ctx, request.rampType);
    const rate = partner?.discount ?? 0;

    ctx.subsidy = buildDiscountSubsidy(rate, partner, {
      outputAmountDecimal: nablaSwap.outputAmountDecimal,
      outputAmountRaw: nablaSwap.outputAmountRaw
    });

    ctx.addNote?.(formatPartnerNote(partner, rate));
  }
}

interface DiscountSubsidyPayload {
  outputAmountDecimal: Big;
  outputAmountRaw: string;
}

export interface DiscountStageConfig {
  direction: RampDirection;
  skipNote: string;
  missingContextMessage: string;
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
  rate: number,
  partner: ActivePartner,
  payload: DiscountSubsidyPayload
): QuoteContext["subsidy"] {
  const subsidyAmountInOutputTokenDecimal = payload.outputAmountDecimal.mul(rate);
  const subsidyAmountInOutputTokenRaw = new Big(payload.outputAmountRaw).mul(rate).toFixed(0, 0);

  return {
    applied: rate > 0,
    partnerId: partner?.id,
    rate: rate.toString(),
    subsidyAmountInOutputTokenDecimal,
    subsidyAmountInOutputTokenRaw
  };
}

export function formatPartnerNote(partner: ActivePartner, rate: number): string {
  return `partner=${partner?.name || DEFAULT_PARTNER_NAME} (${partner?.id || "N/A"}), rate=${rate}`;
}
