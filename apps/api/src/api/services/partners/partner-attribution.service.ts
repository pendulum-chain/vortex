import { Transaction } from "sequelize";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import Partner from "../../../models/partner.model";
import ProfilePartnerAssignment from "../../../models/profilePartnerAssignment.model";
import User from "../../../models/user.model";

export type PartnerAttributionOutcome =
  | "created"
  | "skipped_existing_assignment"
  | "skipped_partner_inactive"
  | "skipped_profile_missing";

/**
 * Persists partner pricing attribution for a profile onboarded through a partner-attributed
 * API credential. The partner is always resolved server-side from `api_credentials.partner_id`
 * — never from a client-chosen value — which keeps the server-side-only invariant of
 * `docs/security-spec/03-ramp-engine/profile-partner-pricing.md` intact.
 *
 * First partner wins: a profile that already holds an active, unexpired assignment keeps it,
 * so an attribution claim can never hijack a previously assigned profile. Skips are silent by
 * design (logged, not thrown) — attribution must never fail the onboarding it rides on.
 *
 * Callers must pass a transaction that holds the profile row lock (a freshly created profile
 * row is locked by its own insert), mirroring the admin and seeded-discount assignment paths.
 */
export async function assignPartnerAttribution(
  userId: string,
  partnerId: string,
  transaction: Transaction
): Promise<PartnerAttributionOutcome> {
  const partner = await Partner.findOne({ transaction, where: { id: partnerId, isActive: true } });
  if (!partner) {
    logger.warn(`Partner attribution for profile ${userId}: partner ${partnerId} not found or inactive; skipped`);
    return "skipped_partner_inactive";
  }

  const now = new Date();
  const activeAssignments = await ProfilePartnerAssignment.findAll({
    transaction,
    where: { isActive: true, userId }
  });
  if (activeAssignments.some(assignment => !assignment.expiresAt || assignment.expiresAt > now)) {
    return "skipped_existing_assignment";
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
      partnerName: partner.name,
      userId
    },
    { transaction }
  );

  return "created";
}

/**
 * Standalone claim used by the widget flow: opens its own transaction and takes the same
 * profile row lock the admin assignment path takes, so concurrent claims and admin writes
 * for one profile serialize.
 */
export async function claimPartnerAttribution(userId: string, partnerId: string): Promise<PartnerAttributionOutcome> {
  return sequelize.transaction(async transaction => {
    const lockedUser = await User.findByPk(userId, { lock: Transaction.LOCK.UPDATE, transaction });
    if (!lockedUser) {
      logger.warn(`Partner attribution claim: profile ${userId} not found; skipped`);
      return "skipped_profile_missing";
    }
    return assignPartnerAttribution(userId, partnerId, transaction);
  });
}
