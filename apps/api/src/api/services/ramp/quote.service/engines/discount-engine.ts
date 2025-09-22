import Partner from "../../../../../models/partner.model";
import { QuoteContext, Stage, StageKey } from "../types";

/**
 * DiscountEngine
 * - Determines applicable discount rate for the partner (or default 'vortex' partner).
 * - Stores only metadata (rate, partnerId) on context. Subsidy math is applied by finalization/legacy.
 */
export class DiscountEngine implements Stage {
  readonly key = StageKey.Discount;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    // Prefer partner from ctx if active; otherwise fallback to 'vortex' for given ramp type.
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

    ctx.discount = {
      applied: rate > 0,
      partnerId: discountPartner?.id,
      rate: rate.toString()
    };

    ctx.addNote?.(
      `DiscountEngine: partner=${discountPartner?.name || "vortex"} (${discountPartner?.id || "N/A"}), rate=${rate}`
    );
  }
}
