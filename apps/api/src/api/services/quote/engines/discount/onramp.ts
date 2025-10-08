import { RampDirection } from "@packages/shared";
import Big from "big.js";
import Partner from "../../../../../models/partner.model";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OnRampDiscountEngine implements Stage {
  readonly key = StageKey.Discount;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.BUY) {
      ctx.addNote?.("Skipped for off-ramp request");
      return;
    }

    if (!ctx.nablaSwap) {
      throw new Error("OnRampDiscountEngine requires nablaSwap in context");
    }

    let discountPartner = ctx.partner?.id
      ? await Partner.findOne({
          where: {
            id: ctx.partner.id,
            isActive: true,
            rampType: req.rampType
          }
        })
      : null;

    if (!discountPartner) {
      discountPartner = await Partner.findOne({
        where: {
          isActive: true,
          name: "vortex",
          rampType: req.rampType
        }
      });
    }

    const rate = discountPartner?.discount ?? 0;

    const subsidyAmountInOutputToken = ctx.nablaSwap.outputAmountDecimal.mul(rate);
    const subsidyAmountInOutputTokenRaw = Big(ctx.nablaSwap.outputAmountRaw).mul(rate).toFixed(0, 0);

    ctx.subsidy = {
      applied: rate > 0,
      partnerId: discountPartner?.id,
      rate: rate.toString(),
      subsidyAmountInOutputToken,
      subsidyAmountInOutputTokenRaw
    };

    ctx.addNote?.(`partner=${discountPartner?.name || "vortex"} (${discountPartner?.id || "N/A"}), rate=${rate}`);
  }
}
