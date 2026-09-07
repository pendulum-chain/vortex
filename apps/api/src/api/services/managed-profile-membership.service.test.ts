import { afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Transaction } from "sequelize";
import sequelize from "../../config/database";
import { config } from "../../config/vars";
import EmailNotification from "../../models/emailNotification.model";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import Membership from "../../models/managedProfileMembership.model";
import MembershipEvent from "../../models/managedProfileMembershipEvent.model";
import Invitation from "../../models/managedProfileMembershipInvitation.model";
import User from "../../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestUser } from "../../test-utils/factories";
import { SupabaseAuthService } from "./auth";
import * as notifications from "./email/notification.service";
import { deleteManagedProfile } from "./managed-profile-lifecycle.service";
import {
  cancelManagedProfileInvitation,
  changeManagedProfileMember,
  createManagedProfileInvitation,
  listManagedProfileInvitations,
  listManagedProfileMemberEvents,
  listManagedProfileMembers,
  readOrAcceptManagedProfileInvitation,
  removeManagedProfileMember
} from "./managed-profile-membership.service";
import { provisionManagedProfile } from "./managed-profile-provisioning.service";

describe("managed-profile membership transactions", () => {
  const originalDashboardUrl = config.dashboardPublicUrl;
  let owner: User;
  let invitee: User;
  let child: string;
  const email = "invitee@example.com";
  const principal = () => ({ profileId: invitee.id, email, emailConfirmedAt: "2026-09-01T00:00:00Z" });
  const invite = (role = "manager", recipient = email, actor = owner.id) =>
    createManagedProfileInvitation(actor, child, { email: recipient, role });
  const accept = (id: string) => readOrAcceptManagedProfileInvitation(principal(), id, true);
  const eventCount = (action: string) => MembershipEvent.count({ where: { managedProfileId: child, action } });

  beforeAll(setupTestDatabase);
  beforeEach(async () => {
    config.dashboardPublicUrl = "https://dashboard.example.com";
    await resetTestDatabase();
    owner = await createTestUser();
    invitee = await createTestUser({ email: "stale@example.com" });
    await ManagedProfileManager.create({ allowedCorridors: ["BR"], isActive: true, profileId: owner.id });
    child = (
      await provisionManagedProfile({
        contactEmail: "child@example.com",
        creationSource: "manager",
        customerType: "business",
        externalSubjectId: "company",
        managerProfileId: owner.id
      })
    ).profileId;
  });
  afterEach(() => {
    mock.restore();
    config.dashboardPublicUrl = originalDashboardUrl;
  });

  it("normalizes creation, persists seven-day expiry and atomically queues one mail for concurrent duplicates", async () => {
    const start = Date.now();
    const settled = await Promise.allSettled([invite("manager", "  Invitee@Example.COM  "), invite()]);
    const results = settled.map(result => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
    expect(results.map(result => result.created).sort()).toEqual([false, true]);
    expect(results[0].invitation.id).toBe(results[1].invitation.id);
    expect(results[0].invitation.email).toBe(email);
    expect(results[0].invitation.expiresAt.getTime()).toBeGreaterThanOrEqual(start + 7 * 86400000);
    expect(await Invitation.count()).toBe(1);
    expect(await eventCount("invited")).toBe(1);
    expect(await EmailNotification.count({ where: { recipientEmail: email, resourceId: results[0].invitation.id } })).toBe(1);
  });

  it("does not distinguish existing and unregistered nonmember emails", async () => {
    const existing = await invite("read_only", invitee.email!);
    const unknown = await invite("read_only", "unregistered@example.com");
    expect(existing.created).toBe(true);
    expect(unknown.created).toBe(true);
    expect(Object.keys(existing.invitation)).toEqual(Object.keys(unknown.invitation));
    expect(await EmailNotification.count()).toBe(2);
  });

  it("does not let a member's stale local email veto the current mailbox holder's invitation", async () => {
    const staleMember = await createTestUser({ email });
    await Membership.create({ managedProfileId: child, memberProfileId: staleMember.id, role: "manager" });
    const lookup = spyOn(SupabaseAuthService, "getUserProfile").mockResolvedValue({
      id: staleMember.id,
      email: "changed@example.com",
      email_confirmed_at: "2026-09-01T00:00:00Z"
    } as never);

    const { invitation } = await invite();
    expect(lookup).toHaveBeenCalledWith(staleMember.id);
    expect(await accept(invitation.id)).toMatchObject({ member: { memberProfileId: invitee.id, role: "manager" } });
    expect(await Membership.count({ where: { managedProfileId: child, revokedAt: null } })).toBe(3);
    expect(await EmailNotification.count({ where: { recipientEmail: email } })).toBe(1);
  });

  it("returns 409 only after confirming an existing member's current verified Supabase email", async () => {
    await Membership.create({ managedProfileId: child, memberProfileId: invitee.id, role: "manager" });
    const lookup = spyOn(SupabaseAuthService, "getUserProfile").mockResolvedValue({
      id: invitee.id,
      email: "  STALE@EXAMPLE.COM ",
      email_confirmed_at: "2026-09-01T00:00:00Z"
    } as never);
    await expect(invite("manager", invitee.email!)).rejects.toMatchObject({ code: "MEMBERSHIP_ALREADY_EXISTS", status: 409 });
    expect(lookup).toHaveBeenCalledWith(invitee.id);
    expect(await Invitation.count()).toBe(0);
    expect(await EmailNotification.count()).toBe(0);
  });

  for (const confirmation of ["unverified", "wrong_profile", "invalid_timestamp", "unavailable"] as const) {
    it(`does not veto an invitation on a ${confirmation} member email lookup`, async () => {
      await Membership.create({ managedProfileId: child, memberProfileId: invitee.id, role: "manager" });
      const lookup = spyOn(SupabaseAuthService, "getUserProfile");
      if (confirmation === "unavailable") lookup.mockRejectedValue(new Error("Auth lookup unavailable"));
      else
        lookup.mockResolvedValue({
          id: confirmation === "wrong_profile" ? crypto.randomUUID() : invitee.id,
          email: invitee.email,
          email_confirmed_at:
            confirmation === "unverified"
              ? undefined
              : confirmation === "invalid_timestamp"
                ? "invalid"
                : "2026-09-01T00:00:00Z"
        } as never);
      expect((await invite("manager", invitee.email!)).created).toBe(true);
      expect(await EmailNotification.count()).toBe(1);
      expect(await Membership.count()).toBe(2);
      expect(await eventCount("invitation_accepted")).toBe(0);
    });
  }

  for (const accepting of [false, true]) {
    it(`allows reciprocal owners to ${accepting ? "accept" : "preview"} concurrently without deadlock`, async () => {
      await ManagedProfileManager.create({ allowedCorridors: ["BR"], isActive: true, profileId: invitee.id });
      const otherChild = (
        await provisionManagedProfile({
          contactEmail: "other-child@example.com",
          creationSource: "manager",
          customerType: "business",
          externalSubjectId: "other-company",
          managerProfileId: invitee.id
        })
      ).profileId;
      const toInvitee = await invite();
      const toOwner = await createManagedProfileInvitation(invitee.id, otherChild, { email: owner.email!, role: "manager" });
      const original = ManagedProfile.findOne.bind(ManagedProfile);
      let release!: () => void;
      const bothChildrenLocked = new Promise<void>(resolve => {
        release = resolve;
      });
      let arrivals = 0;
      spyOn(ManagedProfile, "findOne").mockImplementation(async options => {
        const row = await original(options);
        if (options?.lock) {
          if (++arrivals === 2) release();
          await bothChildrenLocked;
        }
        return row;
      });

      // Both transactions hold their owner/child locks before either requests the opposite human profile.
      const results = await Promise.allSettled([
        readOrAcceptManagedProfileInvitation(principal(), toInvitee.invitation.id, accepting),
        readOrAcceptManagedProfileInvitation(
          { profileId: owner.id, email: owner.email!, emailConfirmedAt: principal().emailConfirmedAt },
          toOwner.invitation.id,
          accepting
        )
      ]);
      expect(results.map(result => (result.status === "rejected" ? result.reason : result.status))).toEqual([
        "fulfilled",
        "fulfilled"
      ]);
      expect(arrivals).toBe(2);
      expect(await Membership.count()).toBe(accepting ? 4 : 2);
      expect(await MembershipEvent.count({ where: { action: "invitation_accepted" } })).toBe(accepting ? 2 : 0);
    });
  }

  it("keeps owner and invitee profile changes blocked while their kinds authorize a preview", async () => {
    const { invitation } = await invite();
    const original = User.findByPk.bind(User);
    let reached!: () => void;
    let release!: () => void;
    const actorLocked = new Promise<void>(resolve => {
      reached = resolve;
    });
    const finishPreview = new Promise<void>(resolve => {
      release = resolve;
    });
    spyOn(User, "findByPk").mockImplementation(async (id, options) => {
      const row = await original(id, options);
      if (id === invitee.id && options?.lock) {
        reached();
        await finishPreview;
      }
      return row;
    });
    const preview = readOrAcceptManagedProfileInvitation(principal(), invitation.id, false).then(
      result => result,
      error => error
    );
    try {
      await actorLocked;
      for (const id of [owner.id, invitee.id]) {
        // Non-key profile changes (including kind) take NO KEY UPDATE, which KEY SHARE alone would allow.
        await expect(
          sequelize.transaction(transaction =>
            sequelize.query("SELECT id FROM profiles WHERE id = :id FOR NO KEY UPDATE NOWAIT", {
              replacements: { id },
              transaction
            })
          )
        ).rejects.toMatchObject({ original: { code: "55P03" } });
      }
    } finally {
      release();
      await preview;
    }
    expect(await preview).toMatchObject({ invitation: { status: "pending" } });
  });

  for (const operation of ["invite", "role_change"] as const) {
    it(`allows reciprocal owner-managers to ${operation} without foreign-key deadlocks`, async () => {
      await ManagedProfileManager.create({ allowedCorridors: ["BR"], isActive: true, profileId: invitee.id });
      const otherChild = (
        await provisionManagedProfile({
          contactEmail: "other-child@example.com",
          creationSource: "manager",
          customerType: "business",
          externalSubjectId: "other-company",
          managerProfileId: invitee.id
        })
      ).profileId;
      const target = await createTestUser();
      await Membership.bulkCreate([
        { managedProfileId: child, memberProfileId: invitee.id, role: "manager" },
        { managedProfileId: otherChild, memberProfileId: owner.id, role: "manager" },
        { managedProfileId: child, memberProfileId: target.id, role: "manager" },
        { managedProfileId: otherChild, memberProfileId: target.id, role: "manager" }
      ]);
      const original = ManagedProfile.findOne.bind(ManagedProfile);
      let release!: () => void;
      const bothChildrenLocked = new Promise<void>(resolve => {
        release = resolve;
      });
      let arrivals = 0;
      spyOn(ManagedProfile, "findOne").mockImplementation(async options => {
        const row = await original(options);
        if (options?.lock) {
          if (++arrivals === 2) release();
          await bothChildrenLocked;
        }
        return row;
      });
      const results = await Promise.allSettled(
        operation === "invite"
          ? [
              createManagedProfileInvitation(invitee.id, child, { email: "new-member@example.com", role: "manager" }),
              createManagedProfileInvitation(owner.id, otherChild, { email: "new-member@example.com", role: "manager" })
            ]
          : [
              changeManagedProfileMember(invitee.id, child, target.id, "read_only"),
              changeManagedProfileMember(owner.id, otherChild, target.id, "read_only")
            ]
      );
      expect(results.map(result => (result.status === "rejected" ? result.reason : result.status))).toEqual([
        "fulfilled",
        "fulfilled"
      ]);
      expect(arrivals).toBe(2);
      expect(await MembershipEvent.count({ where: { action: operation === "invite" ? "invited" : "role_changed" } })).toBe(2);
    });
  }

  it("requires cancellation before changing a pending role and never sends a duplicate", async () => {
    const first = await invite();
    await expect(invite("read_only")).rejects.toMatchObject({ code: "INVITATION_ROLE_CONFLICT" });
    expect(await EmailNotification.count()).toBe(1);
    await cancelManagedProfileInvitation(owner.id, child, first.invitation.id);
    const replacement = await invite("read_only");
    expect(replacement.invitation.id).not.toBe(first.invitation.id);
    expect(await eventCount("invitation_cancelled")).toBe(1);
  });

  it("rolls invitation and audit back when enqueue fails", async () => {
    spyOn(notifications, "enqueueManagedProfileInvitation").mockRejectedValue(new Error("queue unavailable"));
    await expect(invite()).rejects.toThrow("queue unavailable");
    expect(await Invitation.count()).toBe(0);
    expect(await eventCount("invited")).toBe(0);
  });

  it("rejects unknown roles and malformed emails without writes", async () => {
    for (const role of ["owner", "admin", "MANAGER", "", null, {}]) {
      await expect(createManagedProfileInvitation(owner.id, child, { email, role })).rejects.toMatchObject({
        code: "INVALID_MEMBERSHIP_ROLE"
      });
      await expect(changeManagedProfileMember(owner.id, child, invitee.id, role)).rejects.toMatchObject({
        code: "INVALID_MEMBERSHIP_ROLE"
      });
    }
    for (const recipient of ["invalid", "a\nb@example.com", "a@@example.com", `${"a".repeat(256)}@example.com`, undefined]) {
      await expect(
        createManagedProfileInvitation(owner.id, child, { email: recipient, role: "manager" })
      ).rejects.toMatchObject({ code: "INVALID_INVITATION_EMAIL" });
    }
    expect(await Invitation.count()).toBe(0);
  });

  it("uses the current verified email, not stale profile email, and preview does not grant access", async () => {
    const { invitation } = await invite();
    expect(
      await readOrAcceptManagedProfileInvitation({ ...principal(), email: "  INVITEE@example.com " }, invitation.id, false)
    ).toMatchObject({ invitation: { status: "pending", role: "manager" }, managedProfile: { profileId: child } });
    expect(await Membership.count({ where: { memberProfileId: invitee.id } })).toBe(0);
    const result = await accept(invitation.id);
    expect(result).toMatchObject({
      member: { memberProfileId: invitee.id, role: "manager", isOwner: false },
      managedProfileId: child
    });
    expect(await eventCount("invitation_accepted")).toBe(1);
    const events = await MembershipEvent.findAll({ where: { invitationId: invitation.id, memberProfileId: invitee.id } });
    expect(events).toHaveLength(2);
    expect(events.every(event => event.actorProfileId === invitee.id && event.subjectEmail === null)).toBe(true);
  });

  it("denies mismatched, unverified, malformed confirmation, and managed invitees without details or expiry writes", async () => {
    const { invitation } = await invite();
    await Invitation.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: invitation.id } });
    for (const actor of [
      { ...principal(), email: invitee.email! },
      { ...principal(), emailConfirmedAt: undefined },
      { ...principal(), emailConfirmedAt: "invalid" },
      { ...principal(), email: undefined },
      { ...principal(), profileId: child }
    ]) {
      for (const accepting of [false, true]) {
        await expect(readOrAcceptManagedProfileInvitation(actor, invitation.id, accepting)).rejects.toMatchObject({
          code: "MANAGED_PROFILE_ACCESS_DENIED"
        });
      }
    }
    expect(await eventCount("invitation_expired")).toBe(0);
    await expect(accept(crypto.randomUUID())).rejects.toMatchObject({ code: "MANAGED_PROFILE_ACCESS_DENIED" });
  });

  it("serializes concurrent acceptance and replays without duplicate memberships or events", async () => {
    const { invitation } = await invite();
    const [first, second] = await Promise.all([accept(invitation.id), accept(invitation.id)]);
    expect(second).toEqual(first);
    expect(await accept(invitation.id)).toEqual(first);
    expect(await Membership.count({ where: { memberProfileId: invitee.id, revokedAt: null } })).toBe(1);
    expect(await eventCount("member_added")).toBe(2); // Includes provisioning's owner event.
    expect(await eventCount("invitation_accepted")).toBe(1);
  });

  it("does not replay an accepted grant after downgrade or removal and creates a fresh row for a new grant", async () => {
    const { invitation } = await invite();
    await accept(invitation.id);
    const original = await Membership.findOne({ where: { memberProfileId: invitee.id, revokedAt: null } });
    await changeManagedProfileMember(owner.id, child, invitee.id, "read_only");
    await expect(accept(invitation.id)).rejects.toMatchObject({ code: "INVITATION_ACCEPTED" });
    await removeManagedProfileMember(owner.id, child, invitee.id);
    await expect(accept(invitation.id)).rejects.toMatchObject({ code: "INVITATION_ACCEPTED" });
    const replacement = await invite();
    await accept(replacement.invitation.id);
    const active = await Membership.findOne({ where: { memberProfileId: invitee.id, revokedAt: null } });
    expect(active?.id).not.toBe(original?.id);
    expect(await Membership.count({ where: { memberProfileId: invitee.id } })).toBe(2);
    expect((await original?.reload())?.revokedAt).toBeInstanceOf(Date);
  });

  it("rejects acceptance if a different existing membership would be overwritten", async () => {
    const { invitation } = await invite();
    await Membership.create({ managedProfileId: child, memberProfileId: invitee.id, role: "read_only" });
    await expect(accept(invitation.id)).rejects.toMatchObject({ code: "MEMBERSHIP_ALREADY_EXISTS" });
    expect(await eventCount("invitation_accepted")).toBe(0);
    expect((await Invitation.findByPk(invitation.id))?.acceptedAt).toBeNull();
  });

  for (const observe of ["accept", "preview", "list", "cancel", "create"] as const) {
    it(`persists expiry exactly once when observed by ${observe}, including rejected mutations`, async () => {
      const { invitation } = await invite();
      const deadline = new Date(Date.now() - 1000);
      await Invitation.update({ expiresAt: deadline }, { where: { id: invitation.id } });
      if (observe === "accept") await expect(accept(invitation.id)).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });
      if (observe === "cancel")
        await expect(cancelManagedProfileInvitation(owner.id, child, invitation.id)).rejects.toMatchObject({
          code: "INVITATION_EXPIRED"
        });
      if (observe === "preview")
        expect(await readOrAcceptManagedProfileInvitation(principal(), invitation.id, false)).toMatchObject({
          invitation: { status: "expired" }
        });
      if (observe === "list")
        expect((await listManagedProfileInvitations(owner.id, child, 50, 0)).invitations[0].status).toBe("expired");
      if (observe === "create") expect((await invite()).invitation.id).not.toBe(invitation.id);
      await expect(accept(invitation.id)).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });
      expect((await Invitation.findByPk(invitation.id))?.expiredAt).toEqual(deadline);
      expect(await eventCount("invitation_expired")).toBe(1);
    });
  }

  it("commits expired predecessor even when replacement conflicts with an active membership", async () => {
    const { invitation } = await invite("manager", invitee.email!);
    await Invitation.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: invitation.id } });
    await Membership.create({ managedProfileId: child, memberProfileId: invitee.id, role: "manager" });
    spyOn(SupabaseAuthService, "getUserProfile").mockResolvedValue({
      id: invitee.id,
      email: invitee.email,
      email_confirmed_at: "2026-09-01T00:00:00Z"
    } as never);
    await expect(invite("manager", invitee.email!)).rejects.toMatchObject({ code: "MEMBERSHIP_ALREADY_EXISTS" });
    expect(await eventCount("invitation_expired")).toBe(1);
    expect((await Invitation.findByPk(invitation.id))?.expiredAt).toBeInstanceOf(Date);
  });

  it("serializes cancellation versus acceptance with exactly one terminal event", async () => {
    const { invitation } = await invite();
    const results = await Promise.allSettled([
      cancelManagedProfileInvitation(owner.id, child, invitation.id),
      accept(invitation.id)
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await eventCount("invitation_cancelled")) + (await eventCount("invitation_accepted"))).toBe(1);
    const terminal = await Invitation.findByPk(invitation.id);
    if (terminal?.cancelledAt) await expect(accept(invitation.id)).rejects.toMatchObject({ code: "INVITATION_CANCELLED" });
    await expect(cancelManagedProfileInvitation(owner.id, child, invitation.id)).rejects.toMatchObject({ status: 409 });
  });

  it("rolls acceptance and membership back if the atomic history write fails", async () => {
    const { invitation } = await invite();
    spyOn(MembershipEvent, "bulkCreate").mockRejectedValue(new Error("audit unavailable"));
    await expect(accept(invitation.id)).rejects.toThrow("audit unavailable");
    expect(await Membership.count({ where: { memberProfileId: invitee.id } })).toBe(0);
    expect((await Invitation.findByPk(invitation.id))?.acceptedAt).toBeNull();
  });

  it("allows invited managers but rechecks downgraded and revoked authority for every operation", async () => {
    const { invitation } = await invite();
    await accept(invitation.id);
    await invite("read_only", "other@example.com", invitee.id);
    await changeManagedProfileMember(owner.id, child, invitee.id, "read_only");
    expect((await listManagedProfileMembers(invitee.id, child, 50, 0)).members).toHaveLength(2);
    expect((await listManagedProfileInvitations(invitee.id, child, 50, 0)).invitations).toHaveLength(2);
    expect((await listManagedProfileMemberEvents(invitee.id, child, 50)).events.length).toBeGreaterThan(0);
    for (const mutation of [
      () => invite("manager", "denied@example.com", invitee.id),
      () => changeManagedProfileMember(invitee.id, child, owner.id, "read_only"),
      () => removeManagedProfileMember(invitee.id, child, owner.id),
      () => cancelManagedProfileInvitation(invitee.id, child, invitation.id)
    ])
      await expect(mutation()).rejects.toMatchObject({ code: "MANAGED_PROFILE_MANAGER_REQUIRED" });
    await removeManagedProfileMember(owner.id, child, invitee.id);
    await expect(listManagedProfileMembers(invitee.id, child, 50, 0)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_ACCESS_DENIED"
    });
    await expect(invite("manager", "denied@example.com", invitee.id)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_ACCESS_DENIED"
    });
  });

  it("protects the owner under concurrent changes and keeps role/removal histories idempotent", async () => {
    const attempts = await Promise.allSettled([
      changeManagedProfileMember(owner.id, child, owner.id, "read_only"),
      removeManagedProfileMember(owner.id, child, owner.id)
    ]);
    expect(
      attempts.every(
        result => result.status === "rejected" && result.reason.code === "MANAGED_PROFILE_OWNER_MEMBERSHIP_REQUIRED"
      )
    ).toBe(true);
    await accept((await invite()).invitation.id);
    await changeManagedProfileMember(owner.id, child, invitee.id, "read_only");
    await changeManagedProfileMember(owner.id, child, invitee.id, "read_only");
    const changed = await MembershipEvent.findOne({ where: { action: "role_changed" } });
    expect(changed).toMatchObject({
      actorProfileId: owner.id,
      memberProfileId: invitee.id,
      previousRole: "manager",
      role: "read_only"
    });
    expect(await eventCount("role_changed")).toBe(1);
    await removeManagedProfileMember(owner.id, child, invitee.id);
    await removeManagedProfileMember(owner.id, child, invitee.id);
    expect(await eventCount("member_removed")).toBe(1);
    await expect(removeManagedProfileMember(owner.id, child, crypto.randomUUID())).rejects.toMatchObject({
      code: "MEMBER_NOT_FOUND"
    });
  });

  it("rolls role changes, removal, and cancellation back when their audit insert fails", async () => {
    await accept((await invite()).invitation.id);
    const pending = await invite("read_only", "other@example.com");
    spyOn(MembershipEvent, "create").mockRejectedValue(new Error("audit unavailable"));
    await expect(changeManagedProfileMember(owner.id, child, invitee.id, "read_only")).rejects.toThrow("audit unavailable");
    await expect(removeManagedProfileMember(owner.id, child, invitee.id)).rejects.toThrow("audit unavailable");
    await expect(cancelManagedProfileInvitation(owner.id, child, pending.invitation.id)).rejects.toThrow("audit unavailable");
    expect(await Membership.findOne({ where: { memberProfileId: invitee.id, revokedAt: null } })).toMatchObject({
      role: "manager"
    });
    expect((await Invitation.findByPk(pending.invitation.id))?.cancelledAt).toBeNull();
  });

  for (const action of ["downgrade", "revoke"] as const) {
    it(`rechecks live manager authority after a concurrent ${action}`, async () => {
      await accept((await invite()).invitation.id);
      const transaction = await sequelize.transaction();
      await ManagedProfileManager.findByPk(owner.id, { lock: Transaction.LOCK.UPDATE, transaction });
      let reached!: () => void;
      const waiting = new Promise<void>(resolve => {
        reached = resolve;
      });
      const original = ManagedProfileManager.findByPk.bind(ManagedProfileManager);
      spyOn(ManagedProfileManager, "findByPk").mockImplementation((...args) => {
        reached();
        return original(...args);
      });
      const creating = invite("manager", "denied@example.com", invitee.id).then(
        result => result,
        error => error
      );
      try {
        await waiting;
        await Membership.update(
          action === "downgrade" ? { role: "read_only" } : { revokedAt: new Date(), revokedByProfileId: owner.id },
          { transaction, where: { managedProfileId: child, memberProfileId: invitee.id, revokedAt: null } }
        );
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
      expect(await creating).toMatchObject({
        code: action === "downgrade" ? "MANAGED_PROFILE_MANAGER_REQUIRED" : "MANAGED_PROFILE_ACCESS_DENIED"
      });
      expect(await Invitation.count()).toBe(1);
    });
  }

  it("does not leak another child's members, invitations, or events", async () => {
    for (const read of [
      () => listManagedProfileMembers(invitee.id, child, 50, 0),
      () => listManagedProfileInvitations(invitee.id, child, 50, 0),
      () => listManagedProfileMemberEvents(invitee.id, child, 50)
    ])
      await expect(read()).rejects.toMatchObject({ code: "MANAGED_PROFILE_ACCESS_DENIED" });
    const foreign = await createTestUser();
    await expect(listManagedProfileMembers(owner.id, foreign.id, 50, 0)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_ACCESS_DENIED"
    });
  });

  it("paginates tied event timestamps without missing or repeating rows and rejects foreign cursors", async () => {
    const timestamp = new Date();
    await MembershipEvent.bulkCreate(
      Array.from({ length: 5 }, () => ({ action: "invited" as const, managedProfileId: child, createdAt: timestamp }))
    );
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listManagedProfileMemberEvents(owner.id, child, 2, cursor);
      ids.push(...page.events.map(event => event.id));
      cursor = page.pagination.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toHaveLength(6);
    await expect(listManagedProfileMemberEvents(owner.id, child, 2, crypto.randomUUID())).rejects.toMatchObject({
      code: "INVALID_PAGINATION"
    });
  });

  for (const deactivate of ["owner", "child"] as const) {
    it(`rechecks ${deactivate} state after waiting on the lifecycle owner lock`, async () => {
      const { invitation } = await invite();
      const transaction = await sequelize.transaction();
      await ManagedProfileManager.findByPk(owner.id, { lock: Transaction.LOCK.UPDATE, transaction });
      let reached!: () => void;
      const waiting = new Promise<void>(resolve => {
        reached = resolve;
      });
      const original = ManagedProfileManager.findByPk.bind(ManagedProfileManager);
      spyOn(ManagedProfileManager, "findByPk").mockImplementation((...args) => {
        reached();
        return original(...args);
      });
      const accepting = accept(invitation.id).then(
        result => result,
        error => error
      );
      try {
        await waiting;
        if (deactivate === "owner")
          await ManagedProfileManager.update({ isActive: false }, { transaction, where: { profileId: owner.id } });
        else
          await ManagedProfile.update(
            { status: "deleted", deletedAt: new Date() },
            { transaction, where: { profileId: child } }
          );
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
      expect(await accepting).toMatchObject({ code: "MANAGED_PROFILE_ACCESS_DENIED" });
      expect(await eventCount("invitation_accepted")).toBe(0);
    });
  }

  it("denies all team reads and acceptance after owner lifecycle deletion", async () => {
    const { invitation } = await invite();
    await deleteManagedProfile(owner.id, child);
    await expect(accept(invitation.id)).rejects.toMatchObject({ code: "MANAGED_PROFILE_ACCESS_DENIED" });
    await expect(listManagedProfileMembers(owner.id, child, 50, 0)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_ACCESS_DENIED"
    });
  });
});
