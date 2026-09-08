import { Op, Transaction, UniqueConstraintError } from "sequelize";
import { z } from "zod";
import sequelize from "../../config/database";
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

export interface ManagedProfileOrganization {
  ownerProfileId: string;
  ownerEmail: string | null;
  membership: { role: ManagedProfileMembershipRole; isOwner: boolean };
}

function organizationMembershipConflict(): ManagedProfileMembershipError {
  return new ManagedProfileMembershipError(
    "ORGANIZATION_MEMBERSHIP_CONFLICT",
    409,
    "A profile may belong to only one organization"
  );
}

// Match child operations: configuration before human profiles, then membership rows.
async function lockOrganization(ownerProfileId: string, transaction: Transaction): Promise<User> {
  const options = { lock: Transaction.LOCK.UPDATE, transaction };
  const owner = await ManagedProfileManager.findByPk(ownerProfileId, options);
  const ownerProfile = await User.findByPk(ownerProfileId, { lock: Transaction.LOCK.SHARE, transaction });
  if (!owner?.isActive || ownerProfile?.kind !== "authenticated") throw accessDenied();
  const ownerMembership = await Membership.findOne({
    ...options,
    where: { memberProfileId: ownerProfileId, ownerProfileId, revokedAt: null }
  });
  if (ownerMembership?.role !== "manager") throw accessDenied();
  return ownerProfile;
}

async function requireMember(actorProfileId: string, ownerProfileId: string, manage: boolean, transaction: Transaction) {
  const actor = await User.findByPk(actorProfileId, { lock: Transaction.LOCK.SHARE, transaction });
  const member = await Membership.findOne({
    lock: Transaction.LOCK.UPDATE,
    transaction,
    where: { memberProfileId: actorProfileId, ownerProfileId, revokedAt: null }
  });
  if (actor?.kind !== "authenticated" || !member || !["manager", "read_only"].includes(member.role)) throw accessDenied();
  if (manage && member.role !== "manager") {
    throw new ManagedProfileMembershipError(
      "MANAGED_PROFILE_MANAGER_REQUIRED",
      403,
      "An active manager membership is required"
    );
  }
  return member;
}

