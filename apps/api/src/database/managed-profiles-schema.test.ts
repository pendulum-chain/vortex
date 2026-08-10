import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { QueryTypes } from "sequelize";
import sequelize from "../config/database";
import ManagedProfile from "../models/managedProfile.model";
import ManagedProfileManager from "../models/managedProfileManager.model";
import User from "../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestUser } from "../test-utils/factories";

async function createManager(): Promise<User> {
  const profile = await createTestUser();
  await ManagedProfileManager.create({ allowedCorridors: ["BR", "EU"], profileId: profile.id });
  return profile;
}

async function createManagedProfile(
  managerProfileId: string,
  externalSubjectId: string,
  contactEmail: string | null = "child@example.com"
): Promise<User> {
  return sequelize.transaction(async transaction => {
    const profile = await User.create(
      { email: null, id: crypto.randomUUID(), kind: "managed" },
      { transaction }
    );
    await ManagedProfile.create(
      {
        contactEmail,
        creationSource: "manager",
        externalSubjectId,
        managerProfileId,
        profileId: profile.id
      },
      { transaction }
    );
    return profile;
  });
}

describe("managed profile schema", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetTestDatabase);

  it("defaults existing-style profiles to authenticated and requires their email", async () => {
    const profile = await createTestUser();

    expect(profile.kind).toBe("authenticated");
    await expect(User.create({ email: null, id: crypto.randomUUID() })).rejects.toThrow();
  });

  it("creates a managed child and its relationship atomically", async () => {
    const manager = await createManager();
    const child = await createManagedProfile(manager.id, "customer-1");
    const relationship = await ManagedProfile.findOne({ where: { profileId: child.id } });

    expect(child.email).toBeNull();
    expect(child.kind).toBe("managed");
    expect(relationship?.managerProfileId).toBe(manager.id);
    expect(relationship?.contactEmail).toBe("child@example.com");
    expect(relationship?.status).toBe("active");
  });

  it("rejects orphan managed profiles", async () => {
    await expect(User.create({ email: null, id: crypto.randomUUID(), kind: "managed" })).rejects.toThrow(
      "Every managed profile must have a managed_profiles relationship"
    );
  });

  it("scopes deferred invariant queries to affected profile and manager IDs", async () => {
    const rows = await sequelize.query<{ source: string }>(
      `SELECT prosrc AS source
       FROM pg_proc
       WHERE oid = 'enforce_managed_profile_invariants()'::regprocedure`,
      { type: QueryTypes.SELECT }
    );
    const source = rows[0]?.source;

    expect(source).toContain("WHERE p.id = ANY(affected_profile_ids)");
    expect(source).toContain("WHERE mp.profile_id = ANY(affected_profile_ids)");
    expect(source).toContain("WHERE m.profile_id = ANY(affected_manager_profile_ids)");
  });

  it("does not allow profile kinds to be converted", async () => {
    const authenticatedProfile = await createTestUser();
    const manager = await createManager();
    const managedProfile = await createManagedProfile(manager.id, "customer-kind");

    await expect(authenticatedProfile.update({ email: null, kind: "managed" })).rejects.toThrow(
      "Profile kind cannot be changed after creation"
    );
    await expect(managedProfile.update({ email: "claimed@example.com", kind: "authenticated" })).rejects.toThrow(
      "Profile kind cannot be changed after creation"
    );
  });

  it("does not allow a managed profile contact email to change", async () => {
    const manager = await createManager();
    const child = await createManagedProfile(manager.id, "immutable-email");
    const relationship = await ManagedProfile.findOne({ where: { profileId: child.id } });

    await expect(relationship?.update({ contactEmail: "other@example.com" })).rejects.toThrow(
      "Managed profile contact email cannot be changed after creation"
    );
  });

  it("allows a managed profile contact email to be null", async () => {
    const manager = await createManager();
    const child = await createManagedProfile(manager.id, "nullable-email", null);
    const relationship = await ManagedProfile.findOne({ where: { profileId: child.id } });

    expect(relationship?.contactEmail).toBeNull();
  });

  it("requires contact emails to be unique within each manager", async () => {
    const manager = await createManager();
    const otherManager = await createManager();
    await createManagedProfile(manager.id, "first-child", "shared@example.com");

    await expect(createManagedProfile(manager.id, "second-child", "shared@example.com")).rejects.toThrow();
    await expect(createManagedProfile(otherManager.id, "other-child", "shared@example.com")).resolves.toBeInstanceOf(User);
  });

  it("rejects authenticated children and managed managers", async () => {
    const manager = await createManager();
    const authenticatedChild = await createTestUser();

    await expect(
      ManagedProfile.create({
        creationSource: "manager",
        externalSubjectId: "customer-2",
        managerProfileId: manager.id,
        profileId: authenticatedChild.id
      })
    ).rejects.toThrow("Managed profile relationships require a managed child profile");

    const managedChild = await createManagedProfile(manager.id, "customer-3");
    await expect(ManagedProfileManager.create({ allowedCorridors: ["BR"], profileId: managedChild.id })).rejects.toThrow(
      "Managed profile managers must be authenticated profiles"
    );
  });

  it("enforces corridor, ownership, and lifecycle constraints", async () => {
    const manager = await createManager();
    const otherManager = await createManager();
    const child = await createManagedProfile(manager.id, "customer-4");

    await expect(
      ManagedProfileManager.create({ allowedCorridors: ["ZZ" as "BR"], profileId: (await createTestUser()).id })
    ).rejects.toThrow();
    await expect(
      ManagedProfile.create({
        creationSource: "vortex",
        externalSubjectId: "other-subject",
        managerProfileId: otherManager.id,
        profileId: child.id
      })
    ).rejects.toThrow();
    await expect(
      ManagedProfile.update({ status: "deleted" }, { where: { profileId: child.id } })
    ).rejects.toThrow();
  });

  it("allows null customer-type policy and rejects empty, unknown, or duplicate restrictions", async () => {
    const unrestricted = await createTestUser();
    await expect(
      ManagedProfileManager.create({ allowedCorridors: ["AR"], allowedCustomerTypes: null, profileId: unrestricted.id })
    ).resolves.toBeInstanceOf(ManagedProfileManager);

    for (const allowedCustomerTypes of [[], ["unknown"], ["individual", "individual"]]) {
      await expect(
        ManagedProfileManager.create({
          allowedCorridors: ["MX"],
          allowedCustomerTypes: allowedCustomerTypes as ["individual"],
          profileId: (await createTestUser()).id
        })
      ).rejects.toThrow();
    }
  });
});
