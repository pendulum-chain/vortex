import { Transaction } from "sequelize";
import sequelize from "../../config/database";
import type { CustomerEntityType } from "../../models/customerEntity.model";
import CustomerEntity from "../../models/customerEntity.model";
import ManagedProfile, { type ManagedProfileCreationSource } from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import User from "../../models/user.model";

export class ManagedProfileProvisioningError extends Error {
  constructor(
    readonly code:
      | "MANAGED_PROFILE_CONFLICT"
      | "MANAGED_PROFILE_INVALID_INPUT"
      | "MANAGED_PROFILE_MANAGER_INACTIVE"
      | "MANAGED_PROFILE_MANAGER_NOT_FOUND",
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export interface ProvisionManagedProfileInput {
  creationSource: ManagedProfileCreationSource;
  customerType: CustomerEntityType;
  externalSubjectId: string;
  managerProfileId: string;
}

export interface ProvisionManagedProfileResult {
  created: boolean;
  creationSource: ManagedProfileCreationSource;
  customerEntityId: string;
  customerType: CustomerEntityType;
  externalSubjectId: string;
  id: string;
  managerProfileId: string;
  profileId: string;
}

async function existingResult(
  relationship: ManagedProfile,
  customerType: CustomerEntityType,
  transaction: Transaction
): Promise<ProvisionManagedProfileResult> {
  const profile = await User.findByPk(relationship.profileId, { transaction });
  const customerEntity = profile?.activeCustomerEntityId
    ? await CustomerEntity.findOne({
        transaction,
        where: { id: profile.activeCustomerEntityId, profileId: relationship.profileId }
      })
    : null;

  if (relationship.status !== "active" || !customerEntity || customerEntity.type !== customerType) {
    throw new ManagedProfileProvisioningError(
      "MANAGED_PROFILE_CONFLICT",
      "The external subject ID is already associated with different profile data"
    );
  }

  return {
    created: false,
    creationSource: relationship.creationSource,
    customerEntityId: customerEntity.id,
    customerType: customerEntity.type,
    externalSubjectId: relationship.externalSubjectId,
    id: relationship.id,
    managerProfileId: relationship.managerProfileId,
    profileId: relationship.profileId
  };
}

export async function provisionManagedProfile(input: ProvisionManagedProfileInput): Promise<ProvisionManagedProfileResult> {
  const externalSubjectId = input.externalSubjectId.trim();
  if (!externalSubjectId) {
    throw new ManagedProfileProvisioningError("MANAGED_PROFILE_INVALID_INPUT", "externalSubjectId must be a non-empty string");
  }

  return sequelize.transaction(async transaction => {
    const manager = await ManagedProfileManager.findByPk(input.managerProfileId, {
      lock: Transaction.LOCK.UPDATE,
      transaction
    });
    if (!manager) {
      throw new ManagedProfileProvisioningError("MANAGED_PROFILE_MANAGER_NOT_FOUND", "Managed profile manager not found");
    }
    if (!manager.isActive) {
      throw new ManagedProfileProvisioningError("MANAGED_PROFILE_MANAGER_INACTIVE", "Managed profile manager is inactive");
    }

    const existing = await ManagedProfile.findOne({
      transaction,
      where: { externalSubjectId, managerProfileId: input.managerProfileId }
    });
    if (existing) return existingResult(existing, input.customerType, transaction);

    const profile = await User.create({ email: null, id: crypto.randomUUID(), kind: "managed" }, { transaction });
    const customerEntity = await CustomerEntity.create(
      { profileId: profile.id, status: "active", type: input.customerType },
      { transaction }
    );
    await profile.update({ activeCustomerEntityId: customerEntity.id }, { transaction });
    const relationship = await ManagedProfile.create(
      {
        creationSource: input.creationSource,
        externalSubjectId,
        managerProfileId: input.managerProfileId,
        profileId: profile.id
      },
      { transaction }
    );

    return {
      created: true,
      creationSource: relationship.creationSource,
      customerEntityId: customerEntity.id,
      customerType: customerEntity.type,
      externalSubjectId: relationship.externalSubjectId,
      id: relationship.id,
      managerProfileId: relationship.managerProfileId,
      profileId: relationship.profileId
    };
  });
}