export async function getManagedProfileOrganization(actorProfileId: string): Promise<ManagedProfileOrganization | null> {
  try {
    return await sequelize.transaction(async transaction => {
      const locator = await Membership.findOne({ transaction, where: { memberProfileId: actorProfileId, revokedAt: null } });
      if (!locator) return null;
      const owner = await lockOrganization(locator.ownerProfileId, transaction);
      const member = await requireMember(actorProfileId, owner.id, false, transaction);
      return {
        membership: { isOwner: actorProfileId === owner.id, role: member.role },
        ownerEmail: owner.email,
        ownerProfileId: owner.id
      };
    });
  } catch (error) {
    if (error instanceof ManagedProfileMembershipError && error.code === "MANAGED_PROFILE_ACCESS_DENIED") return null;
    throw error;
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
    ownerProfileId: invitation.ownerProfileId,
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
      ownerProfileId: invitation.ownerProfileId,
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

export async function listManagedProfileMembers(actorProfileId: string, ownerProfileId: string, limit: number, offset: number) {
  return sequelize.transaction(async transaction => {
    await lockOrganization(ownerProfileId, transaction);
    await requireMember(actorProfileId, ownerProfileId, false, transaction);
    const { rows, count } = await Membership.findAndCountAll({
      limit,
      offset,
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"]
      ],
      transaction,
      where: { ownerProfileId, revokedAt: null }
    });
    const profiles = await User.findAll({
      attributes: ["id", "email"],
      transaction,
      where: { id: { [Op.in]: rows.map(row => row.memberProfileId) } }
    });
    const emails = new Map(profiles.map(profile => [profile.id, profile.email]));
    return {
      members: rows.map(row => ({
        ...memberResult(row, ownerProfileId),
        email: emails.get(row.memberProfileId) ?? null
      })),
      pagination: { limit, offset, total: count }
    };
  });
}

export async function changeManagedProfileMember(
  actorProfileId: string,
  ownerProfileId: string,
  memberProfileId: string,
  role: unknown
) {
  const nextRole = requireMembershipRole(role);
  return sequelize.transaction(async transaction => {
    await lockOrganization(ownerProfileId, transaction);
    await requireMember(actorProfileId, ownerProfileId, true, transaction);
    if (memberProfileId === ownerProfileId) {
      throw new ManagedProfileMembershipError(
        "MANAGED_PROFILE_OWNER_MEMBERSHIP_REQUIRED",
        409,
        "The owner membership cannot be changed"
      );
    }
    const member = await Membership.findOne({
      lock: Transaction.LOCK.UPDATE,
      transaction,
      where: { memberProfileId, ownerProfileId, revokedAt: null }
    });
    if (!member) throw new ManagedProfileMembershipError("MEMBER_NOT_FOUND", 404, "Member was not found");
    if (member.role !== nextRole) {
      const previousRole = member.role;
      await member.update({ role: nextRole }, { transaction });
      await MembershipEvent.create(
        { action: "role_changed", actorProfileId, memberProfileId, ownerProfileId, previousRole, role: nextRole },
        { transaction }
      );
    }
    return { member: memberResult(member, ownerProfileId) };
  });
}

export async function removeManagedProfileMember(actorProfileId: string, ownerProfileId: string, memberProfileId: string) {
  await sequelize.transaction(async transaction => {
    await lockOrganization(ownerProfileId, transaction);
    await requireMember(actorProfileId, ownerProfileId, true, transaction);
    if (memberProfileId === ownerProfileId) {
      throw new ManagedProfileMembershipError(
        "MANAGED_PROFILE_OWNER_MEMBERSHIP_REQUIRED",
        409,
        "The owner membership cannot be removed"
      );
    }
    const member = await Membership.findOne({
      lock: Transaction.LOCK.UPDATE,
      transaction,
      where: { memberProfileId, ownerProfileId, revokedAt: null }
    });
    if (!member) {
      const removed = await Membership.findOne({
        transaction,
        where: {
          memberProfileId,
          ownerProfileId,
          revokedAt: { [Op.ne]: null },
          revokedByProfileId: actorProfileId
        }
      });
      if (removed) return;
      throw new ManagedProfileMembershipError("MEMBER_NOT_FOUND", 404, "Member was not found");
    }
    await member.update({ revokedAt: new Date(), revokedByProfileId: actorProfileId }, { transaction });
    await MembershipEvent.create(
      { action: "member_removed", actorProfileId, memberProfileId, ownerProfileId, role: member.role },
      { transaction }
    );
  });
}

export async function createManagedProfileInvitation(
  actorProfileId: string,
  ownerProfileId: string,
  input: { email: unknown; role: unknown }
) {
  const email = normalizeMembershipEmail(input.email);
  const role = requireMembershipRole(input.role);
  const result = await sequelize.transaction(async transaction => {
    await lockOrganization(ownerProfileId, transaction);
    await requireMember(actorProfileId, ownerProfileId, true, transaction);
    const pending = await Invitation.findOne({
      lock: Transaction.LOCK.UPDATE,
      logging: false,
      transaction,
      where: { acceptedAt: null, cancelledAt: null, email, expiredAt: null, ownerProfileId }
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
    // Only disclose membership already visible in this organization's roster, never profile existence.
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
        where: { memberProfileId: existingProfile.id, ownerProfileId, revokedAt: null }
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
        ownerProfileId,
        role
      },
      { logging: false, transaction }
    );
    await MembershipEvent.create(
      { action: "invited", actorProfileId, invitationId: invitation.id, ownerProfileId, role },
      { transaction }
    );
    await enqueueManagedProfileInvitation({ invitationId: invitation.id, recipientEmail: email }, transaction);
    return { created: true, invitation: invitationResult(invitation) };
  });
  if (result instanceof ManagedProfileMembershipError) throw result;
  return result;
}

export async function listManagedProfileInvitations(
  actorProfileId: string,
  ownerProfileId: string,
  limit: number,
  offset: number
) {
  return sequelize.transaction(async transaction => {
    await lockOrganization(ownerProfileId, transaction);
    await requireMember(actorProfileId, ownerProfileId, false, transaction);
    const elapsed = await Invitation.findAll({
      lock: Transaction.LOCK.UPDATE,
      logging: false,
      transaction,
      where: {
        acceptedAt: null,
        cancelledAt: null,
        expiredAt: null,
        expiresAt: { [Op.lte]: new Date() },
        ownerProfileId
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
      where: { ownerProfileId }
    });
    return { invitations: rows.map(invitationResult), pagination: { limit, offset, total: count } };
  });
}

export async function cancelManagedProfileInvitation(actorProfileId: string, ownerProfileId: string, invitationId: string) {
  const result = await sequelize.transaction(async transaction => {
    await lockOrganization(ownerProfileId, transaction);
    await requireMember(actorProfileId, ownerProfileId, true, transaction);
    const invitation = await Invitation.findOne({
      lock: Transaction.LOCK.UPDATE,
      logging: false,
      transaction,
      where: { id: invitationId, ownerProfileId }
    });
    if (!invitation) throw new ManagedProfileMembershipError("INVITATION_NOT_FOUND", 404, "Invitation was not found");
    await expireInvitation(invitation, transaction);
    if (invitationStatus(invitation) !== "pending") return terminalInvitation(invitation);
    await invitation.update({ cancelledAt: new Date(), cancelledByProfileId: actorProfileId }, { logging: false, transaction });
    await MembershipEvent.create(
      { action: "invitation_cancelled", actorProfileId, invitationId, ownerProfileId, role: invitation.role },
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
  const result = await sequelize
    .transaction(async transaction => {
      const locator = await Invitation.findByPk(invitationId, { logging: false, transaction });
      if (!locator || locator.email !== email) throw accessDenied();
      // Lock existing configurations in stable order before human rows. The invitee's
      // NO KEY UPDATE lock also serializes creation of a previously absent configuration,
      // without blocking the KEY SHARE locks taken by audit foreign keys.
      for (const id of [...new Set([locator.ownerProfileId, principal.profileId])].sort()) {
        await ManagedProfileManager.findByPk(id, { lock: Transaction.LOCK.UPDATE, transaction });
      }
      const owner = await lockOrganization(locator.ownerProfileId, transaction);
      const actor = await User.findByPk(principal.profileId, { lock: Transaction.LOCK.NO_KEY_UPDATE, transaction });
      const invitation = await Invitation.findByPk(invitationId, {
        lock: Transaction.LOCK.UPDATE,
        logging: false,
        transaction
      });
      if (!invitation || invitation.email !== email || actor?.kind !== "authenticated") throw accessDenied();
      await expireInvitation(invitation, transaction);
      if (!accept) {
        const inviter = await User.findByPk(invitation.invitedByProfileId, { attributes: ["id", "email"], transaction });
        return {
          invitation: invitationResult(invitation),
          inviter: { email: inviter?.email ?? null, profileId: invitation.invitedByProfileId },
          organization: { ownerEmail: owner.email, ownerProfileId: owner.id }
        };
      }
      const membership = await Membership.findOne({
        lock: Transaction.LOCK.UPDATE,
        transaction,
        where: { memberProfileId: actor.id, revokedAt: null }
      });
      if (
        invitation.acceptedAt &&
        invitation.acceptedByProfileId === actor.id &&
        membership?.ownerProfileId === owner.id &&
        membership.role === invitation.role
      ) {
        return { member: memberResult(membership, owner.id), ownerProfileId: owner.id };
      }
      // Return conflicts from the callback so observed expiry and its event commit before rejection.
      if (invitationStatus(invitation) !== "pending") return terminalInvitation(invitation);
      if (
        (membership && membership.ownerProfileId !== owner.id) ||
        (actor.id !== owner.id && (await ManagedProfileManager.findByPk(actor.id, { transaction })))
      )
        return organizationMembershipConflict();
      if (membership)
        return new ManagedProfileMembershipError("MEMBERSHIP_ALREADY_EXISTS", 409, "An active membership already exists");
      const role = requireMembershipRole(invitation.role);
      const member = await Membership.create(
        { createdByProfileId: invitation.invitedByProfileId, memberProfileId: actor.id, ownerProfileId: owner.id, role },
        { transaction }
      );
      await invitation.update({ acceptedAt: new Date(), acceptedByProfileId: actor.id }, { logging: false, transaction });
      await MembershipEvent.bulkCreate(
        [
          {
            action: "member_added",
            actorProfileId: actor.id,
            invitationId,
            memberProfileId: actor.id,
            ownerProfileId: owner.id,
            role
          },
          {
            action: "invitation_accepted",
            actorProfileId: actor.id,
            invitationId,
            memberProfileId: actor.id,
            ownerProfileId: owner.id,
            role
          }
        ],
        { transaction }
      );
      return { member: memberResult(member, owner.id), ownerProfileId: owner.id };
    })
    .catch(error => {
      if (
        error instanceof UniqueConstraintError &&
        "constraint" in error.original &&
        error.original.constraint === "uq_managed_profile_memberships_active"
      ) {
        throw organizationMembershipConflict();
      }
      throw error;
    });
  if (result instanceof ManagedProfileMembershipError) throw result;
  return result;
}

export async function listManagedProfileMemberEvents(
  actorProfileId: string,
  ownerProfileId: string,
  limit: number,
  cursor?: string
) {
  return sequelize.transaction(async transaction => {
    await lockOrganization(ownerProfileId, transaction);
    await requireMember(actorProfileId, ownerProfileId, false, transaction);
    if (cursor && !(await MembershipEvent.findOne({ transaction, where: { id: cursor, ownerProfileId } }))) {
      throw new ManagedProfileMembershipError("INVALID_PAGINATION", 400, "Cursor must identify an event in this organization");
    }
    const events = await MembershipEvent.findAll({
      limit: limit + 1,
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"]
      ],
      transaction,
      where: {
        ownerProfileId,
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
