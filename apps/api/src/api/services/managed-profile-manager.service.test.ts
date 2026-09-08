import { afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { UniqueConstraintError } from "sequelize";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import Membership from "../../models/managedProfileMembership.model";
import MembershipEvent from "../../models/managedProfileMembershipEvent.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestUser } from "../../test-utils/factories";
import { configureManagedProfileManager } from "./managed-profile-manager.service";
import { provisionManagedProfile } from "./managed-profile-provisioning.service";

const configure = (profileId: string, isActive = true) =>
  configureManagedProfileManager({
    profileId,
    isActive,
    allowedCorridors: ["BR"],
    allowedCustomerTypes: null
  });

describe("organization manager configuration", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetTestDatabase);
  afterEach(() => mock.restore());

  it("creates exactly one owner membership and event under concurrent first configuration", async () => {
    const owner = await createTestUser();
    const results = await Promise.all([configure(owner.id), configure(owner.id)]);
    expect(results.map(result => result.created).sort()).toEqual([false, true]);
    expect(await ManagedProfileManager.count()).toBe(1);
    expect(await Membership.count()).toBe(1);
    expect(await Membership.findOne()).toMatchObject({
      ownerProfileId: owner.id,
      memberProfileId: owner.id,
      role: "manager",
      createdByProfileId: null,
      revokedAt: null
    });
    expect(await MembershipEvent.findOne()).toMatchObject({
      action: "member_added",
      ownerProfileId: owner.id,
      memberProfileId: owner.id,
      actorProfileId: null
    });
    await configure(owner.id, false);
    await configure(owner.id);
    expect(await Membership.count()).toBe(1);
    expect(await MembershipEvent.count()).toBe(1);
  });

  it("creates a protected owner membership even for an initially inactive zero-child organization", async () => {
    const owner = await createTestUser();
    await configure(owner.id, false);
    const membership = await Membership.findOne();
    await expect(membership!.update({ role: "read_only" })).rejects.toThrow("Organization owner membership");
    await expect(membership!.update({ revokedAt: new Date(), revokedByProfileId: owner.id })).rejects.toThrow(
      "Organization owner membership"
    );
    await expect(membership!.destroy()).rejects.toThrow("Organization owner membership");
  });

  for (const role of ["manager", "read_only"] as const) {
    it(`rejects configuration for an existing ${role} member, even when its organization is inactive`, async () => {
      const owner = await createTestUser();
      const member = await createTestUser();
      await configure(owner.id, false);
      await Membership.create({ ownerProfileId: owner.id, memberProfileId: member.id, role });
      await expect(configure(member.id)).rejects.toMatchObject({ code: "ORGANIZATION_MEMBERSHIP_CONFLICT" });
      expect(await ManagedProfileManager.count()).toBe(1);
    });
  }

  it("rolls first configuration and owner membership back when audit fails", async () => {
    const owner = await createTestUser();
    spyOn(MembershipEvent, "create").mockRejectedValue(new Error("audit unavailable"));
    await expect(configure(owner.id)).rejects.toThrow("audit unavailable");
    expect(await ManagedProfileManager.count()).toBe(0);
    expect(await Membership.count()).toBe(0);
  });

  it("maps a database membership race to the manager error handled as HTTP 409", async () => {
    const owner = await createTestUser();
    spyOn(Membership, "create").mockRejectedValue(
      new UniqueConstraintError({
        parent: Object.assign(new Error("duplicate membership"), {
          constraint: "uq_managed_profile_memberships_active",
          sql: "",
          code: "23505"
        })
      })
    );
    await expect(configure(owner.id)).rejects.toMatchObject({
      name: "ManagedProfileManagerError",
      code: "ORGANIZATION_MEMBERSHIP_CONFLICT"
    });
    expect(await ManagedProfileManager.count()).toBe(0);
    expect(await MembershipEvent.count()).toBe(0);
  });

  it("rejects missing and non-authenticated owners", async () => {
    await expect(configure(crypto.randomUUID())).rejects.toMatchObject({ code: "PROFILE_NOT_FOUND" });
    const owner = await createTestUser();
    await configure(owner.id);
    const profile = await provisionManagedProfile({
      contactEmail: "child@example.com",
      creationSource: "manager",
      customerType: "business",
      externalSubjectId: "company",
      managerProfileId: owner.id
    });
    await expect(configure(profile.profileId)).rejects.toMatchObject({ code: "MANAGED_PROFILE_MANAGER_PROFILE_INVALID" });
  });
});
