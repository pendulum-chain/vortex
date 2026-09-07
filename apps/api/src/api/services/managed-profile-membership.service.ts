import { Op, Transaction } from "sequelize";
import { z } from "zod";
import sequelize from "../../config/database";
import CustomerEntity from "../../models/customerEntity.model";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import Membership, { type ManagedProfileMembershipRole } from "../../models/managedProfileMembership.model";
import MembershipEvent from "../../models/managedProfileMembershipEvent.model";
import Invitation from "../../models/managedProfileMembershipInvitation.model";
import User from "../../models/user.model";
import { SupabaseAuthService } from "./auth";
import { enqueueManagedProfileInvitation } from "./email/notification.service";

export class ManagedProfileMembershipError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ManagedProfileMembershipError";
  }
}

function accessDenied(): ManagedProfileMembershipError {
  return new ManagedProfileMembershipError("MANAGED_PROFILE_ACCESS_DENIED", 403, "Managed-profile access is denied");
}

export function requireMembershipRole(role: unknown): ManagedProfileMembershipRole {
  if (role !== "manager" && role !== "read_only") {
    throw new ManagedProfileMembershipError("INVALID_MEMBERSHIP_ROLE", 400, "Role must be manager or read_only");
  }
  return role;
}

export function normalizeMembershipEmail(email: unknown): string {
  const result = z.string().trim().toLowerCase().max(254).email().safeParse(email);
  if (!result.success) {
    throw new ManagedProfileMembershipError("INVALID_INVITATION_EMAIL", 400, "A valid email is required");
  }
  return result.data;
}

// Match provisioning/deletion: owner configuration, owner profile, child profile/aggregate,
// then invitation/membership rows. The initial relationship lookup is only a lock locator.
async function lockChild(profileId: string, transaction: Transaction): Promise<ManagedProfile> {
  const locator = await ManagedProfile.findOne({ transaction, where: { profileId } });
  if (!locator) throw accessDenied();
  const options = { lock: Transaction.LOCK.UPDATE, transaction };
  const owner = await ManagedProfileManager.findByPk(locator.managerProfileId, options);
  // Human profiles are read-only here. SHARE protects kind changes while allowing
  // reciprocal owners/invitees and the KEY SHARE locks taken by audit/profile FKs.
  const ownerProfile = await User.findByPk(locator.managerProfileId, { lock: Transaction.LOCK.SHARE, transaction });
  const child = await User.findByPk(profileId, options);
  const relationship = await ManagedProfile.findOne({ ...options, where: { profileId } });
  if (
    !owner?.isActive ||
    ownerProfile?.kind !== "authenticated" ||
    child?.kind !== "managed" ||
    !child.activeCustomerEntityId ||
    relationship?.status !== "active" ||
    relationship.managerProfileId !== locator.managerProfileId
  )
    throw accessDenied();
  const entities = await CustomerEntity.findAll({ ...options, where: { profileId } });
  if (entities.length !== 1 || entities[0].id !== child.activeCustomerEntityId || entities[0].status !== "active") {
    throw accessDenied();
  }
  const ownerMembership = await Membership.findOne({
    ...options,
    where: { managedProfileId: profileId, memberProfileId: ownerProfile.id, revokedAt: null }
  });
  if (ownerMembership?.role !== "manager") throw accessDenied();
  return relationship;
}

async function requireMember(actorProfileId: string, profileId: string, manage: boolean, transaction: Transaction) {
  const actor = await User.findByPk(actorProfileId, { lock: Transaction.LOCK.SHARE, transaction });
  const member = await Membership.findOne({
    lock: Transaction.LOCK.UPDATE,
    transaction,
    where: { managedProfileId: profileId, memberProfileId: actorProfileId, revokedAt: null }
  });
  if (actor?.kind !== "authenticated" || !member || !["manager", "read_only"].includes(member.role)) throw accessDenied();
  if (manage && member.role !== "manager") {
    throw new ManagedProfileMembershipError(
      "MANAGED_PROFILE_MANAGER_REQUIRED",
      403,
      "An active manager membership is required"
    );
  }
}

function invitationStatus(invitation: Invitation) {
  return invitation.acceptedAt
    ? "accepted"
    : invitation.cancelledAt
      ? "cancelled"
      : invitation.expiredAt
        ? "expired"
        : "pending";
}

function invitationResult(invitation: Invitation) {
  return {
    acceptedAt: invitation.acceptedAt,
    cancelledAt: invitation.cancelledAt,
    createdAt: invitation.createdAt,
    email: invitation.email,
    expiredAt: invitation.expiredAt,
    expiresAt: invitation.expiresAt,
    id: invitation.id,
    invitedByProfileId: invitation.invitedByProfileId,
    managedProfileId: invitation.managedProfileId,
    role: invitation.role,
    status: invitationStatus(invitation)
  };
}

