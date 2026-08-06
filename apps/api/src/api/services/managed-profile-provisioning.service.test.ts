import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import CustomerEntity from "../../models/customerEntity.model";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import User from "../../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestUser } from "../../test-utils/factories";
import {
  ManagedProfileProvisioningError,
  provisionManagedProfile
} from "./managed-profile-provisioning.service";

async function createManager(isActive = true): Promise<User> {
  const profile = await createTestUser();
  await ManagedProfileManager.create({ allowedCorridors: ["BR"], isActive, profileId: profile.id });
  return profile;
}

describe("managed profile provisioning", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetTestDatabase);

  it("atomically creates the headless profile, customer entity, and relationship", async () => {
    const manager = await createManager();

    const result = await provisionManagedProfile({
      creationSource: "manager",
      customerType: "business",
      externalSubjectId: "  customer-1  ",
      managerProfileId: manager.id
    });

    expect(result.created).toBe(true);
    expect(result.externalSubjectId).toBe("customer-1");
    expect(result.customerType).toBe("business");
    expect(await User.findByPk(result.profileId)).toMatchObject({
      activeCustomerEntityId: result.customerEntityId,
      email: null,
      kind: "managed"
    });
    expect(await CustomerEntity.findByPk(result.customerEntityId)).toMatchObject({
      profileId: result.profileId,
      status: "active",
      type: "business"
    });
    expect(await ManagedProfile.findByPk(result.id)).toMatchObject({
      creationSource: "manager",
      managerProfileId: manager.id,
      profileId: result.profileId,
      status: "active"
    });
  });

  it("returns the existing profile for an idempotent retry", async () => {
    const manager = await createManager();
    const input = {
      creationSource: "manager" as const,
      customerType: "individual" as const,
      externalSubjectId: "customer-2",
      managerProfileId: manager.id
    };

    const created = await provisionManagedProfile(input);
    const retried = await provisionManagedProfile({ ...input, creationSource: "vortex" });

    expect(retried).toEqual({ ...created, created: false });
    expect(await User.count({ where: { kind: "managed" } })).toBe(1);
    expect(await CustomerEntity.count({ where: { profileId: created.profileId } })).toBe(1);
    expect(await ManagedProfile.count()).toBe(1);
  });

  it("serializes concurrent retries for the same external subject", async () => {
    const manager = await createManager();
    const input = {
      creationSource: "manager" as const,
      customerType: "individual" as const,
      externalSubjectId: "customer-concurrent",
      managerProfileId: manager.id
    };

    const results = await Promise.all([provisionManagedProfile(input), provisionManagedProfile(input)]);

    expect(results.map(result => result.created).sort()).toEqual([false, true]);
    expect(results[0]?.profileId).toBe(results[1]?.profileId);
    expect(await User.count({ where: { kind: "managed" } })).toBe(1);
    expect(await CustomerEntity.count({ where: { profileId: results[0]?.profileId } })).toBe(1);
    expect(await ManagedProfile.count()).toBe(1);
  });

  it("rejects an idempotency key reused with a different customer type", async () => {
    const manager = await createManager();
    const input = {
      creationSource: "manager" as const,
      customerType: "individual" as const,
      externalSubjectId: "customer-3",
      managerProfileId: manager.id
    };
    await provisionManagedProfile(input);

    expect(provisionManagedProfile({ ...input, customerType: "business" })).rejects.toMatchObject({
      code: "MANAGED_PROFILE_CONFLICT"
    });
    expect(await User.count({ where: { kind: "managed" } })).toBe(1);
  });

  it("uses a separate external-subject namespace for each manager", async () => {
    const firstManager = await createManager();
    const secondManager = await createManager();

    const first = await provisionManagedProfile({
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "shared-subject",
      managerProfileId: firstManager.id
    });
    const second = await provisionManagedProfile({
      creationSource: "manager",
      customerType: "business",
      externalSubjectId: "shared-subject",
      managerProfileId: secondManager.id
    });

    expect(first.profileId).not.toBe(second.profileId);
    expect(await ManagedProfile.count()).toBe(2);
  });

  it("rejects missing, inactive, and invalid manager requests without partial records", async () => {
    const inactiveManager = await createManager(false);

    await expect(
      provisionManagedProfile({
        creationSource: "vortex",
        customerType: "individual",
        externalSubjectId: "customer-4",
        managerProfileId: crypto.randomUUID()
      })
    ).rejects.toBeInstanceOf(ManagedProfileProvisioningError);
    await expect(
      provisionManagedProfile({
        creationSource: "vortex",
        customerType: "individual",
        externalSubjectId: "customer-4",
        managerProfileId: inactiveManager.id
      })
    ).rejects.toMatchObject({ code: "MANAGED_PROFILE_MANAGER_INACTIVE" });
    await expect(
      provisionManagedProfile({
        creationSource: "vortex",
        customerType: "individual",
        externalSubjectId: "   ",
        managerProfileId: inactiveManager.id
      })
    ).rejects.toMatchObject({ code: "MANAGED_PROFILE_INVALID_INPUT" });

    expect(await User.count({ where: { kind: "managed" } })).toBe(0);
    expect(await ManagedProfile.count()).toBe(0);
  });
});
