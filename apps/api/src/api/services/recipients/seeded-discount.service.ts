import type { Transaction } from "sequelize";
import logger from "../../../config/logger";
import Partner from "../../../models/partner.model";
import PartnerPricingConfig from "../../../models/partnerPricingConfig.model";
import ProfilePartnerAssignment from "../../../models/profilePartnerAssignment.model";
import type { SeededDiscount } from "../../../models/recipientInvitation.model";
import { findPartnerWithPricing } from "../partners/partner-pricing.service";

export type SeededDiscountOutcome = "created" | "skipped_existing_assignment";

/**
 * Materializes the discounts a discount_manager attached to an invite as partner pricing
 * for the accepting profile.
 *
 * A profile that already holds an active, unexpired partner assignment keeps it.
 */
export async function materializeSeededDiscounts(
  userId: string,
  invitationId: string,
  seeds: SeededDiscount[],
  transaction: Transaction
): Promise<SeededDiscountOutcome> {
  const now = new Date();
  const activeAssignments = await ProfilePartnerAssignment.findAll({
    transaction,
    where: { isActive: true, userId }
  });
  if (activeAssignments.some(assignment => !assignment.expiresAt || assignment.expiresAt > now)) {
    return "skipped_existing_assignment";
  }

  const partnerName = `invite-discount-${invitationId}`;
  const partner = await Partner.create(
    {
      displayName: `Invite discount ${invitationId.slice(0, 8)}`,
      isActive: true,
      name: partnerName
    },
    { transaction }
  );

  for (const seed of seeds) {
    // A quote priced by a partner config takes its platform fee from that config instead of
    // the default vortex row (see quote-fees.ts), so copy the vortex fee forward — otherwise
    // seeded profiles would ramp platform-fee-free.
    const vortexPricing = await findPartnerWithPricing({ name: "vortex" }, seed.rampType, seed.fiatCurrency);
    if (!vortexPricing) {
      logger.warn(`Seeded discount for invite ${invitationId}: no vortex pricing for ${seed.rampType}; fee set to none`);
    }
    await PartnerPricingConfig.create(
      {
        fiatCurrency: seed.fiatCurrency,
        isActive: true,
        markupCurrency: vortexPricing?.markupCurrency ?? null,
        markupType: "none",
        markupValue: 0,
        maxDynamicDifference: 0,
        maxSubsidy: 0,
        minDynamicDifference: 0,
        partnerId: partner.id,
        rampType: seed.rampType,
        targetDiscount: seed.bps / 10000,
        vortexFeeType: vortexPricing?.markupType ?? "none",
        vortexFeeValue: vortexPricing?.markupValue ?? 0
      },
      { transaction }
    );
  }

  // Any remaining active rows are expired — deactivate them so the partial unique index on
  // active assignments cannot collide (same replacement step the admin path performs).
  if (activeAssignments.length > 0) {
    await ProfilePartnerAssignment.update({ isActive: false }, { transaction, where: { isActive: true, userId } });
  }
  await ProfilePartnerAssignment.create(
    {
      isActive: true,
      partnerId: partner.id,
      partnerName,
      userId
    },
    { transaction }
  );

  return "created";
}