function memberResult(member: Membership, ownerProfileId: string) {
  return {
    createdAt: member.createdAt,
    id: member.id,
    isOwner: member.memberProfileId === ownerProfileId,
    memberProfileId: member.memberProfileId,
    role: member.role,
    updatedAt: member.updatedAt
  };
}

async function expireInvitation(invitation: Invitation, transaction: Transaction): Promise<void> {
  if (invitationStatus(invitation) !== "pending" || invitation.expiresAt.getTime() > Date.now()) return;
  await invitation.update({ expiredAt: invitation.expiresAt }, { logging: false, transaction });
  await MembershipEvent.create(
    {
      action: "invitation_expired",
      invitationId: invitation.id,
      managedProfileId: invitation.managedProfileId,
      role: invitation.role
    },
    { transaction }
  );
}

function terminalInvitation(invitation: Invitation) {
  return new ManagedProfileMembershipError(
    `INVITATION_${invitationStatus(invitation).toUpperCase()}`,
    409,
    "The invitation is no longer pending"
  );
}

export async function listManagedProfileMembers(actorProfileId: string, profileId: string, limit: number, offset: number) {
  return sequelize.transaction(async transaction => {
    const child = await lockChild(profileId, transaction);
    await requireMember(actorProfileId, profileId, false, transaction);
    const { rows, count } = await Membership.findAndCountAll({
      limit,
      offset,
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"]
      ],
      transaction,
      where: { managedProfileId: profileId, revokedAt: null }
    });
    const profiles = await User.findAll({
      attributes: ["id", "email"],
      transaction,
      where: { id: { [Op.in]: rows.map(row => row.memberProfileId) } }
    });
    const emails = new Map(profiles.map(profile => [profile.id, profile.email]));
    return {
      members: rows.map(row => ({
        ...memberResult(row, child.managerProfileId),
        email: emails.get(row.memberProfileId) ?? null
      })),
      pagination: { limit, offset, total: count }
    };
  });
}

export async function changeManagedProfileMember(
  actorProfileId: string,
  profileId: string,
  memberProfileId: string,
  role: unknown
) {
  const nextRole = requireMembershipRole(role);
  return sequelize.transaction(async transaction => {
    const child = await lockChild(profileId, transaction);
    await requireMember(actorProfileId, profileId, true, transaction);
    if (memberProfileId === child.managerProfileId) {
      throw new ManagedProfileMembershipError(
        "MANAGED_PROFILE_OWNER_MEMBERSHIP_REQUIRED",
        409,
        "The owner membership cannot be changed"
      );
    }
    const member = await Membership.findOne({
      lock: Transaction.LOCK.UPDATE,
      transaction,
      where: { managedProfileId: profileId, memberProfileId, revokedAt: null }
    });
    if (!member) throw new ManagedProfileMembershipError("MEMBER_NOT_FOUND", 404, "Member was not found");
    if (member.role !== nextRole) {
      const previousRole = member.role;
      await member.update({ role: nextRole }, { transaction });
      await MembershipEvent.create(
        { action: "role_changed", actorProfileId, managedProfileId: profileId, memberProfileId, previousRole, role: nextRole },
        { transaction }
      );
    }
    return { member: memberResult(member, child.managerProfileId) };
  });
}

export async function removeManagedProfileMember(actorProfileId: string, profileId: string, memberProfileId: string) {
  await sequelize.transaction(async transaction => {
    const child = await lockChild(profileId, transaction);
    await requireMember(actorProfileId, profileId, true, transaction);
    if (memberProfileId === child.managerProfileId) {
      throw new ManagedProfileMembershipError(
        "MANAGED_PROFILE_OWNER_MEMBERSHIP_REQUIRED",
        409,
        "The owner membership cannot be removed"
      );
    }
    const member = await Membership.findOne({
      lock: Transaction.LOCK.UPDATE,
      transaction,
      where: { managedProfileId: profileId, memberProfileId, revokedAt: null }
    });
    if (!member) {
      const removed = await Membership.findOne({
        transaction,
        where: {
          managedProfileId: profileId,
          memberProfileId,
          revokedAt: { [Op.ne]: null },
          revokedByProfileId: actorProfileId
        }
      });
      if (removed) return;
      throw new ManagedProfileMembershipError("MEMBER_NOT_FOUND", 404, "Member was not found");
    }
    await member.update({ revokedAt: new Date(), revokedByProfileId: actorProfileId }, { transaction });
    await MembershipEvent.create(
      { action: "member_removed", actorProfileId, managedProfileId: profileId, memberProfileId, role: member.role },
      { transaction }
    );
  });
}

