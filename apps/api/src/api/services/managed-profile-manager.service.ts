import type { CorridorCountry, CorridorCustomerType } from "@vortexfi/shared";
import { Transaction, UniqueConstraintError } from "sequelize";
import sequelize from "../../config/database";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import Membership from "../../models/managedProfileMembership.model";
import MembershipEvent from "../../models/managedProfileMembershipEvent.model";
import User from "../../models/user.model";

export class ManagedProfileManagerError extends Error {
  constructor(
    readonly code:
      | "MANAGED_PROFILE_MANAGER_NOT_FOUND"
      | "MANAGED_PROFILE_MANAGER_PROFILE_INVALID"
      | "PROFILE_NOT_FOUND"
      | "ORGANIZATION_MEMBERSHIP_CONFLICT",
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
  const configured = await sequelize
    .transaction(async transaction => {
      // Same order as invitation acceptance and child lifecycle: existing configuration,
      // then the person. The person lock also serializes first-time configuration creation.
      const existing = await ManagedProfileManager.findByPk(input.profileId, {
        lock: Transaction.LOCK.UPDATE,
        transaction
      });
      const profile = await User.findByPk(input.profileId, {
        lock: Transaction.LOCK.NO_KEY_UPDATE,
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

      const membership = await Membership.findOne({
        transaction,
        where: { memberProfileId: profile.id, revokedAt: null }
      });
      if (membership && membership.ownerProfileId !== profile.id) {
        throw new ManagedProfileManagerError(
          "ORGANIZATION_MEMBERSHIP_CONFLICT",
          "A profile may belong to only one organization"
        );
      }
      // If a first configuration appeared while waiting on the person, release and
      // reacquire in configuration-first order rather than upgrading in reverse order.
      if (!existing && (await ManagedProfileManager.findByPk(input.profileId, { transaction }))) return null;
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
      // ADMIN_SECRET authenticates the system, not the owner receiving this grant.
      await Membership.create({ memberProfileId: profile.id, ownerProfileId: profile.id, role: "manager" }, { transaction });
      await MembershipEvent.create(
        {
          action: "member_added",
          memberProfileId: profile.id,
          ownerProfileId: profile.id,
          role: "manager"
        },
        { transaction }
      );
      return { created: true, manager: result(manager) };
    })
    .catch(error => {
      if (
        error instanceof UniqueConstraintError &&
        "constraint" in error.original &&
        error.original.constraint === "uq_managed_profile_memberships_active"
      ) {
        throw new ManagedProfileManagerError(
          "ORGANIZATION_MEMBERSHIP_CONFLICT",
          "A profile may belong to only one organization"
        );
      }
      throw error;
    });
  return configured ?? configureManagedProfileManager(input);
}

export async function getManagedProfileManager(profileId: string): Promise<ManagedProfileManagerResult> {
  const manager = await ManagedProfileManager.findByPk(profileId);
  if (!manager) {
    throw new ManagedProfileManagerError("MANAGED_PROFILE_MANAGER_NOT_FOUND", "Managed profile manager was not found");
  }
  return result(manager);
}
