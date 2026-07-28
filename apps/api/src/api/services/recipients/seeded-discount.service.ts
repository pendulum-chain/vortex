import { Transaction } from "sequelize";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import Partner from "../../../models/partner.model";
import PartnerPricingConfig from "../../../models/partnerPricingConfig.model";
import ProfilePartnerAssignment from "../../../models/profilePartnerAssignment.model";
import type { SeededDiscount } from "../../../models/recipientInvitation.model";
import User from "../../../models/user.model";
import { findPartnerWithPricing, type PartnerWithPricing } from "../partners/partner-pricing.service";

export type SeededDiscountOutcome =
  | "created"
  | "skipped_existing_assignment"
  | "skipped_missing_vortex_pricing"
  | "skipped_profile_missing"
  | "skipped_partner_name_conflict";

/**
 * Materializes the discounts a discount_manager attached to an invite as partner pricing
 * for the accepting profile: a dedicated partner row, one pricing config per seeded
 * direction, and a profile assignment — all inside the acceptance transaction.
 *
 * A profile that already holds an active, unexpired partner assignment keeps it: the
 * invite then only connects the recipient, it never overrides existing pricing. Skips
 * never fail the acceptance — a seed that cannot be applied safely is dropped, loudly.
 */
export async function materializeSeededDiscounts(
  userId: string,
  invitationId: string,
  seeds: SeededDiscount[],
  transaction: Transaction
): Promise<SeededDiscountOutcome> {
  // Serialize on the profile row — the same lock the admin assignment path takes — so a
  // concurrent admin assignment (or second discounted acceptance) cannot race this check
  // into the active-assignment unique index or get deactivated by the replacement below.
  const lockedUser = await User.findByPk(userId, { lock: Transaction.LOCK.UPDATE, transaction });
  if (!lockedUser) {
    logger.error(`Seeded discount for invite ${invitationId}: profile ${userId} not found; seeding skipped`);
    return "skipped_profile_missing";
  }

  const now = new Date();
  const activeAssignments = await ProfilePartnerAssignment.findAll({
    transaction,
    where: { isActive: true, userId }
  });
  if (activeAssignments.some(assignment => !assignment.expiresAt || assignment.expiresAt > now)) {
    return "skipped_existing_assignment";
  }

  // A quote priced by a partner config takes its platform fee from that config instead of
  // the default vortex row (see quote-fees.ts), so the vortex fee must be copied forward.
  // Without it the seeded config would ramp platform-fee-free — in that case seed nothing
  // (acceptance still connects the recipient) rather than materialize a fee-free config.
  const vortexPricingBySeed: PartnerWithPricing[] = [];
  for (const seed of seeds) {
    const vortexPricing = await findPartnerWithPricing({ name: "vortex" }, seed.rampType, seed.fiatCurrency);
    if (!vortexPricing) {
      logger.error(
        `Seeded discount for invite ${invitationId}: no vortex pricing for ${seed.rampType}/${seed.fiatCurrency}; seeding skipped`
      );
      return "skipped_missing_vortex_pricing";
    }
    vortexPricingBySeed.push(vortexPricing);
  }

  // The dedicated partner row is named by the accepting profile's email (unique on
  // profiles; both columns are STRING(100), hence the defensive slice).
  const partnerName = lockedUser.email.slice(0, 100);
  const [partner, createdPartner] = await Partner.findOrCreate({
    defaults: {
      displayName: partnerName,
      isActive: true,
      name: partnerName
    },
    transaction,
    where: { name: partnerName }
  });

  if (!createdPartner) {
    // An email-named partner already exists. Reuse it only if it was previously seeded for
    // this same profile (a later discount invite after the earlier assignment ended) —
    // never repurpose an unrelated partner that happens to carry this name.
    const priorAssignment = await ProfilePartnerAssignment.findOne({
      transaction,
      where: { partnerId: partner.id, userId }
    });
    if (!priorAssignment) {
      logger.error(
        `Seeded discount for invite ${invitationId}: partner named '${partnerName}' exists but was never assigned to profile ${userId}; seeding skipped`
      );
      return "skipped_partner_name_conflict";
    }
    // Re-seeding replaces the previous invite's seeded configs wholesale.
    await PartnerPricingConfig.destroy({ transaction, where: { partnerId: partner.id } });
    if (!partner.isActive) {
      await partner.update({ isActive: true }, { transaction });
    }
  }

  for (const [index, seed] of seeds.entries()) {
    const vortexPricing = vortexPricingBySeed[index];
    await PartnerPricingConfig.create(
      {
        fiatCurrency: seed.fiatCurrency,
        isActive: true,
        markupCurrency: vortexPricing.markupCurrency,
        markupType: "none",
        markupValue: 0,
        maxDynamicDifference: 0,
        // Mirror the runtime EVM discount-subsidy cap: a quote-time subsidy above this
        // fraction would stall the ramp at subsidize-post-swap for operator intervention.
        maxSubsidy: config.subsidy.evmPostSwapDiscountSubsidyQuoteFraction,
        minDynamicDifference: 0,
        partnerId: partner.id,
        rampType: seed.rampType,
        targetDiscount: seed.bps / 10000,
        vortexFeeType: vortexPricing.markupType,
        vortexFeeValue: vortexPricing.markupValue
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
