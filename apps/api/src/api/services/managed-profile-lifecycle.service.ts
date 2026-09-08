import { type Includeable, literal, Op, Transaction } from "sequelize";
import sequelize from "../../config/database";
import ApiCredential from "../../models/apiCredential.model";
import CustomerEntity, { type CustomerEntityType } from "../../models/customerEntity.model";
import ManagedProfile, {
  type ManagedProfileCreationSource,
  type ManagedProfileStatus
} from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import ManagedProfileMembership, { type ManagedProfileMembershipRole } from "../../models/managedProfileMembership.model";
import User from "../../models/user.model";
import { getManagedProfileOrganization } from "./managed-profile-membership.service";
import { provisionManagedProfile } from "./managed-profile-provisioning.service";

export class ManagedProfileLifecycleError extends Error {
  constructor(
    readonly code:
      | "MANAGED_PROFILE_ACCESS_DENIED"
      | "MANAGED_PROFILE_CONFLICT"
      | "MANAGED_PROFILE_INVALID_INPUT"
      | "MANAGED_PROFILE_MEMBERSHIP_INVALID"
      | "MANAGED_PROFILE_OWNER_REQUIRED"
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
  actor: ManagedProfileActor;
  limit: number;
  managedProfiles: ManagedProfileAccessResult[];
  offset: number;
  total: number;
}

export interface ManagedProfileActor {
  canProvisionManagedProfiles: boolean;
  hasMemberships: boolean;
  profileId: string;
}

export interface ManagedProfileAccessResult extends ManagedProfileLifecycleResult {
  membership: {
    isOwner: boolean;
    role: ManagedProfileMembershipRole;
  };
  policy: {
    allowedCorridors: ManagedProfileManager["allowedCorridors"];
    allowedCustomerTypes: ManagedProfileManager["allowedCustomerTypes"];
  };
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

function toAccessResult(
  relationship: ManagedProfile,
  customerType: CustomerEntityType,
  membership: ManagedProfileMembership,
  manager: ManagedProfileManager
): ManagedProfileAccessResult {
  return {
    ...toResultWithCustomerType(relationship, customerType),
    membership: {
      isOwner: relationship.managerProfileId === membership.memberProfileId,
      role: membership.role
    },
    policy: {
      allowedCorridors: manager.allowedCorridors,
      allowedCustomerTypes: manager.allowedCustomerTypes
    }
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

function eligibleMembershipIncludes(actorProfileId: string): Includeable[] {
  return [
    {
      as: "manager",
      include: [
        {
          as: "memberships",
          model: ManagedProfileMembership,
          required: true,
          where: { memberProfileId: actorProfileId, revokedAt: null, role: ["manager", "read_only"] }
        }
      ],
      model: ManagedProfileManager,
      required: true,
      where: { isActive: true }
    },
    {
      as: "profile",
      include: [
        {
          as: "activeCustomerEntity",
          model: CustomerEntity,
          required: true,
          where: { profileId: { [Op.col]: "ManagedProfile.profile_id" }, status: "active" }
        }
      ],
      model: User,
      required: true,
      where: {
        kind: "managed",
        [Op.and]: literal(
          '(SELECT COUNT(*) FROM "customer_entities" AS "entities" WHERE "entities"."profile_id" = "ManagedProfile"."profile_id") = 1'
        )
      }
    }
  ];
}

export async function getManagedProfileActor(actorProfileId: string): Promise<ManagedProfileActor> {
  const [actorManager, organization] = await Promise.all([
    ManagedProfileManager.findByPk(actorProfileId),
    getManagedProfileOrganization(actorProfileId)
  ]);
  return {
    canProvisionManagedProfiles: actorManager?.isActive === true,
    hasMemberships: organization !== null,
    profileId: actorProfileId
  };
}

export async function listManagedProfiles(
  actorProfileId: string,
  options: { limit: number; offset: number; status: ManagedProfileStatus | "all" }
): Promise<ManagedProfileListResult> {
  const actor = await getManagedProfileActor(actorProfileId);
  if (options.status !== "active" && !actor.canProvisionManagedProfiles) {
    throw new ManagedProfileLifecycleError(
      "MANAGED_PROFILE_OWNER_REQUIRED",
      "Retained managed profiles require an active owner configuration"
    );
  }
  const where = {
    ...(options.status === "active" ? {} : { managerProfileId: actorProfileId }),
    ...(options.status === "all" ? {} : { status: options.status })
  };
  const { count, rows } = await ManagedProfile.findAndCountAll({
    distinct: true,
    include: eligibleMembershipIncludes(actorProfileId),
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
    actor,
    limit: options.limit,
    managedProfiles: rows.map(relationship => {
      const profileEntities = entitiesByProfileId.get(relationship.profileId) ?? [];
      if (profileEntities.length !== 1) {
        throw new ManagedProfileLifecycleError(
          "MANAGED_PROFILE_CONFLICT",
          "The managed profile does not have exactly one customer entity"
        );
      }
      const manager = relationship.get("manager") as ManagedProfileManager | undefined;
      const memberships = manager?.get("memberships") as ManagedProfileMembership[] | undefined;
      const membership = memberships?.[0];
      if (!membership || !manager) {
        throw new ManagedProfileLifecycleError("MANAGED_PROFILE_CONFLICT", "Managed profile access data is incomplete");
      }
      return toAccessResult(relationship, profileEntities[0].type, membership, manager);
    }),
    offset: options.offset,
    total: count
  };
}

export async function getManagedProfile(
  actorProfileId: string,
  profileId: string,
  { bootstrap = false }: { bootstrap?: boolean } = {}
): Promise<ManagedProfileAccessResult> {
  const [relationship, subject, entities] = await Promise.all([
    ManagedProfile.findOne({ where: { profileId } }),
    User.findByPk(profileId, { attributes: ["kind", "activeCustomerEntityId"] }),
    CustomerEntity.findAll({ where: { profileId } })
  ]);
  const membership =
    relationship &&
    (await ManagedProfileMembership.findOne({
      where: { memberProfileId: actorProfileId, ownerProfileId: relationship.managerProfileId, revokedAt: null }
    }));
  const manager = relationship && (await ManagedProfileManager.findByPk(relationship.managerProfileId));
  if (
    !membership ||
    !["manager", "read_only"].includes(membership.role) ||
    !relationship ||
    !manager?.isActive ||
    subject?.kind !== "managed" ||
    entities.length !== 1 ||
    entities[0].id !== subject.activeCustomerEntityId ||
    entities[0].status !== "active" ||
    (relationship.status === "deleted" && (bootstrap || relationship.managerProfileId !== actorProfileId))
  ) {
    // A selector is not prior access: the child must have existed during a stored organization membership interval.
    if (
      bootstrap &&
      relationship &&
      (await ManagedProfileMembership.count({
        where: {
          createdAt: { [Op.lte]: relationship.deletedAt ?? new Date() },
          memberProfileId: actorProfileId,
          ownerProfileId: relationship.managerProfileId,
          [Op.or]: [{ revokedAt: null }, { revokedAt: { [Op.gt]: relationship.createdAt } }]
        }
      })) > 0
    ) {
      throw new ManagedProfileLifecycleError(
        "MANAGED_PROFILE_MEMBERSHIP_INVALID",
        "The managed-profile membership is no longer eligible"
      );
    }
    if (!membership || !relationship || relationship.status === "deleted") {
      throw new ManagedProfileLifecycleError("MANAGED_PROFILE_NOT_FOUND", "Managed profile was not found");
    }
    throw new ManagedProfileLifecycleError("MANAGED_PROFILE_ACCESS_DENIED", "Managed profile access is denied");
  }
  return toAccessResult(relationship, entities[0].type, membership, manager);
}

export async function deleteManagedProfile(managerProfileId: string, profileId: string): Promise<void> {
  await sequelize.transaction(async transaction => {
    const locator = await ManagedProfile.findOne({ transaction, where: { profileId } });
    if (!locator) {
      throw new ManagedProfileLifecycleError("MANAGED_PROFILE_NOT_FOUND", "Managed profile was not found");
    }
    // Provisioning serializes on the manager row, so taking it here too keeps a concurrent
    // re-provision from observing this child mid-deletion. Manager first in both paths.
    const owner = await ManagedProfileManager.findByPk(locator.managerProfileId, {
      lock: Transaction.LOCK.UPDATE,
      transaction
    });
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
      where: { managerProfileId: locator.managerProfileId, profileId }
    });
    if (!relationship) {
      throw new ManagedProfileLifecycleError("MANAGED_PROFILE_NOT_FOUND", "Managed profile was not found");
    }
    if (relationship.managerProfileId !== managerProfileId) {
      const membership = await ManagedProfileMembership.findOne({
        lock: Transaction.LOCK.UPDATE,
        transaction,
        where: { memberProfileId: managerProfileId, ownerProfileId: relationship.managerProfileId, revokedAt: null }
      });
      if (membership && ["manager", "read_only"].includes(membership.role)) {
        throw new ManagedProfileLifecycleError(
          "MANAGED_PROFILE_OWNER_REQUIRED",
          "Only the immutable owner may delete a managed profile"
        );
      }
      throw new ManagedProfileLifecycleError("MANAGED_PROFILE_NOT_FOUND", "Managed profile was not found");
    }
    if (!owner?.isActive) {
      throw new ManagedProfileLifecycleError("MANAGED_PROFILE_ACCESS_DENIED", "Managed profile access is denied");
    }
    if (relationship.status === "deleted") return;

    const deletedAt = new Date();
    await relationship.update({ deletedAt, status: "deleted" }, { transaction });
    await ApiCredential.update({ revokedAt: deletedAt }, { transaction, where: { profileId, revokedAt: { [Op.is]: null } } });
  });
}
