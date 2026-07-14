import httpStatus from "http-status";
import { Transaction } from "sequelize";
import sequelize from "../../config/database";
import type { CustomerEntityType } from "../../models/customerEntity.model";
import CustomerEntity from "../../models/customerEntity.model";
import User from "../../models/user.model";
import { APIError } from "../errors/api-error";

/**
 * Resolves the customer entity owned by a profile, creating the default `individual`
 * entity on first touch. Migration 038 backfilled one entity per existing profile and
 * verify-otp creates one for new sign-ups, but users with pre-existing sessions never
 * re-verify — every entity-scoped read path must tolerate that via this lazy fallback.
 */
export async function getOrCreateCustomerEntityForProfile(
  profileId: string,
  type?: CustomerEntityType
): Promise<CustomerEntity> {
  const profile = await User.findByPk(profileId);
  if (profile?.activeCustomerEntityId) {
    const activeEntity = await CustomerEntity.findOne({ where: { id: profile.activeCustomerEntityId, profileId } });
    if (!activeEntity) {
      throw new APIError({
        isPublic: true,
        message: "The active customer entity is not owned by this profile",
        status: httpStatus.CONFLICT,
        type: "ACTIVE_ENTITY_OWNERSHIP_MISMATCH"
      });
    }
    if (!type || activeEntity.type === type) {
      return activeEntity;
    }
  }

  const [entity] = await CustomerEntity.findOrCreate({
    defaults: {
      profileId,
      status: "active",
      type: type ?? "individual"
    },
    where: { profileId, ...(type ? { type } : {}) }
  });
  return entity;
}

export async function selectActiveCustomerEntity(profileId: string, type: CustomerEntityType): Promise<CustomerEntity> {
  return sequelize.transaction(async transaction => {
    const profile = await User.findByPk(profileId, { lock: Transaction.LOCK.UPDATE, transaction });
    if (!profile) {
      throw new APIError({ isPublic: true, message: "Profile not found", status: httpStatus.NOT_FOUND });
    }

    if (profile.activeCustomerEntityId) {
      const selected = await CustomerEntity.findOne({
        transaction,
        where: { id: profile.activeCustomerEntityId, profileId }
      });
      if (!selected) {
        throw new APIError({
          isPublic: true,
          message: "The active customer entity is not owned by this profile",
          status: httpStatus.CONFLICT,
          type: "ACTIVE_ENTITY_OWNERSHIP_MISMATCH"
        });
      }
      if (selected.type !== type) {
        throw new APIError({
          isPublic: true,
          message: "The active customer entity selection cannot be changed",
          status: httpStatus.CONFLICT,
          type: "ACTIVE_ENTITY_IMMUTABLE"
        });
      }
      return selected;
    }

    const matches = await CustomerEntity.findAll({ transaction, where: { profileId, status: "active", type } });
    if (matches.length > 1) {
      throw new APIError({
        isPublic: true,
        message: "Multiple customer entities match this account type",
        status: httpStatus.CONFLICT,
        type: "ACTIVE_ENTITY_AMBIGUOUS"
      });
    }

    const selected =
      matches[0] ??
      (await CustomerEntity.create(
        {
          profileId,
          status: "active",
          type
        },
        { transaction }
      ));
    await profile.update({ activeCustomerEntityId: selected.id }, { transaction });
    return selected;
  });
}
