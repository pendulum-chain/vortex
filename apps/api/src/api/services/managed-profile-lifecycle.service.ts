import { Op, Transaction } from "sequelize";
import sequelize from "../../config/database";
import ApiCredential from "../../models/apiCredential.model";
import CustomerEntity, { type CustomerEntityType } from "../../models/customerEntity.model";
import ManagedProfile, {
  type ManagedProfileCreationSource,
  type ManagedProfileStatus
} from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import User from "../../models/user.model";
import { provisionManagedProfile } from "./managed-profile-provisioning.service";

export class ManagedProfileLifecycleError extends Error {
  constructor(
    readonly code:
      | "MANAGED_PROFILE_ACCESS_DENIED"
      | "MANAGED_PROFILE_CONFLICT"
      | "MANAGED_PROFILE_INVALID_INPUT"
      | "MANAGED_PROFILE_NOT_FOUND",
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export interface ManagedProfileLifecycleResult {
  contactEmail: string | null;
  createdAt: Date;
  creationSource: ManagedProfileCreationSource;
  customerType: CustomerEntityType;
  deletedAt: Date | null;
  externalSubjectId: string;
  profileId: string;
  status: ManagedProfileStatus;
  updatedAt: Date;
}

export interface ManagedProfileListResult {
  limit: number;
  managedProfiles: ManagedProfileLifecycleResult[];
  offset: number;
  total: number;
}

async function requireActiveManager(managerProfileId: string, transaction?: Transaction): Promise<void> {
  const manager = await ManagedProfileManager.findByPk(managerProfileId, { transaction });
  if (!manager?.isActive) {
    throw new ManagedProfileLifecycleError(
      "MANAGED_PROFILE_ACCESS_DENIED",
      "The authenticated profile is not an active managed-profile manager"
    );
  }
}

async function toResult(relationship: ManagedProfile, transaction?: Transaction): Promise<ManagedProfileLifecycleResult> {
  const entities = await CustomerEntity.findAll({
    attributes: ["type"],
    transaction,
    where: { profileId: relationship.profileId }
  });
  if (entities.length !== 1) {
    throw new ManagedProfileLifecycleError(
      "MANAGED_PROFILE_CONFLICT",
      "The managed profile does not have exactly one customer entity"
    );
  }

  return toResultWithCustomerType(relationship, entities[0].type);
}

function toResultWithCustomerType(
  relationship: ManagedProfile,
  customerType: CustomerEntityType
): ManagedProfileLifecycleResult {
  return {
    contactEmail: relationship.contactEmail,
    createdAt: relationship.createdAt,
    creationSource: relationship.creationSource,
    customerType,
    deletedAt: relationship.deletedAt,
    externalSubjectId: relationship.externalSubjectId,
    profileId: relationship.profileId,
    status: relationship.status,
    updatedAt: relationship.updatedAt
  };
}

export async function createManagedProfile(input: {
  contactEmail: string;
  creationSource: ManagedProfileCreationSource;
  customerType: CustomerEntityType;
  externalSubjectId: string;
  managerProfileId: string;
}): Promise<{ created: boolean; managedProfile: ManagedProfileLifecycleResult }> {
  const provisioned = await provisionManagedProfile(input);
  const relationship = await ManagedProfile.findByPk(provisioned.id);
  if (!relationship) {
    throw new ManagedProfileLifecycleError("MANAGED_PROFILE_NOT_FOUND", "Managed profile was not found after provisioning");
  }
  return { created: provisioned.created, managedProfile: await toResult(relationship) };
}

export async function listManagedProfiles(
  managerProfileId: string,
  options: { limit: number; offset: number; status: ManagedProfileStatus | "all" }
): Promise<ManagedProfileListResult> {
  await requireActiveManager(managerProfileId);
  const where = {
    managerProfileId,
    ...(options.status === "all" ? {} : { status: options.status })
  };
  const { count, rows } = await ManagedProfile.findAndCountAll({
    limit: options.limit,
    offset: options.offset,
    order: [["createdAt", "DESC"]],
    where
  });
  const entities = await CustomerEntity.findAll({
    attributes: ["profileId", "type"],
    where: { profileId: { [Op.in]: rows.map(relationship => relationship.profileId) } }
  });
  const entitiesByProfileId = new Map<string, CustomerEntity[]>();
  for (const entity of entities) {
    if (!entity.profileId) continue;
    const profileEntities = entitiesByProfileId.get(entity.profileId) ?? [];
    profileEntities.push(entity);
    entitiesByProfileId.set(entity.profileId, profileEntities);
  }

  return {
    limit: options.limit,
    managedProfiles: rows.map(relationship => {
      const profileEntities = entitiesByProfileId.get(relationship.profileId) ?? [];
      if (profileEntities.length !== 1) {
        throw new ManagedProfileLifecycleError(
          "MANAGED_PROFILE_CONFLICT",
          "The managed profile does not have exactly one customer entity"
        );
      }
      return toResultWithCustomerType(relationship, profileEntities[0].type);
    }),
    offset: options.offset,
    total: count
  };
}

export async function getManagedProfile(managerProfileId: string, profileId: string): Promise<ManagedProfileLifecycleResult> {
  await requireActiveManager(managerProfileId);
  const relationship = await ManagedProfile.findOne({ where: { managerProfileId, profileId } });
  if (!relationship) {
    throw new ManagedProfileLifecycleError("MANAGED_PROFILE_NOT_FOUND", "Managed profile was not found");
  }
  return toResult(relationship);
}

export async function deleteManagedProfile(managerProfileId: string, profileId: string): Promise<void> {
  await sequelize.transaction(async transaction => {
    await requireActiveManager(managerProfileId, transaction);
    const profile = await User.findByPk(profileId, {
      attributes: ["id"],
      lock: Transaction.LOCK.UPDATE,
      transaction
    });
    if (!profile) {
      throw new ManagedProfileLifecycleError("MANAGED_PROFILE_NOT_FOUND", "Managed profile was not found");
    }
    const relationship = await ManagedProfile.findOne({
      lock: Transaction.LOCK.UPDATE,
      transaction,
      where: { managerProfileId, profileId }
    });
    if (!relationship) {
      throw new ManagedProfileLifecycleError("MANAGED_PROFILE_NOT_FOUND", "Managed profile was not found");
    }
    if (relationship.status === "deleted") return;

    const deletedAt = new Date();
    await relationship.update({ deletedAt, status: "deleted" }, { transaction });
    await ApiCredential.update({ revokedAt: deletedAt }, { transaction, where: { profileId, revokedAt: { [Op.is]: null } } });
  });
}
