import Joi from "joi";
import { Transaction } from "sequelize";
import sequelize from "../../config/database";
import type { CustomerEntityType } from "../../models/customerEntity.model";
import CustomerEntity from "../../models/customerEntity.model";
import ManagedProfile, { type ManagedProfileCreationSource } from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import User from "../../models/user.model";
import { assignPartnerAttribution } from "./partners/partner-attribution.service";

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
  /** Partner attribution of the acting API credential; fixes partner pricing to the new profile. */
  attributingPartnerId?: string | null;
  contactEmail: string;
  creationSource: ManagedProfileCreationSource;
  customerType: CustomerEntityType;
  externalSubjectId: string;
  managerProfileId: string;
}

export interface ProvisionManagedProfileResult {
  contactEmail: string;
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
  contactEmail: string,
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

  if (
    relationship.status !== "active" ||
    relationship.contactEmail !== contactEmail ||
    !customerEntity ||
    customerEntity.type !== customerType
  ) {
    throw new ManagedProfileProvisioningError(
      "MANAGED_PROFILE_CONFLICT",
      "The external subject ID is already associated with different profile data"
    );
  }

  return {
    contactEmail,
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
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (!externalSubjectId || Joi.string().email().max(255).required().validate(contactEmail).error) {
    throw new ManagedProfileProvisioningError(
      "MANAGED_PROFILE_INVALID_INPUT",
      "externalSubjectId must be non-empty and contactEmail must be a valid email address"
    );
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
    // Operations are narrowed at request time too, but a child the manager could never operate
    // is only a dead record, so refuse it at the point of creation.
    if (manager.allowedCustomerTypes !== null && !manager.allowedCustomerTypes.includes(input.customerType)) {
      throw new ManagedProfileProvisioningError(
        "MANAGED_PROFILE_INVALID_INPUT",
        "The manager is not allowed to provision this customer type"
      );
    }

    const existing = await ManagedProfile.findOne({
      transaction,
      where: { externalSubjectId, managerProfileId: input.managerProfileId }
    });
    if (existing) return existingResult(existing, contactEmail, input.customerType, transaction);

    const existingContactEmail = await ManagedProfile.findOne({
      transaction,
      where: { contactEmail, managerProfileId: input.managerProfileId }
    });
    if (existingContactEmail) {
      throw new ManagedProfileProvisioningError(
        "MANAGED_PROFILE_CONFLICT",
        "The contact email is already associated with another managed profile"
      );
    }

    const profile = await User.create({ email: null, id: crypto.randomUUID(), kind: "managed" }, { transaction });
    const customerEntity = await CustomerEntity.create(
      { profileId: profile.id, status: "active", type: input.customerType },
      { transaction }
    );
    await profile.update({ activeCustomerEntityId: customerEntity.id }, { transaction });
    const relationship = await ManagedProfile.create(
      {
        contactEmail,
        creationSource: input.creationSource,
        externalSubjectId,
        managerProfileId: input.managerProfileId,
        profileId: profile.id
      },
      { transaction }
    );

    // Attribution applies only at creation — an existing relationship returned above keeps
    // whatever pricing assignment it was (or was not) provisioned with.
    if (input.attributingPartnerId) {
      await assignPartnerAttribution(profile.id, input.attributingPartnerId, transaction);
    }

    return {
      contactEmail,
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
