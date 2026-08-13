import type { CorridorCountry, CorridorCustomerType } from "@vortexfi/shared";
import { Transaction } from "sequelize";
import sequelize from "../../config/database";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import User from "../../models/user.model";

export class ManagedProfileManagerError extends Error {
  constructor(
    readonly code: "MANAGED_PROFILE_MANAGER_NOT_FOUND" | "MANAGED_PROFILE_MANAGER_PROFILE_INVALID" | "PROFILE_NOT_FOUND",
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export interface ManagedProfileManagerResult {
  allowedCorridors: CorridorCountry[];
  allowedCustomerTypes: CorridorCustomerType[] | null;
  createdAt: Date;
  isActive: boolean;
  profileId: string;
  updatedAt: Date;
}

function result(manager: ManagedProfileManager): ManagedProfileManagerResult {
  return {
    allowedCorridors: manager.allowedCorridors,
    allowedCustomerTypes: manager.allowedCustomerTypes,
    createdAt: manager.createdAt,
    isActive: manager.isActive,
    profileId: manager.profileId,
    updatedAt: manager.updatedAt
  };
}

export async function configureManagedProfileManager(input: {
  allowedCorridors: CorridorCountry[];
  allowedCustomerTypes: CorridorCustomerType[] | null;
  isActive: boolean;
  profileId: string;
}): Promise<{ created: boolean; manager: ManagedProfileManagerResult }> {
  return sequelize.transaction(async transaction => {
    const profile = await User.findByPk(input.profileId, {
      lock: Transaction.LOCK.UPDATE,
      transaction
    });
    if (!profile) {
      throw new ManagedProfileManagerError("PROFILE_NOT_FOUND", "Profile was not found");
    }
    if (profile.kind !== "authenticated") {
      throw new ManagedProfileManagerError(
        "MANAGED_PROFILE_MANAGER_PROFILE_INVALID",
        "Only authenticated profiles can be managed profile managers"
      );
    }

    const existing = await ManagedProfileManager.findByPk(input.profileId, { transaction });
    if (existing) {
      await existing.update(
        {
          allowedCorridors: input.allowedCorridors,
          allowedCustomerTypes: input.allowedCustomerTypes,
          isActive: input.isActive
        },
        { transaction }
      );
      return { created: false, manager: result(existing) };
    }

    const manager = await ManagedProfileManager.create(input, { transaction });
    return { created: true, manager: result(manager) };
  });
}

export async function getManagedProfileManager(profileId: string): Promise<ManagedProfileManagerResult> {
  const manager = await ManagedProfileManager.findByPk(profileId);
  if (!manager) {
    throw new ManagedProfileManagerError("MANAGED_PROFILE_MANAGER_NOT_FOUND", "Managed profile manager was not found");
  }
  return result(manager);
}
