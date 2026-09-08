import { beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import ApiCredential from "../../models/apiCredential.model";
import CustomerEntity from "../../models/customerEntity.model";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import ManagedProfileMembership from "../../models/managedProfileMembership.model";
import User from "../../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestApiKey, createTestUser } from "../../test-utils/factories";
import { getOrCreateCustomerEntityForProfile } from "./customer-entity.service";
import { createCredential, createManagedProfileCredential, revokeManagedProfileCredential } from "./apiCredential.service";
import {
  deleteManagedProfile,
  getManagedProfileActor,
  getManagedProfile,
  listManagedProfiles
} from "./managed-profile-lifecycle.service";
import { provisionManagedProfile } from "./managed-profile-provisioning.service";
import { configureManagedProfileManager } from "./managed-profile-manager.service";

async function createManager(isActive = true) {
  const manager = await createTestUser();
  await configureManagedProfileManager({ allowedCorridors: ["BR"], allowedCustomerTypes: null, isActive, profileId: manager.id });
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
      membership: { isOwner: true, role: "manager" },
      policy: { allowedCorridors: ["BR"], allowedCustomerTypes: null },
      profileId: active.profileId,
      status: "active"
    });
    const entityQueries = spyOn(CustomerEntity, "findAll");
    const allPage = await listManagedProfiles(manager.id, { limit: 50, offset: 0, status: "all" });
    expect(allPage.managedProfiles).toHaveLength(2);
    expect(entityQueries).toHaveBeenCalledTimes(1);
    entityQueries.mockRestore();
    expect(await getManagedProfile(manager.id, deleted.profileId)).toMatchObject({
      customerType: "business",
      status: "deleted"
    });
  });

  it("inherits one organization role across siblings and later children, but not foreign owners", async () => {
    const owner = await createManager();
    const otherOwner = await createManager();
    const member = await createTestUser();
    const visible = await provisionManagedProfile({
      contactEmail: "visible@example.com",
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "visible-child",
      managerProfileId: owner.id
    });
    const foreign = await provisionManagedProfile({
      contactEmail: "hidden@example.com",
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "hidden-child",
      managerProfileId: otherOwner.id
    });
    await ManagedProfileMembership.create({
      ownerProfileId: owner.id,
      memberProfileId: member.id,
      role: "read_only"
    });

    const page = await listManagedProfiles(member.id, { limit: 50, offset: 0, status: "active" });

    expect(page.total).toBe(1);
    expect(page.managedProfiles).toEqual([
      expect.objectContaining({
        membership: { isOwner: false, role: "read_only" },
        policy: { allowedCorridors: ["BR"], allowedCustomerTypes: null },
        profileId: visible.profileId
      })
    ]);
    expect(await getManagedProfile(member.id, visible.profileId)).toMatchObject({
      membership: { isOwner: false, role: "read_only" },
      policy: { allowedCorridors: ["BR"], allowedCustomerTypes: null }
    });
    const later = await provisionManagedProfile({
      contactEmail: "later@example.com", creationSource: "manager", customerType: "individual",
      externalSubjectId: "later", managerProfileId: owner.id
    });
    const sibling = await provisionManagedProfile({
      contactEmail: "sibling@example.com", creationSource: "manager", customerType: "individual",
      externalSubjectId: "sibling", managerProfileId: owner.id
    });
    expect((await listManagedProfiles(member.id, { limit: 50, offset: 0, status: "active" })).total).toBe(3);
    for (const child of [visible, later, sibling]) {
      expect(await getManagedProfile(member.id, child.profileId)).toMatchObject({ membership: { role: "read_only" } });
      await expect(deleteManagedProfile(member.id, child.profileId)).rejects.toMatchObject({ code: "MANAGED_PROFILE_OWNER_REQUIRED" });
    }
    await expect(getManagedProfile(member.id, foreign.profileId)).rejects.toMatchObject({ code: "MANAGED_PROFILE_NOT_FOUND" });
    await expect(deleteManagedProfile(member.id, foreign.profileId)).rejects.toMatchObject({ code: "MANAGED_PROFILE_NOT_FOUND" });
    await ManagedProfileMembership.update({ revokedAt: new Date(), revokedByProfileId: owner.id }, { where: { ownerProfileId: owner.id, memberProfileId: member.id } });
    for (const child of [visible, later, sibling]) {
      await expect(getManagedProfile(member.id, child.profileId)).rejects.toMatchObject({ code: "MANAGED_PROFILE_NOT_FOUND" });
    }
    expect(await listManagedProfiles(member.id, { limit: 50, offset: 0, status: "active" })).toMatchObject({
      actor: { hasMemberships: false }, total: 0
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

  it("preserves the original logical deletion timestamp on retry", async () => {
    const manager = await createManager();
    const child = await provisionManagedProfile({
      contactEmail: "delete-timestamp@example.com",
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "delete-timestamp",
      managerProfileId: manager.id
    });

    await deleteManagedProfile(manager.id, child.profileId);
    const firstDeletedAt = (await ManagedProfile.findOne({ where: { profileId: child.profileId } }))?.deletedAt;

    await deleteManagedProfile(manager.id, child.profileId);
    expect((await ManagedProfile.findOne({ where: { profileId: child.profileId } }))?.deletedAt).toEqual(
      firstDeletedAt as Date
    );
  });

  it("hides another manager's children and returns an empty active list for inactive owners", async () => {
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
    expect(await listManagedProfiles(manager.id, { limit: 50, offset: 0, status: "active" })).toMatchObject({
      actor: { canProvisionManagedProfiles: false, hasMemberships: false, profileId: manager.id },
      managedProfiles: [],
      total: 0
    });
    await expect(getManagedProfile(manager.id, child.profileId)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_ACCESS_DENIED"
    });
    await expect(deleteManagedProfile(manager.id, child.profileId)).rejects.toMatchObject({
      code: "MANAGED_PROFILE_ACCESS_DENIED"
    });
  });

  it("keeps hasMemberships independent of pagination and owner-only retained filters", async () => {
    const owner = await createManager();
    const otherOwner = await createManager();
    const member = await createTestUser();
    await ManagedProfileMembership.create({ ownerProfileId: owner.id, memberProfileId: member.id, role: "read_only" });
    expect(await getManagedProfileActor(member.id)).toMatchObject({ canProvisionManagedProfiles: false, hasMemberships: true });
    expect(await getManagedProfileActor(owner.id)).toMatchObject({ canProvisionManagedProfiles: true, hasMemberships: true });
    const owned = await provisionManagedProfile({
      managerProfileId: owner.id, customerType: "individual", creationSource: "manager",
      contactEmail: "owned-retained@example.com", externalSubjectId: "owned-retained"
    });
    const active = await provisionManagedProfile({
      managerProfileId: owner.id, customerType: "individual", creationSource: "manager",
      contactEmail: "own-active@example.com", externalSubjectId: "own-active"
    });
    await provisionManagedProfile({
      managerProfileId: otherOwner.id, customerType: "individual", creationSource: "manager",
      contactEmail: "delegated-active@example.com", externalSubjectId: "delegated-active"
    });
    await deleteManagedProfile(owner.id, owned.profileId);
    for (const status of ["active", "all", "deleted"] as const) {
      const page = await listManagedProfiles(owner.id, { limit: 1, offset: 100, status });
      expect(page).toMatchObject({
        actor: { canProvisionManagedProfiles: true, hasMemberships: true, profileId: owner.id },
        managedProfiles: [], total: status === "all" ? 2 : 1
      });
      const firstPage = await listManagedProfiles(owner.id, { limit: 1, offset: 0, status });
      expect(firstPage.managedProfiles.map(row => row.profileId)).toEqual([status === "deleted" ? owned.profileId : active.profileId]);
    }
    for (const status of ["all", "deleted"] as const) {
      await expect(listManagedProfiles(member.id, { limit: 50, offset: 0, status })).rejects.toMatchObject({ code: "MANAGED_PROFILE_OWNER_REQUIRED" });
    }
    await expect(getManagedProfile(member.id, owned.profileId)).rejects.toMatchObject({ code: "MANAGED_PROFILE_NOT_FOUND" });
    await CustomerEntity.update({ status: "archived" }, { where: { profileId: active.profileId } });
    expect(await listManagedProfiles(owner.id, { limit: 1, offset: 0, status: "active" })).toMatchObject({
      actor: { canProvisionManagedProfiles: true, hasMemberships: true }, managedProfiles: [], total: 0
    });
    await CustomerEntity.update({ status: "active" }, { where: { profileId: active.profileId } });
    await CustomerEntity.create({ profileId: active.profileId, status: "active", type: "business" });
    expect(await listManagedProfiles(owner.id, { limit: 1, offset: 0, status: "active" })).toMatchObject({
      actor: { canProvisionManagedProfiles: true, hasMemberships: true }, managedProfiles: [], total: 0
    });
  });

  it("masks future children and membership gaps while invalidating evidenced bootstrap", async () => {
    const owner = await createManager();
    const member = await createTestUser();
    const membership = await ManagedProfileMembership.create({
      ownerProfileId: owner.id, memberProfileId: member.id, role: "manager"
    });
    const existing = await provisionManagedProfile({
      managerProfileId: owner.id, customerType: "individual", creationSource: "manager",
      contactEmail: "before-revoke@example.com", externalSubjectId: "before-revoke"
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    await membership.update({ revokedAt: new Date(), revokedByProfileId: owner.id });
    await expect(getManagedProfile(member.id, existing.profileId, { bootstrap: true })).rejects.toMatchObject({
      code: "MANAGED_PROFILE_MEMBERSHIP_INVALID"
    });
    const future = await provisionManagedProfile({
      managerProfileId: owner.id, customerType: "individual", creationSource: "manager",
      contactEmail: "after-revoke@example.com", externalSubjectId: "after-revoke"
    });
    for (const profileId of [future.profileId, crypto.randomUUID()]) {
      await expect(getManagedProfile(member.id, profileId, { bootstrap: true })).rejects.toMatchObject({
        code: "MANAGED_PROFILE_NOT_FOUND"
      });
    }
    await deleteManagedProfile(owner.id, future.profileId);
    await new Promise(resolve => setTimeout(resolve, 5));
    await ManagedProfileMembership.create({ ownerProfileId: owner.id, memberProfileId: member.id, role: "manager" });
    await expect(getManagedProfile(member.id, future.profileId, { bootstrap: true })).rejects.toMatchObject({
      code: "MANAGED_PROFILE_NOT_FOUND"
    });
    await expect(getManagedProfile(owner.id, future.profileId, { bootstrap: true })).rejects.toMatchObject({
      code: "MANAGED_PROFILE_MEMBERSHIP_INVALID"
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

    let releaseCreate: () => void = () => undefined;
    const createBarrier = new Promise<void>(resolve => {
      releaseCreate = resolve;
    });
    let creationReachedInsert: () => void = () => undefined;
    const creationAtInsert = new Promise<void>(resolve => {
      creationReachedInsert = resolve;
    });
    const profileQueries = spyOn(User, "findByPk");
    const relationshipQueries = spyOn(ManagedProfile, "findOne");
    ApiCredential.addHook("beforeCreate", "managed-profile-delete-race", async () => {
      creationReachedInsert();
      await createBarrier;
    });

    let deletionSettled = false;
    try {
      const creation = createManagedProfileCredential({
        actorProfileId: manager.id,
        environment: "test",
        profileId: child.profileId
      });
      await creationAtInsert;
      const deletion = deleteManagedProfile(manager.id, child.profileId).finally(() => {
        deletionSettled = true;
      });
      await new Promise(resolve => setTimeout(resolve, 25));
      const deletionWaitedForCreation = !deletionSettled;
      releaseCreate();

      const outcomes = await Promise.allSettled([creation, deletion]);
      expect(deletionWaitedForCreation).toBe(true);
      expect(outcomes.map(outcome => outcome.status)).toEqual(["fulfilled", "fulfilled"]);
      expect(profileQueries).toHaveBeenCalledWith(
        child.profileId,
        expect.objectContaining({ lock: expect.anything(), transaction: expect.anything() })
      );
      expect(relationshipQueries).toHaveBeenCalledWith(
        expect.objectContaining({
          lock: expect.anything(),
          transaction: expect.anything(),
          where: { managerProfileId: manager.id, profileId: child.profileId, status: "active" }
        })
      );
    } finally {
      releaseCreate();
      ApiCredential.removeHook("beforeCreate", "managed-profile-delete-race");
      profileQueries.mockRestore();
      relationshipQueries.mockRestore();
    }

    expect(await ApiCredential.count({ where: { profileId: child.profileId, revokedAt: null } })).toBe(0);
    expect(await ManagedProfile.findOne({ where: { profileId: child.profileId } })).toMatchObject({ status: "deleted" });
  });

  it("keeps the original revocation time when a child credential is revoked twice", async () => {
    const manager = await createManager();
    const child = await provisionManagedProfile({
      contactEmail: "revoke-twice@example.com",
      creationSource: "manager",
      customerType: "individual",
      externalSubjectId: "revoke-twice",
      managerProfileId: manager.id
    });
    const credential = await createManagedProfileCredential({
      actorProfileId: manager.id,
      environment: "test",
      profileId: child.profileId
    });

    await revokeManagedProfileCredential(manager.id, child.profileId, credential.id);
    const firstRevokedAt = (await ApiCredential.findByPk(credential.id))?.revokedAt;

    // Repeating the revoke stays idempotent, but must not move the recorded revocation time.
    await revokeManagedProfileCredential(manager.id, child.profileId, credential.id);
    expect((await ApiCredential.findByPk(credential.id))?.revokedAt).toEqual(firstRevokedAt as Date);

    await expect(revokeManagedProfileCredential(manager.id, child.profileId, crypto.randomUUID())).rejects.toMatchObject({
      code: "CREDENTIAL_NOT_FOUND"
    });
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
