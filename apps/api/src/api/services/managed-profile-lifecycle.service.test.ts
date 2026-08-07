import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import ApiCredential from "../../models/apiCredential.model";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestApiKey, createTestUser } from "../../test-utils/factories";
import { getOrCreateCustomerEntityForProfile } from "./customer-entity.service";
import { createCredential, createManagedProfileCredential } from "./apiCredential.service";
import {
  deleteManagedProfile,
  getManagedProfile,
  listManagedProfiles,
  ManagedProfileLifecycleError
} from "./managed-profile-lifecycle.service";
import { provisionManagedProfile } from "./managed-profile-provisioning.service";

async function createManager(isActive = true) {
  const manager = await createTestUser();
  await ManagedProfileManager.create({ allowedCorridors: ["BR"], isActive, profileId: manager.id });
  return manager;
}

describe("managed profile lifecycle", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetTestDatabase);

  it("lists active children by default and can read deleted children", async () => {
    const manager = await createManager();
    const active = await provisionManagedProfile({
      contactEmail: "active@example.com",
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "active-child",
      managerProfileId: manager.id
    });
    const deleted = await provisionManagedProfile({
      contactEmail: "deleted@example.com",
      creationSource: "vortex",
      customerType: "business",
      externalSubjectId: "deleted-child",
      managerProfileId: manager.id
    });
    await deleteManagedProfile(manager.id, deleted.profileId);

    const activePage = await listManagedProfiles(manager.id, { limit: 50, offset: 0, status: "active" });
    expect(activePage.total).toBe(1);
    expect(activePage.managedProfiles[0]).toMatchObject({
      externalSubjectId: "active-child",
      profileId: active.profileId,
      status: "active"
    });
    expect(await getManagedProfile(manager.id, deleted.profileId)).toMatchObject({
      customerType: "business",
      status: "deleted"
    });
  });

  it("logically deletes idempotently and revokes every active child credential", async () => {
    const manager = await createManager();
    const child = await provisionManagedProfile({
      contactEmail: "delete@example.com",
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "delete-child",
      managerProfileId: manager.id
    });
    const firstCredential = await createTestApiKey({ userId: child.profileId });
    const secondCredential = await createTestApiKey({ userId: child.profileId });

    await Promise.all([
      deleteManagedProfile(manager.id, child.profileId),
      deleteManagedProfile(manager.id, child.profileId)
    ]);

    const relationship = await ManagedProfile.findOne({ where: { profileId: child.profileId } });
    expect(relationship).toMatchObject({ status: "deleted" });
    expect(relationship?.deletedAt).toBeInstanceOf(Date);
    expect(await ApiCredential.count({ where: { profileId: child.profileId, revokedAt: null } })).toBe(0);
    expect(await ApiCredential.findByPk(firstCredential.record.id)).toMatchObject({ revokedAt: expect.any(Date) });
    expect(await ApiCredential.findByPk(secondCredential.record.id)).toMatchObject({ revokedAt: expect.any(Date) });
  });

  it("hides another manager's children and denies inactive managers all lifecycle access", async () => {
    const manager = await createManager();
    const otherManager = await createManager();
    const child = await provisionManagedProfile({
      contactEmail: "private@example.com",
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "private-child",
      managerProfileId: manager.id
    });

    await expect(getManagedProfile(otherManager.id, child.profileId)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_NOT_FOUND"
    });
    await expect(deleteManagedProfile(otherManager.id, child.profileId)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_NOT_FOUND"
    });

    await ManagedProfileManager.update({ isActive: false }, { where: { profileId: manager.id } });
    await expect(listManagedProfiles(manager.id, { limit: 50, offset: 0, status: "active" })).rejects.toBeInstanceOf(
      ManagedProfileLifecycleError
    );
    await expect(getManagedProfile(manager.id, child.profileId)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_ACCESS_DENIED"
    });
    await expect(deleteManagedProfile(manager.id, child.profileId)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_ACCESS_DENIED"
    });
  });

  it("prevents a managed child from creating a second customer-entity type", async () => {
    const manager = await createManager();
    const child = await provisionManagedProfile({
      contactEmail: "typed@example.com",
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "typed-child",
      managerProfileId: manager.id
    });

    await expect(getOrCreateCustomerEntityForProfile(child.profileId, "business")).rejects.toMatchObject({
      type: "MANAGED_PROFILE_ENTITY_TYPE_IMMUTABLE"
    });
  });

  it("serializes child credential creation against logical deletion", async () => {
    const manager = await createManager();
    const child = await provisionManagedProfile({
      contactEmail: "race@example.com",
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "race-child",
      managerProfileId: manager.id
    });

    await Promise.allSettled([
      createManagedProfileCredential({ environment: "test", managerProfileId: manager.id, profileId: child.profileId }),
      deleteManagedProfile(manager.id, child.profileId)
    ]);

    expect(await ApiCredential.count({ where: { profileId: child.profileId, revokedAt: null } })).toBe(0);
    expect(await ManagedProfile.findOne({ where: { profileId: child.profileId } })).toMatchObject({ status: "deleted" });
  });

  it("requires managed child credentials to use the controlling-manager issuance path", async () => {
    const manager = await createManager();
    const child = await provisionManagedProfile({
      contactEmail: "partner-bypass@example.com",
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "partner-bypass",
      managerProfileId: manager.id
    });

    await expect(createCredential({ environment: "test", profileId: child.profileId })).rejects.toMatchObject({
      code: "INVALID_CREDENTIAL_SUBJECT"
    });
    await expect(
      createCredential({ environment: "test", partnerId: "11111111-1111-4111-8111-111111111111", profileId: child.profileId })
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL_SUBJECT" });
  });
});
