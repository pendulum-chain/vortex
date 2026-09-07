import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { QueryTypes } from "sequelize";
import sequelize from "../config/database";
import ManagedProfile from "../models/managedProfile.model";
import ManagedProfileManager from "../models/managedProfileManager.model";
import ManagedProfileMembership from "../models/managedProfileMembership.model";
import ManagedProfileMembershipEvent from "../models/managedProfileMembershipEvent.model";
import ManagedProfileMembershipInvitation from "../models/managedProfileMembershipInvitation.model";
import User from "../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestUser } from "../test-utils/factories";
import { down, up } from "./migrations/069-create-managed-profile-memberships";

async function createManager(): Promise<User> {
  const profile = await createTestUser();
  await ManagedProfileManager.create({ allowedCorridors: ["BR"], profileId: profile.id });
  return profile;
}

async function createManagedProfile(
  managerProfileId: string,
  externalSubjectId: string,
  status: "active" | "deleted" = "active"
): Promise<User> {
  return sequelize.transaction(async transaction => {
    const profile = await User.create({ email: null, id: crypto.randomUUID(), kind: "managed" }, { transaction });
    await ManagedProfile.create(
      {
        creationSource: "manager",
        deletedAt: status === "deleted" ? new Date() : null,
        externalSubjectId,
        managerProfileId,
        profileId: profile.id,
        status
      },
      { transaction }
    );
    await ManagedProfileMembership.create(
      { managedProfileId: profile.id, memberProfileId: managerProfileId, role: "manager" },
      { transaction }
    );
    return profile;
  });
}

