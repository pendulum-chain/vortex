import { RampDirection } from "@packages/shared";
import Partner from "../../../../../models/partner.model";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export class OffRampDiscountEngine implements Stage {
  readonly key = StageKey.OffRampDiscount;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    if (req.rampType !== RampDirection.SELL) {
      ctx.addNote?.("Skipped for on-ramp request");
      return;
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

    ctx.subsidy = {
      applied: rate > 0,
      partnerId: discountPartner?.id,
      rate: rate.toString()
    };

    ctx.addNote?.(`partner=${discountPartner?.name || "vortex"} (${discountPartner?.id || "N/A"}), rate=${rate}`);
  }
}
