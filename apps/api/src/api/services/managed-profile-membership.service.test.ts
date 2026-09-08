import { afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Transaction, UniqueConstraintError } from "sequelize";
import sequelize from "../../config/database";
import { config } from "../../config/vars";
import EmailNotification from "../../models/emailNotification.model";
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
import { configureManagedProfileManager } from "./managed-profile-manager.service";
import {
  cancelManagedProfileInvitation,
  changeManagedProfileMember,
  createManagedProfileInvitation,
  getManagedProfileOrganization,
  listManagedProfileInvitations,
  listManagedProfileMemberEvents,
  listManagedProfileMembers,
  readOrAcceptManagedProfileInvitation,
  removeManagedProfileMember
} from "./managed-profile-membership.service";
import { provisionManagedProfile } from "./managed-profile-provisioning.service";

describe("organization membership transactions", () => {
  const originalDashboardUrl = config.dashboardPublicUrl;
  let owner: User;
  let invitee: User;
  const email = "invitee@example.com";
  const principal = () => ({ profileId: invitee.id, email, emailConfirmedAt: "2026-09-01T00:00:00Z" });
  const configure = (profileId: string, isActive = true) =>
    configureManagedProfileManager({
      allowedCorridors: ["BR"],
      allowedCustomerTypes: null,
      isActive,
      profileId
    });
  const invite = (role = "manager", recipient = email, actor = owner.id) =>
    createManagedProfileInvitation(actor, owner.id, { email: recipient, role });
  const accept = (id: string) => readOrAcceptManagedProfileInvitation(principal(), id, true);
  const eventCount = (action: string) => MembershipEvent.count({ where: { ownerProfileId: owner.id, action } });

  beforeAll(setupTestDatabase);
  beforeEach(async () => {
    config.dashboardPublicUrl = "https://dashboard.example.com";
    await resetTestDatabase();
    owner = await createTestUser();
    invitee = await createTestUser({ email: "stale@example.com" });
    await configure(owner.id);
  });
  afterEach(() => {
    mock.restore();
    config.dashboardPublicUrl = originalDashboardUrl;
  });

  it("resolves live organization metadata with zero children and retains grants while inactive", async () => {
    expect(await getManagedProfileOrganization(owner.id)).toEqual({
      ownerProfileId: owner.id,
      ownerEmail: owner.email,
      membership: { role: "manager", isOwner: true }
    });
    expect(await getManagedProfileOrganization(invitee.id)).toBeNull();
    await accept((await invite("read_only")).invitation.id);
    expect(await getManagedProfileOrganization(invitee.id)).toMatchObject({
      ownerProfileId: owner.id,
      membership: { role: "read_only", isOwner: false }
    });
    await configure(owner.id, false);
    expect(await getManagedProfileOrganization(owner.id)).toBeNull();
    expect(await getManagedProfileOrganization(invitee.id)).toBeNull();
    await expect(listManagedProfileMembers(owner.id, owner.id, 50, 0)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_ACCESS_DENIED"
    });
    expect(await Membership.count({ where: { revokedAt: null } })).toBe(2);
    await configure(owner.id);
    expect(await getManagedProfileOrganization(invitee.id)).toMatchObject({ membership: { role: "read_only" } });
  });

  it("normalizes concurrent duplicate offers and atomically queues one seven-day invitation", async () => {
    const start = Date.now();
    const results = await Promise.all([invite("manager", "  Invitee@Example.COM  "), invite()]);
    expect(results.map(result => result.created).sort()).toEqual([false, true]);
    expect(results[0].invitation.id).toBe(results[1].invitation.id);
    expect(results[0].invitation.email).toBe(email);
    expect(results[0].invitation.ownerProfileId).toBe(owner.id);
    expect(results[0].invitation.expiresAt.getTime()).toBeGreaterThanOrEqual(start + 7 * 86400000);
    expect(await Invitation.count()).toBe(1);
    expect(await eventCount("invited")).toBe(1);
    expect(await EmailNotification.count({ where: { recipientEmail: email, resourceId: results[0].invitation.id } })).toBe(1);
  });

  it("does not distinguish existing, other-organization, and unregistered nonmember emails", async () => {
    await configure(invitee.id);
    const existing = await invite("read_only", invitee.email!);
    const unknown = await invite("read_only", "unregistered@example.com");
    expect(existing.created).toBe(true);
    expect(unknown.created).toBe(true);
    expect(Object.keys(existing.invitation)).toEqual(Object.keys(unknown.invitation));
    expect(await EmailNotification.count()).toBe(2);
  });

  it("lets the current mailbox holder accept despite another member's stale local email", async () => {
    const staleMember = await createTestUser({ email });
    await Membership.create({ ownerProfileId: owner.id, memberProfileId: staleMember.id, role: "manager" });
    spyOn(SupabaseAuthService, "getUserProfile").mockResolvedValue({
      id: staleMember.id,
      email: "changed@example.com",
      email_confirmed_at: "2026-09-01T00:00:00Z"
    } as never);
    expect(await accept((await invite()).invitation.id)).toMatchObject({
      member: { memberProfileId: invitee.id, role: "manager" }
    });
    expect(await Membership.count({ where: { ownerProfileId: owner.id, revokedAt: null } })).toBe(3);
    expect(await EmailNotification.count({ where: { recipientEmail: email } })).toBe(1);
  });

  for (const confirmation of [
    "confirmed",
    "changed",
    "unverified",
    "wrong_profile",
    "invalid_timestamp",
    "unavailable"
  ] as const) {
    it(`only vetoes a roster member email after current verified confirmation: ${confirmation}`, async () => {
      await Membership.create({ ownerProfileId: owner.id, memberProfileId: invitee.id, role: "manager" });
      const lookup = spyOn(SupabaseAuthService, "getUserProfile");
      if (confirmation === "unavailable") lookup.mockRejectedValue(new Error("Auth lookup unavailable"));
      else
        lookup.mockResolvedValue({
          id: confirmation === "wrong_profile" ? crypto.randomUUID() : invitee.id,
          email: confirmation === "changed" ? "changed@example.com" : "  STALE@EXAMPLE.COM ",
          email_confirmed_at:
            confirmation === "unverified"
              ? undefined
              : confirmation === "invalid_timestamp"
                ? "invalid"
                : "2026-09-01T00:00:00Z"
        } as never);
      if (confirmation === "confirmed") {
        await expect(invite("manager", invitee.email!)).rejects.toMatchObject({
          code: "MEMBERSHIP_ALREADY_EXISTS",
          status: 409
        });
        expect(await Invitation.count()).toBe(0);
      } else expect((await invite("manager", invitee.email!)).created).toBe(true);
      expect(lookup).toHaveBeenCalledWith(invitee.id);
      expect(await Membership.count()).toBe(2);
    });
  }

  for (const accepting of [false, true]) {
    it(`allows reciprocal owner previews but rejects reciprocal acceptance without deadlock: ${accepting}`, async () => {
      await configure(invitee.id);
      const toInvitee = await invite();
      const toOwner = await createManagedProfileInvitation(invitee.id, invitee.id, { email: owner.email!, role: "manager" });
      const results = await Promise.allSettled([
        readOrAcceptManagedProfileInvitation(principal(), toInvitee.invitation.id, accepting),
        readOrAcceptManagedProfileInvitation(
          { profileId: owner.id, email: owner.email!, emailConfirmedAt: principal().emailConfirmedAt },
          toOwner.invitation.id,
          accepting
        )
      ]);
      for (const result of results) {
        if (accepting) {
          expect(result.status).toBe("rejected");
          if (result.status === "rejected")
            expect(result.reason).toMatchObject({ code: "ORGANIZATION_MEMBERSHIP_CONFLICT", status: 409 });
        } else expect(result.status).toBe("fulfilled");
      }
      expect(await Membership.count()).toBe(2);
      expect(await MembershipEvent.count({ where: { action: "invitation_accepted" } })).toBe(0);
    });
  }

  it("rejects cross-owner team operations rather than allowing reciprocal owner-managers", async () => {
    await configure(invitee.id);
    for (const [actor, organization] of [
      [owner.id, invitee.id],
      [invitee.id, owner.id]
    ]) {
      await expect(
        createManagedProfileInvitation(actor, organization, { email: "other@example.com", role: "manager" })
      ).rejects.toMatchObject({ code: "MANAGED_PROFILE_ACCESS_DENIED" });
      await expect(changeManagedProfileMember(actor, organization, actor, "read_only")).rejects.toMatchObject({
        code: "MANAGED_PROFILE_ACCESS_DENIED"
      });
    }
  });

  it("serializes concurrent two-organization acceptance for the same person", async () => {
    const other = await createTestUser();
    await configure(other.id);
    const first = await invite("read_only");
    const second = await createManagedProfileInvitation(other.id, other.id, { email, role: "manager" });
    const results = await Promise.allSettled([accept(first.invitation.id), accept(second.invitation.id)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({
      code: "ORGANIZATION_MEMBERSHIP_CONFLICT",
      status: 409
    });
    expect(await Membership.count({ where: { memberProfileId: invitee.id, revokedAt: null } })).toBe(1);
    expect(await Invitation.count({ where: { acceptedByProfileId: invitee.id } })).toBe(1);
    expect(await MembershipEvent.count({ where: { action: "invitation_accepted" } })).toBe(1);
  });

  for (const first of ["accept", "configure"] as const) {
    it(`serializes acceptance versus first configuration when ${first} takes the person lock first`, async () => {
      const { invitation } = await invite();
      const original = User.findByPk.bind(User);
      let reached!: () => void;
      let release!: () => void;
      const locked = new Promise<void>(resolve => {
        reached = resolve;
      });
      const proceed = new Promise<void>(resolve => {
        release = resolve;
      });
      let paused = false;
      spyOn(User, "findByPk").mockImplementation(async (id, options) => {
        const row = await original(id, options);
        if (!paused && id === invitee.id && options?.lock === Transaction.LOCK.NO_KEY_UPDATE) {
          paused = true;
          reached();
          await proceed;
        }
        return row;
      });
      const winning = first === "accept" ? accept(invitation.id) : configure(invitee.id);
      await locked;
      const losing = (first === "accept" ? configure(invitee.id) : accept(invitation.id)).then(
        value => value,
        error => error
      );
      release();
      await winning;
      expect(await losing).toMatchObject({ code: "ORGANIZATION_MEMBERSHIP_CONFLICT" });
      expect(await Membership.count({ where: { memberProfileId: invitee.id, revokedAt: null } })).toBe(1);
      expect(await ManagedProfileManager.count({ where: { profileId: invitee.id } })).toBe(first === "configure" ? 1 : 0);
    });
  }

  it("keeps inactive owners affiliated and unable to accept another organization", async () => {
    await configure(invitee.id, false);
    await expect(accept((await invite()).invitation.id)).rejects.toMatchObject({
      code: "ORGANIZATION_MEMBERSHIP_CONFLICT",
      status: 409
    });
  });

  it("requires cancellation before changing a pending role and never sends a duplicate", async () => {
    const first = await invite();
    await expect(invite("read_only")).rejects.toMatchObject({ code: "INVITATION_ROLE_CONFLICT" });
    expect(await EmailNotification.count()).toBe(1);
    await cancelManagedProfileInvitation(owner.id, owner.id, first.invitation.id);
    expect((await invite("read_only")).invitation.id).not.toBe(first.invitation.id);
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
      await expect(createManagedProfileInvitation(owner.id, owner.id, { email, role })).rejects.toMatchObject({
        code: "INVALID_MEMBERSHIP_ROLE"
      });
      await expect(changeManagedProfileMember(owner.id, owner.id, invitee.id, role)).rejects.toMatchObject({
        code: "INVALID_MEMBERSHIP_ROLE"
      });
    }
    for (const recipient of ["invalid", "a\nb@example.com", "a@@example.com", `${"a".repeat(256)}@example.com`, undefined]) {
      await expect(
        createManagedProfileInvitation(owner.id, owner.id, { email: recipient, role: "manager" })
      ).rejects.toMatchObject({ code: "INVALID_INVITATION_EMAIL" });
    }
    expect(await Invitation.count()).toBe(0);
  });

  it("uses the current verified email and returns organization preview without granting access", async () => {
    const { invitation } = await invite();
    expect(
      await readOrAcceptManagedProfileInvitation({ ...principal(), email: "  INVITEE@example.com " }, invitation.id, false)
    ).toMatchObject({
      invitation: { status: "pending", role: "manager", ownerProfileId: owner.id },
      organization: { ownerProfileId: owner.id, ownerEmail: owner.email },
      inviter: { profileId: owner.id, email: owner.email }
    });
    expect(await Membership.count({ where: { memberProfileId: invitee.id } })).toBe(0);
    expect(await accept(invitation.id)).toMatchObject({
      ownerProfileId: owner.id,
      member: { memberProfileId: invitee.id, role: "manager", isOwner: false }
    });
    const events = await MembershipEvent.findAll({ where: { invitationId: invitation.id, memberProfileId: invitee.id } });
    expect(events).toHaveLength(2);
    expect(events.every(event => event.actorProfileId === invitee.id && event.subjectEmail === null)).toBe(true);
  });

  it("denies mismatched, unverified, malformed confirmation and nonhuman invitees without expiry writes", async () => {
    const { invitation } = await invite();
    const managed = await provisionManagedProfile({
      contactEmail: "child@example.com",
      creationSource: "manager",
      customerType: "business",
      externalSubjectId: "company",
      managerProfileId: owner.id
    });
    await Invitation.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: invitation.id } });
    for (const actor of [
      { ...principal(), email: invitee.email! },
      { ...principal(), emailConfirmedAt: undefined },
      { ...principal(), emailConfirmedAt: "invalid" },
      { ...principal(), email: undefined },
      { ...principal(), profileId: managed.profileId }
    ])
      for (const accepting of [false, true]) {
        await expect(readOrAcceptManagedProfileInvitation(actor, invitation.id, accepting)).rejects.toMatchObject({
          code: "MANAGED_PROFILE_ACCESS_DENIED"
        });
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
    expect(await eventCount("member_added")).toBe(2);
    expect(await eventCount("invitation_accepted")).toBe(1);
  });

  it("does not replay a downgraded or removed grant and creates a fresh row for a new grant", async () => {
    const { invitation } = await invite();
    await accept(invitation.id);
    const original = await Membership.findOne({ where: { memberProfileId: invitee.id, revokedAt: null } });
    await changeManagedProfileMember(owner.id, owner.id, invitee.id, "read_only");
    await expect(accept(invitation.id)).rejects.toMatchObject({ code: "INVITATION_ACCEPTED" });
    await removeManagedProfileMember(owner.id, owner.id, invitee.id);
    await expect(accept(invitation.id)).rejects.toMatchObject({ code: "INVITATION_ACCEPTED" });
    await accept((await invite()).invitation.id);
    expect((await Membership.findOne({ where: { memberProfileId: invitee.id, revokedAt: null } }))?.id).not.toBe(original?.id);
    expect(await Membership.count({ where: { memberProfileId: invitee.id } })).toBe(2);
  });

  it("never overwrites an existing same-organization membership", async () => {
    const { invitation } = await invite();
    await Membership.create({ ownerProfileId: owner.id, memberProfileId: invitee.id, role: "read_only" });
    await expect(accept(invitation.id)).rejects.toMatchObject({ code: "MEMBERSHIP_ALREADY_EXISTS" });
    expect((await Invitation.findByPk(invitation.id))?.acceptedAt).toBeNull();
  });

  for (const observe of ["accept", "preview", "list", "cancel", "create"] as const) {
    it(`persists expiry exactly once when observed by ${observe}, including rejected mutations`, async () => {
      const { invitation } = await invite();
      const deadline = new Date(Date.now() - 1000);
      await Invitation.update({ expiresAt: deadline }, { where: { id: invitation.id } });
      if (observe === "accept") await expect(accept(invitation.id)).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });
      if (observe === "cancel")
        await expect(cancelManagedProfileInvitation(owner.id, owner.id, invitation.id)).rejects.toMatchObject({
          code: "INVITATION_EXPIRED"
        });
      if (observe === "preview")
        expect(await readOrAcceptManagedProfileInvitation(principal(), invitation.id, false)).toMatchObject({
          invitation: { status: "expired" }
        });
      if (observe === "list")
        expect((await listManagedProfileInvitations(owner.id, owner.id, 50, 0)).invitations[0].status).toBe("expired");
      if (observe === "create") expect((await invite()).invitation.id).not.toBe(invitation.id);
      await expect(accept(invitation.id)).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });
      expect((await Invitation.findByPk(invitation.id))?.expiredAt).toEqual(deadline);
      expect(await eventCount("invitation_expired")).toBe(1);
    });
  }

  it("commits expired predecessor even when replacement conflicts with a confirmed member", async () => {
    const { invitation } = await invite("manager", invitee.email!);
    await Invitation.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: invitation.id } });
    await Membership.create({ ownerProfileId: owner.id, memberProfileId: invitee.id, role: "manager" });
    spyOn(SupabaseAuthService, "getUserProfile").mockResolvedValue({
      id: invitee.id,
      email: invitee.email,
      email_confirmed_at: "2026-09-01T00:00:00Z"
    } as never);
    await expect(invite("manager", invitee.email!)).rejects.toMatchObject({ code: "MEMBERSHIP_ALREADY_EXISTS" });
    expect(await eventCount("invitation_expired")).toBe(1);
  });

  it("serializes cancellation versus acceptance with exactly one terminal event", async () => {
    const { invitation } = await invite();
    const results = await Promise.allSettled([
      cancelManagedProfileInvitation(owner.id, owner.id, invitation.id),
      accept(invitation.id)
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await eventCount("invitation_cancelled")) + (await eventCount("invitation_accepted"))).toBe(1);
    if ((await Invitation.findByPk(invitation.id))?.cancelledAt)
      await expect(accept(invitation.id)).rejects.toMatchObject({ code: "INVITATION_CANCELLED" });
    await expect(cancelManagedProfileInvitation(owner.id, owner.id, invitation.id)).rejects.toMatchObject({ status: 409 });
  });

  it("rolls acceptance and membership back if atomic history fails", async () => {
    const { invitation } = await invite();
    spyOn(MembershipEvent, "bulkCreate").mockRejectedValue(new Error("audit unavailable"));
    await expect(accept(invitation.id)).rejects.toThrow("audit unavailable");
    expect(await Membership.count({ where: { memberProfileId: invitee.id } })).toBe(0);
    expect((await Invitation.findByPk(invitation.id))?.acceptedAt).toBeNull();
  });

  it("maps a database active-membership unique race to a typed organization conflict", async () => {
    const { invitation } = await invite();
    spyOn(Membership, "create").mockRejectedValue(
      new UniqueConstraintError({
        parent: Object.assign(new Error("duplicate membership"), {
          constraint: "uq_managed_profile_memberships_active",
          sql: "",
          code: "23505"
        })
      })
    );
    await expect(accept(invitation.id)).rejects.toMatchObject({ code: "ORGANIZATION_MEMBERSHIP_CONFLICT", status: 409 });
    expect((await Invitation.findByPk(invitation.id))?.acceptedAt).toBeNull();
    expect(await eventCount("invitation_accepted")).toBe(0);
  });

  it("blocks owner and invitee profile changes while their kinds authorize a preview", async () => {
    const { invitation } = await invite();
    const original = User.findByPk.bind(User);
    let reached!: () => void;
    let release!: () => void;
    const actorLocked = new Promise<void>(resolve => {
      reached = resolve;
    });
    const finish = new Promise<void>(resolve => {
      release = resolve;
    });
    spyOn(User, "findByPk").mockImplementation(async (id, options) => {
      const row = await original(id, options);
      if (id === invitee.id && options?.lock) {
        reached();
        await finish;
      }
      return row;
    });
    const preview = readOrAcceptManagedProfileInvitation(principal(), invitation.id, false);
    try {
      await actorLocked;
      for (const id of [owner.id, invitee.id]) {
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

  it("rechecks manager role and revocation for every team operation", async () => {
    await accept((await invite()).invitation.id);
    const pending = await invite("read_only", "other@example.com", invitee.id);
    await changeManagedProfileMember(owner.id, owner.id, invitee.id, "read_only");
    expect((await listManagedProfileMembers(invitee.id, owner.id, 50, 0)).members).toHaveLength(2);
    expect((await listManagedProfileInvitations(invitee.id, owner.id, 50, 0)).invitations).toHaveLength(2);
    expect((await listManagedProfileMemberEvents(invitee.id, owner.id, 50)).events.length).toBeGreaterThan(0);
    for (const mutation of [
      () => invite("manager", "denied@example.com", invitee.id),
      () => changeManagedProfileMember(invitee.id, owner.id, owner.id, "read_only"),
      () => removeManagedProfileMember(invitee.id, owner.id, owner.id),
      () => cancelManagedProfileInvitation(invitee.id, owner.id, pending.invitation.id)
    ])
      await expect(mutation()).rejects.toMatchObject({ code: "MANAGED_PROFILE_MANAGER_REQUIRED" });
    await removeManagedProfileMember(owner.id, owner.id, invitee.id);
    expect(await getManagedProfileOrganization(invitee.id)).toBeNull();
    for (const read of [listManagedProfileMembers, listManagedProfileInvitations]) {
      await expect(read(invitee.id, owner.id, 50, 0)).rejects.toMatchObject({ code: "MANAGED_PROFILE_ACCESS_DENIED" });
    }
    await expect(listManagedProfileMemberEvents(invitee.id, owner.id, 50)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_ACCESS_DENIED"
    });
    await expect(invite("manager", "denied@example.com", invitee.id)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_ACCESS_DENIED"
    });
    // A pending invitation is an organization's durable offer, not the inviter's personal grant.
    const other = await createTestUser({ email: "other@example.com" });
    expect(
      await readOrAcceptManagedProfileInvitation(
        { ...principal(), profileId: other.id, email: other.email! },
        pending.invitation.id,
        true
      )
    ).toMatchObject({ ownerProfileId: owner.id, member: { role: "read_only" } });
  });

  it("protects the owner concurrently and keeps role/removal histories idempotent", async () => {
    const attempts = await Promise.allSettled([
      changeManagedProfileMember(owner.id, owner.id, owner.id, "read_only"),
      removeManagedProfileMember(owner.id, owner.id, owner.id)
    ]);
    expect(
      attempts.every(
        result => result.status === "rejected" && result.reason.code === "MANAGED_PROFILE_OWNER_MEMBERSHIP_REQUIRED"
      )
    ).toBe(true);
    await accept((await invite()).invitation.id);
    for (let i = 0; i < 2; i++) await changeManagedProfileMember(owner.id, owner.id, invitee.id, "read_only");
    expect(await MembershipEvent.findOne({ where: { action: "role_changed" } })).toMatchObject({
      actorProfileId: owner.id,
      memberProfileId: invitee.id,
      previousRole: "manager",
      role: "read_only"
    });
    expect(await eventCount("role_changed")).toBe(1);
    for (let i = 0; i < 2; i++) await removeManagedProfileMember(owner.id, owner.id, invitee.id);
    expect(await eventCount("member_removed")).toBe(1);
    await expect(removeManagedProfileMember(owner.id, owner.id, crypto.randomUUID())).rejects.toMatchObject({
      code: "MEMBER_NOT_FOUND"
    });
  });

  it("rolls role changes, removal and cancellation back when audit fails", async () => {
    await accept((await invite()).invitation.id);
    const pending = await invite("read_only", "other@example.com");
    spyOn(MembershipEvent, "create").mockRejectedValue(new Error("audit unavailable"));
    await expect(changeManagedProfileMember(owner.id, owner.id, invitee.id, "read_only")).rejects.toThrow("audit unavailable");
    await expect(removeManagedProfileMember(owner.id, owner.id, invitee.id)).rejects.toThrow("audit unavailable");
    await expect(cancelManagedProfileInvitation(owner.id, owner.id, pending.invitation.id)).rejects.toThrow(
      "audit unavailable"
    );
    expect(await Membership.findOne({ where: { memberProfileId: invitee.id, revokedAt: null } })).toMatchObject({
      role: "manager"
    });
    expect((await Invitation.findByPk(pending.invitation.id))?.cancelledAt).toBeNull();
  });

  for (const action of ["downgrade", "revoke", "deactivate"] as const) {
    it(`rechecks authority after a concurrent ${action} holds the owner lock`, async () => {
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
      await waiting;
      try {
        if (action === "deactivate")
          await ManagedProfileManager.update({ isActive: false }, { transaction, where: { profileId: owner.id } });
        else
          await Membership.update(
            action === "downgrade" ? { role: "read_only" } : { revokedAt: new Date(), revokedByProfileId: owner.id },
            { transaction, where: { ownerProfileId: owner.id, memberProfileId: invitee.id, revokedAt: null } }
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

  it("paginates tied event timestamps without missing rows and rejects foreign cursors", async () => {
    await MembershipEvent.bulkCreate(
      Array.from({ length: 5 }, () => ({ action: "invited" as const, ownerProfileId: owner.id, createdAt: new Date(0) }))
    );
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listManagedProfileMemberEvents(owner.id, owner.id, 2, cursor);
      ids.push(...page.events.map(event => event.id));
      cursor = page.pagination.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toHaveLength(6);
    await expect(listManagedProfileMemberEvents(owner.id, owner.id, 2, crypto.randomUUID())).rejects.toMatchObject({
      code: "INVALID_PAGINATION"
    });
    await expect(listManagedProfileMembers(owner.id, crypto.randomUUID(), 50, 0)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_ACCESS_DENIED"
    });
  });

  it("keeps organization offers and team access valid after every child is deleted", async () => {
    const { invitation } = await invite();
    const child = await provisionManagedProfile({
      contactEmail: "child@example.com",
      creationSource: "manager",
      customerType: "business",
      externalSubjectId: "company",
      managerProfileId: owner.id
    });
    await deleteManagedProfile(owner.id, child.profileId);
    expect(await accept(invitation.id)).toMatchObject({ ownerProfileId: owner.id });
    expect((await listManagedProfileMembers(invitee.id, owner.id, 50, 0)).members).toHaveLength(2);
    expect(await Membership.count()).toBe(2);
  });
});