describe("managed profile membership schema", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetTestDatabase);

  it("backfills an owner manager membership for every retained relationship", async () => {
    const queryInterface = sequelize.getQueryInterface();
    await down(queryInterface);
    let defaultPrivilegesGranted = false;

    try {
      await sequelize.query(`DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        END;
        $$;`);
      await sequelize.query("ALTER DEFAULT PRIVILEGES GRANT ALL PRIVILEGES ON TABLES TO anon, authenticated;");
      defaultPrivilegesGranted = true;
      const manager = await createManager();
      const profileIds = await sequelize.transaction(async transaction => {
        const active = await User.create(
          { email: null, id: crypto.randomUUID(), kind: "managed" },
          { transaction }
        );
        const deleted = await User.create(
          { email: null, id: crypto.randomUUID(), kind: "managed" },
          { transaction }
        );
        await ManagedProfile.bulkCreate(
          [
            {
              creationSource: "manager",
              externalSubjectId: "pre-membership-active",
              managerProfileId: manager.id,
              profileId: active.id
            },
            {
              creationSource: "manager",
              deletedAt: new Date(),
              externalSubjectId: "pre-membership-deleted",
              managerProfileId: manager.id,
              profileId: deleted.id,
              status: "deleted"
            }
          ],
          { transaction }
        );
        return [active.id, deleted.id];
      });

      await up(queryInterface);

      const memberships = await ManagedProfileMembership.findAll({ order: [["managedProfileId", "ASC"]] });
      expect(memberships).toHaveLength(2);
      expect(memberships.map(membership => membership.managedProfileId).sort()).toEqual(profileIds.sort());
      expect(memberships.every(membership => membership.memberProfileId === manager.id)).toBe(true);
      expect(memberships.every(membership => membership.role === "manager" && membership.revokedAt === null)).toBe(true);
      expect(memberships.every(membership => membership.createdByProfileId === null)).toBe(true);
      expect(await ManagedProfileMembershipEvent.count()).toBe(0);

      await down(queryInterface);
      const [droppedTable] = await sequelize.query<{ name: string | null }>(
        "SELECT to_regclass('public.managed_profile_memberships')::text AS name",
        { type: QueryTypes.SELECT }
      );
      expect(droppedTable?.name).toBeNull();
      await up(queryInterface);
    } finally {
      if (defaultPrivilegesGranted) {
        await sequelize.query("ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;");
      }
      const [table] = await sequelize.query<{ present: boolean }>(
        "SELECT to_regclass('public.managed_profile_memberships') IS NOT NULL AS present",
        { type: QueryTypes.SELECT }
      );
      if (!table?.present) await up(queryInterface);
    }
  });

  it("requires active children to have an active owner manager membership", async () => {
    const manager = await createManager();

    await expect(
      sequelize.transaction(async transaction => {
        const profile = await User.create(
          { email: null, id: crypto.randomUUID(), kind: "managed" },
          { transaction }
        );
        await ManagedProfile.create(
          {
            creationSource: "manager",
            externalSubjectId: "missing-owner-membership",
            managerProfileId: manager.id,
            profileId: profile.id
          },
          { transaction }
        );
      })
    ).rejects.toThrow("Active managed profiles require an active owner manager membership");
  });

  it("requires authenticated members and a retained managed-profile target", async () => {
    const manager = await createManager();
    const child = await createManagedProfile(manager.id, "membership-kind-child");
    const otherChild = await createManagedProfile(manager.id, "membership-kind-member");
    const authenticatedProfile = await createTestUser();

    await expect(
      ManagedProfileMembership.create({
        managedProfileId: child.id,
        memberProfileId: otherChild.id,
        role: "read_only"
      })
    ).rejects.toThrow("Managed profile members must be authenticated profiles");
    await expect(
      ManagedProfileMembership.create({
        managedProfileId: authenticatedProfile.id,
        memberProfileId: authenticatedProfile.id,
        role: "read_only"
      })
    ).rejects.toThrow();
  });

  it("allows only one active membership and permits a distinct grant after revocation", async () => {
    const owner = await createManager();
    const member = await createTestUser();
    const invalidRoleMember = await createTestUser();
    const child = await createManagedProfile(owner.id, "membership-history");
    const first = await ManagedProfileMembership.create({
      createdByProfileId: owner.id,
      managedProfileId: child.id,
      memberProfileId: member.id,
      role: "read_only"
    });

    await expect(
      ManagedProfileMembership.create({
        createdByProfileId: owner.id,
        managedProfileId: child.id,
        memberProfileId: member.id,
        role: "manager"
      })
    ).rejects.toThrow();
    await expect(
      ManagedProfileMembership.create({
        managedProfileId: child.id,
        memberProfileId: invalidRoleMember.id,
        role: "operator" as "manager"
      })
    ).rejects.toThrow();

    await first.update({ revokedAt: new Date(), revokedByProfileId: owner.id });
    const second = await ManagedProfileMembership.create({
      createdByProfileId: owner.id,
      managedProfileId: child.id,
      memberProfileId: member.id,
      role: "manager"
    });

    expect(second.id).not.toBe(first.id);
    expect(await ManagedProfileMembership.count({ where: { managedProfileId: child.id, memberProfileId: member.id } })).toBe(2);
  });

  it("protects active owner membership and immutable ownership at database level", async () => {
    const owner = await createManager();
    const otherManager = await createManager();
    const child = await createManagedProfile(owner.id, "protected-owner");
    const relationship = await ManagedProfile.findOne({ where: { profileId: child.id } });
    const membership = await ManagedProfileMembership.findOne({
      where: { managedProfileId: child.id, memberProfileId: owner.id }
    });

    await expect(membership?.update({ role: "read_only" })).rejects.toThrow(
      "Active managed profile owner membership cannot be downgraded or removed"
    );
    await expect(membership?.update({ revokedAt: new Date(), revokedByProfileId: owner.id })).rejects.toThrow(
      "Active managed profile owner membership cannot be downgraded or removed"
    );
    await expect(membership?.destroy()).rejects.toThrow(
      "Active managed profile owner membership cannot be downgraded or removed"
    );
    await expect(relationship?.update({ managerProfileId: otherManager.id })).rejects.toThrow(
      "Managed profile owner cannot be changed after creation"
    );
  });

  it("constrains invitation roles, normalized email, terminal state, and pending uniqueness", async () => {
    const owner = await createManager();
    const acceptedBy = await createTestUser();
    const child = await createManagedProfile(owner.id, "invitation-constraints");
    const expiresAt = new Date(Date.now() + 60_000);
    const invitation = await ManagedProfileMembershipInvitation.create({
      email: "member@example.com",
      expiresAt,
      invitedByProfileId: owner.id,
      managedProfileId: child.id,
      role: "manager"
    });

    await expect(
      ManagedProfileMembershipInvitation.create({
        email: "member@example.com",
        expiresAt,
        invitedByProfileId: owner.id,
        managedProfileId: child.id,
        role: "read_only"
      })
    ).rejects.toThrow();
    await expect(
      ManagedProfileMembershipInvitation.create({
        email: "other@example.com",
        expiresAt,
        invitedByProfileId: owner.id,
        managedProfileId: child.id,
        role: "operator" as "manager"
      })
    ).rejects.toThrow();
    await expect(
      ManagedProfileMembershipInvitation.create({
        email: " Member@Example.com ",
        expiresAt,
        invitedByProfileId: owner.id,
        managedProfileId: child.id,
        role: "manager"
      })
    ).rejects.toThrow();
    await expect(invitation.update({ acceptedAt: new Date() })).rejects.toThrow();

    await invitation.update({ acceptedAt: new Date(), acceptedByProfileId: acceptedBy.id });
    await expect(
      ManagedProfileMembershipInvitation.create({
        email: "member@example.com",
        expiresAt,
        invitedByProfileId: owner.id,
        managedProfileId: child.id,
        role: "read_only"
      })
    ).resolves.toBeInstanceOf(ManagedProfileMembershipInvitation);
  });

  it("makes membership events append-only", async () => {
    const owner = await createManager();
    const child = await createManagedProfile(owner.id, "append-only-events");
    const event = await ManagedProfileMembershipEvent.create({
      action: "member_added",
      actorProfileId: owner.id,
      managedProfileId: child.id,
      memberProfileId: owner.id,
      role: "manager"
    });

    await expect(event.update({ role: "read_only" })).rejects.toThrow("Managed profile membership events are append-only");
    await expect(event.destroy()).rejects.toThrow("Managed profile membership events are append-only");
    await expect(
      ManagedProfileMembershipEvent.create({
        action: "membership_exported" as "member_added",
        managedProfileId: child.id
      })
    ).rejects.toThrow();
  });

  it("enables RLS and grants no direct client-role privileges or owned sequences", async () => {
    const tables = [
      "managed_profile_memberships",
      "managed_profile_membership_invitations",
      "managed_profile_membership_events"
    ];
    const rows = await sequelize.query<{ clientHasPrivilege: boolean; name: string; rlsEnabled: boolean }>(
      `SELECT
         class.relname AS name,
         class.relrowsecurity AS "rlsEnabled",
         EXISTS (
           SELECT 1
           FROM aclexplode(COALESCE(class.relacl, acldefault('r', class.relowner))) privilege
           JOIN pg_roles role ON role.oid = privilege.grantee
           WHERE role.rolname IN ('anon', 'authenticated')
         ) AS "clientHasPrivilege"
       FROM pg_class class
       WHERE class.relname IN (:tables)
       ORDER BY class.relname`,
      { replacements: { tables }, type: QueryTypes.SELECT }
    );

    expect(rows).toHaveLength(3);
    expect(rows.every(row => row.rlsEnabled && !row.clientHasPrivilege)).toBe(true);

    const [sequenceState] = await sequelize.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM pg_class sequence
       JOIN pg_depend dependency ON dependency.objid = sequence.oid AND dependency.deptype = 'a'
       JOIN pg_class owner_table ON owner_table.oid = dependency.refobjid
       WHERE sequence.relkind = 'S' AND owner_table.relname IN (:tables)`,
      { replacements: { tables }, type: QueryTypes.SELECT }
    );
    expect(sequenceState?.count).toBe(0);
  });
});