export async function createManagedProfileInvitation(
  actorProfileId: string,
  profileId: string,
  input: { email: unknown; role: unknown }
) {
  const email = normalizeMembershipEmail(input.email);
  const role = requireMembershipRole(input.role);
  const result = await sequelize.transaction(async transaction => {
    await lockChild(profileId, transaction);
    await requireMember(actorProfileId, profileId, true, transaction);
    const pending = await Invitation.findOne({
      lock: Transaction.LOCK.UPDATE,
      logging: false,
      transaction,
      where: { acceptedAt: null, cancelledAt: null, email, expiredAt: null, managedProfileId: profileId }
    });
    if (pending) {
      await expireInvitation(pending, transaction);
      if (invitationStatus(pending) === "pending") {
        if (pending.role !== role)
          return new ManagedProfileMembershipError(
            "INVITATION_ROLE_CONFLICT",
            409,
            "Cancel the pending invitation before changing its role"
          );
        return { created: false, invitation: invitationResult(pending) };
      }
    }
    // Only disclose membership already visible in this child's roster, never profile existence.
    const existingProfile = await User.findOne({
      logging: false,
      transaction,
      where: {
        kind: "authenticated",
        [Op.and]: sequelize.where(sequelize.fn("lower", sequelize.fn("trim", sequelize.col("email"))), email)
      }
    });
    if (
      existingProfile &&
      (await Membership.findOne({
        transaction,
        where: { managedProfileId: profileId, memberProfileId: existingProfile.id, revokedAt: null }
      }))
    ) {
      // Local email is only a hint: it may belong to someone else since the member
      // changed their login. An unconfirmed lookup must not veto an email-bound invite;
      // acceptance still requires the current verified principal and checks membership.
      const current = await SupabaseAuthService.getUserProfile(existingProfile.id).catch(() => null);
      if (
        current?.id === existingProfile.id &&
        current.email_confirmed_at &&
        Number.isFinite(Date.parse(current.email_confirmed_at)) &&
        current.email?.trim().toLowerCase() === email
      ) {
        return new ManagedProfileMembershipError("MEMBERSHIP_ALREADY_EXISTS", 409, "An active membership already exists");
      }
    }
    const invitation = await Invitation.create(
      {
        email,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedByProfileId: actorProfileId,
        managedProfileId: profileId,
        role
      },
      { logging: false, transaction }
    );
    await MembershipEvent.create(
      { action: "invited", actorProfileId, invitationId: invitation.id, managedProfileId: profileId, role },
      { transaction }
    );
    await enqueueManagedProfileInvitation({ invitationId: invitation.id, recipientEmail: email }, transaction);
    return { created: true, invitation: invitationResult(invitation) };
  });
  if (result instanceof ManagedProfileMembershipError) throw result;
  return result;
}

export async function listManagedProfileInvitations(actorProfileId: string, profileId: string, limit: number, offset: number) {
  return sequelize.transaction(async transaction => {
    await lockChild(profileId, transaction);
    await requireMember(actorProfileId, profileId, false, transaction);
    const elapsed = await Invitation.findAll({
      lock: Transaction.LOCK.UPDATE,
      logging: false,
      transaction,
      where: {
        acceptedAt: null,
        cancelledAt: null,
        expiredAt: null,
        expiresAt: { [Op.lte]: new Date() },
        managedProfileId: profileId
      }
    });
    for (const invitation of elapsed) await expireInvitation(invitation, transaction);
    const { rows, count } = await Invitation.findAndCountAll({
      limit,
      logging: false,
      offset,
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"]
      ],
      transaction,
      where: { managedProfileId: profileId }
    });
    return { invitations: rows.map(invitationResult), pagination: { limit, offset, total: count } };
  });
}

export async function cancelManagedProfileInvitation(actorProfileId: string, profileId: string, invitationId: string) {
  const result = await sequelize.transaction(async transaction => {
    await lockChild(profileId, transaction);
    await requireMember(actorProfileId, profileId, true, transaction);
    const invitation = await Invitation.findOne({
      lock: Transaction.LOCK.UPDATE,
      logging: false,
      transaction,
      where: { id: invitationId, managedProfileId: profileId }
    });
    if (!invitation) throw new ManagedProfileMembershipError("INVITATION_NOT_FOUND", 404, "Invitation was not found");
    await expireInvitation(invitation, transaction);
    if (invitationStatus(invitation) !== "pending") return terminalInvitation(invitation);
    await invitation.update({ cancelledAt: new Date(), cancelledByProfileId: actorProfileId }, { logging: false, transaction });
    await MembershipEvent.create(
      { action: "invitation_cancelled", actorProfileId, invitationId, managedProfileId: profileId, role: invitation.role },
      { transaction }
    );
  });
  if (result instanceof ManagedProfileMembershipError) throw result;
}

export interface ManagedProfileInvitee {
  profileId: string;
  email?: string;
  emailConfirmedAt?: string;
}

