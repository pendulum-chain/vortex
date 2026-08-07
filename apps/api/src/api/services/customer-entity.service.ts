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
    if (profile.kind === "managed") {
      throw new APIError({
        isPublic: true,
        message: "A managed profile's customer entity type cannot be changed",
        status: httpStatus.CONFLICT,
        type: "MANAGED_PROFILE_ENTITY_TYPE_IMMUTABLE"
      });
    }
  }

  if (!type) {
    // Without an explicit active-entity selection, type-less callers get the profile's
    // default entity. Once a profile has both an individual and a business entity,
    // resolution must not depend on row order — the oldest entity is the one created at
    // sign-up (or by the 038 backfill).
    const existing = await CustomerEntity.findOne({
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"]
      ],
      where: { profileId }
    });
    if (existing) {
      return existing;
    }
  }

  const [entity] = await CustomerEntity.findOrCreate({
    defaults: {
      profileId,
      status: "active",
      type: type ?? "individual"
    },
    where: { profileId, type: type ?? "individual" }
  });
  return entity;
}

/**
 * All customer entity ids owned by a profile, oldest first. Read-only counterpart to
 * getOrCreateCustomerEntityForProfile for lookup/ownership paths: migration 040 attached
 * legacy business provider rows to the profile's individual entity, so a row's owning
 * entity does not reliably carry the row's customer_type — callers that filter provider
 * rows by customer_type must scope by every entity the profile owns, and a pure lookup
 * must not leave an empty entity behind.
 */
export async function findCustomerEntityIdsForProfile(profileId: string): Promise<string[]> {
  const entities = await CustomerEntity.findAll({
    attributes: ["id"],
    order: [
      ["createdAt", "ASC"],
      ["id", "ASC"]
    ],
    where: { profileId }
  });
  return entities.map(entity => entity.id);
}

export async function selectActiveCustomerEntity(
  profileId: string,
  type: CustomerEntityType,
  existingTransaction?: Transaction
): Promise<CustomerEntity> {
  const select = async (transaction: Transaction): Promise<CustomerEntity> => {
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
  };

  return existingTransaction ? select(existingTransaction) : sequelize.transaction(select);
}