export async function readOrAcceptManagedProfileInvitation(
  principal: ManagedProfileInvitee,
  invitationId: string,
  accept: boolean
) {
  if (!principal.emailConfirmedAt || !Number.isFinite(Date.parse(principal.emailConfirmedAt))) throw accessDenied();
  let email: string;
  try {
    email = normalizeMembershipEmail(principal.email);
  } catch {
    throw accessDenied();
  }
  const result = await sequelize.transaction(async transaction => {
    const locator = await Invitation.findByPk(invitationId, { logging: false, transaction });
    if (!locator || locator.email !== email) throw accessDenied();
    const child = await lockChild(locator.managedProfileId, transaction);
    const invitation = await Invitation.findByPk(invitationId, { lock: Transaction.LOCK.UPDATE, logging: false, transaction });
    const actor = await User.findByPk(principal.profileId, { lock: Transaction.LOCK.SHARE, transaction });
    if (!invitation || invitation.email !== email || actor?.kind !== "authenticated") throw accessDenied();
    await expireInvitation(invitation, transaction);
    if (!accept) {
      const inviter = await User.findByPk(invitation.invitedByProfileId, { attributes: ["id", "email"], transaction });
      return {
        invitation: invitationResult(invitation),
        inviter: { email: inviter?.email ?? null, profileId: invitation.invitedByProfileId },
        managedProfile: { externalSubjectId: child.externalSubjectId, profileId: child.profileId }
      };
    }
    const membership = await Membership.findOne({
      lock: Transaction.LOCK.UPDATE,
      transaction,
      where: { managedProfileId: child.profileId, memberProfileId: actor.id, revokedAt: null }
    });
    if (invitation.acceptedAt && invitation.acceptedByProfileId === actor.id && membership?.role === invitation.role) {
      return { managedProfileId: child.profileId, member: memberResult(membership, child.managerProfileId) };
    }
    // Return conflicts from the callback so observed expiry and its event commit before rejection.
    if (invitationStatus(invitation) !== "pending") return terminalInvitation(invitation);
    if (membership)
      return new ManagedProfileMembershipError("MEMBERSHIP_ALREADY_EXISTS", 409, "An active membership already exists");
    const role = requireMembershipRole(invitation.role);
    const member = await Membership.create(
      { createdByProfileId: invitation.invitedByProfileId, managedProfileId: child.profileId, memberProfileId: actor.id, role },
      { transaction }
    );
    await invitation.update({ acceptedAt: new Date(), acceptedByProfileId: actor.id }, { logging: false, transaction });
    await MembershipEvent.bulkCreate(
      [
        {
          action: "member_added",
          actorProfileId: actor.id,
          invitationId,
          managedProfileId: child.profileId,
          memberProfileId: actor.id,
          role
        },
        {
          action: "invitation_accepted",
          actorProfileId: actor.id,
          invitationId,
          managedProfileId: child.profileId,
          memberProfileId: actor.id,
          role
        }
      ],
      { transaction }
    );
    return { managedProfileId: child.profileId, member: memberResult(member, child.managerProfileId) };
  });
  if (result instanceof ManagedProfileMembershipError) throw result;
  return result;
}

export async function listManagedProfileMemberEvents(
  actorProfileId: string,
  profileId: string,
  limit: number,
  cursor?: string
) {
  return sequelize.transaction(async transaction => {
    await lockChild(profileId, transaction);
    await requireMember(actorProfileId, profileId, false, transaction);
    if (cursor && !(await MembershipEvent.findOne({ transaction, where: { id: cursor, managedProfileId: profileId } }))) {
      throw new ManagedProfileMembershipError(
        "INVALID_PAGINATION",
        400,
        "Cursor must identify an event in this managed profile"
      );
    }
    const events = await MembershipEvent.findAll({
      limit: limit + 1,
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"]
      ],
      transaction,
      where: {
        managedProfileId: profileId,
        ...(cursor
          ? {
              // Compare in PostgreSQL, preserving timestamp precision and a stable UUID tie-breaker.
              [Op.and]: sequelize.literal(
                `("created_at", "id") < (SELECT "created_at", "id" FROM "managed_profile_membership_events" WHERE "id" = ${sequelize.escape(cursor)})`
              )
            }
          : {})
      }
    });
    const page = events.slice(0, limit);
    return {
      events: page.map(event => ({
        action: event.action,
        actorProfileId: event.actorProfileId,
        createdAt: event.createdAt,
        id: event.id,
        invitationId: event.invitationId,
        memberProfileId: event.memberProfileId,
        previousRole: event.previousRole,
        role: event.role
      })),
      pagination: { limit, nextCursor: events.length > limit ? page[page.length - 1].id : null }
    };
  });
}
