import { afterEach, describe, expect, it, mock } from "bun:test";
import { Op } from "sequelize";
import sequelize from "../../config/database";
import ApiCredential from "../../models/apiCredential.model";
import CustomerEntity from "../../models/customerEntity.model";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import ManagedProfileMembership from "../../models/managedProfileMembership.model";
import User from "../../models/user.model";
import { digestApiKey, generateApiKey, getSecretKeyLookupPrefix } from "../middlewares/apiKeyFormat";
import {
  createCredential,
  createManagedProfileCredential,
  assertApiCredentialSchemaReady,
  MAX_ACTIVE_CREDENTIALS_PER_PROFILE,
  revokeCredential,
  revokeManagedProfileCredential,
  validatePublicKey,
  validateSecretKey
} from "./apiCredential.service";

const originals = {
  entityFindAll: CustomerEntity.findAll,
  membershipFindOne: ManagedProfileMembership.findOne,
  count: ApiCredential.count,
  managerFindByPk: ManagedProfileManager.findByPk,
  managedProfileFindOne: ManagedProfile.findOne,
  create: ApiCredential.create,
  findAll: ApiCredential.findAll,
  findByPk: User.findByPk,
  findOne: ApiCredential.findOne,
  transaction: sequelize.transaction,
  query: sequelize.query,
  update: ApiCredential.update
};

afterEach(() => {
  CustomerEntity.findAll = originals.entityFindAll;
  ManagedProfileMembership.findOne = originals.membershipFindOne;
  ApiCredential.count = originals.count;
  ApiCredential.create = originals.create;
  ApiCredential.findAll = originals.findAll;
  ApiCredential.findOne = originals.findOne;
  ApiCredential.update = originals.update;
  ManagedProfile.findOne = originals.managedProfileFindOne;
  ManagedProfileManager.findByPk = originals.managerFindByPk;
  User.findByPk = originals.findByPk;
  sequelize.transaction = originals.transaction;
  sequelize.query = originals.query;
});

describe("api credential service", () => {
  function managedAuthority() {
    const lockOrder: string[] = [];
    const transaction = { LOCK: { UPDATE: "UPDATE" } };
    const membership = { role: "manager" };
    sequelize.transaction = mock(async callback => callback(transaction as never)) as never;
    ManagedProfile.findOne = mock(async (options: { lock?: unknown }) => {
      if (options.lock) lockOrder.push("relationship");
      return { managerProfileId: "owner", profileId: "child", status: "active" };
    }) as never;
    ManagedProfileManager.findByPk = mock(async () => {
      lockOrder.push("owner-config");
      return { isActive: true };
    }) as never;
    User.findByPk = mock(async (id: string, options: { lock?: unknown }) => {
      if (options.lock) lockOrder.push(`profile:${id}`);
      return { activeCustomerEntityId: "entity", kind: id === "child" ? "managed" : "authenticated" };
    }) as never;
    CustomerEntity.findAll = mock(async () => {
      lockOrder.push("entity");
      return [{ id: "entity", status: "active" }];
    }) as never;
    ManagedProfileMembership.findOne = mock(async () => {
      lockOrder.push("membership");
      return membership;
    }) as never;
    ApiCredential.count = mock(async () => 0) as never;
    ApiCredential.create = mock(async values => {
      lockOrder.push("write");
      return { ...values, id: "credential" };
    }) as never;
    ApiCredential.update = mock(async () => {
      lockOrder.push("write");
      return [1];
    }) as never;
    return { lockOrder, membership, transaction };
  }

  it.each(["create", "revoke"] as const)("holds common owner/child/membership locks through credential %s", async operation => {
    const { lockOrder, transaction } = managedAuthority();
    if (operation === "create") {
      await createManagedProfileCredential({ actorProfileId: "member", environment: "test", profileId: "child" });
    } else {
      await revokeManagedProfileCredential("member", "child", "credential");
    }
    expect(lockOrder).toEqual(["owner-config", "profile:owner", "profile:child", "relationship", "entity", "membership", "write"]);
    const lockOptions = { lock: "UPDATE", transaction };
    expect(ManagedProfileManager.findByPk).toHaveBeenCalledWith("owner", lockOptions);
    expect(User.findByPk).toHaveBeenCalledWith("owner", lockOptions);
    expect(User.findByPk).toHaveBeenCalledWith("child", lockOptions);
    expect(CustomerEntity.findAll).toHaveBeenCalledWith({ ...lockOptions, where: { profileId: "child" } });
    expect(ManagedProfileMembership.findOne).toHaveBeenCalledWith({
      ...lockOptions, where: { managedProfileId: "child", memberProfileId: "member", revokedAt: null }
    });
    if (operation === "create") {
      expect(ApiCredential.count).toHaveBeenCalledWith(expect.objectContaining({ transaction }));
      expect(ApiCredential.create).toHaveBeenCalledWith(expect.objectContaining({ profileId: "child", partnerId: null }), { transaction });
    } else {
      expect(ApiCredential.update).toHaveBeenCalledWith({ revokedAt: expect.any(Date) }, {
        transaction, where: { id: "credential", profileId: "child", revokedAt: null }
      });
    }
  });

  it.each(["read_only", "unknown"])("denies live %s membership for both credential mutations", async role => {
    const { membership } = managedAuthority();
    membership.role = role;
    await expect(createManagedProfileCredential({ actorProfileId: "member", environment: "test", profileId: "child" }))
      .rejects.toMatchObject({ code: "CREDENTIAL_ACCESS_DENIED" });
    await expect(revokeManagedProfileCredential("member", "child", "credential"))
      .rejects.toMatchObject({ code: "CREDENTIAL_ACCESS_DENIED" });
    expect(ApiCredential.create).not.toHaveBeenCalled();
    expect(ApiCredential.update).not.toHaveBeenCalled();
  });

  it("locks the profile and excludes expired credentials from the cap query", async () => {
    const transaction = { LOCK: { UPDATE: "UPDATE" } };
    let countWhere: Record<PropertyKey, unknown> = {};
    User.findByPk = mock(async () => ({ id: "profile-1" })) as never;
    ApiCredential.count = mock(async options => {
      countWhere = options?.where as Record<PropertyKey, unknown>;
      return MAX_ACTIVE_CREDENTIALS_PER_PROFILE;
    }) as never;
    sequelize.transaction = mock(async callback => callback(transaction as never)) as never;

    await expect(createCredential({ environment: "test", profileId: "profile-1" })).rejects.toMatchObject({
      code: "CREDENTIAL_LIMIT_REACHED"
    });
    expect(User.findByPk).toHaveBeenCalledWith("profile-1", expect.objectContaining({ lock: "UPDATE", transaction }));
    expect(countWhere.revokedAt).toBeNull();
    expect(countWhere.expiresAt).toEqual({ [Op.gt]: expect.any(Date) });
  });

  it("revokes both key values atomically with one credential update", async () => {
    const update = mock(async () => [1]);
    ApiCredential.update = update as never;

    await revokeCredential("credential-1", { partnerId: null, profileId: "profile-1" });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      { revokedAt: expect.any(Date) },
      { where: { id: "credential-1", partnerId: null, profileId: "profile-1", revokedAt: null } }
    );
  });

  it("validates public and secret values to the same credential", async () => {
    const secret = generateApiKey("secret", "test");
    const credential = Object.assign(new ApiCredential(), {
      environment: "test",
      expiresAt: new Date(Date.now() + 60_000),
      id: "credential-1",
      partnerId: null,
      profileId: "profile-1",
      publicKeyValue: generateApiKey("public", "test"),
      revokedAt: null,
      secretKeyDigest: digestApiKey(secret),
      secretKeyPrefix: getSecretKeyLookupPrefix(secret),
      profile: { kind: "authenticated" },
      update: mock(async () => credential)
    });
    ApiCredential.findOne = mock(async () => credential) as never;
    ApiCredential.findAll = mock(async () => [credential]) as never;

    const publicContext = await validatePublicKey(credential.publicKeyValue);
    const secretContext = await validateSecretKey(secret);

    expect(publicContext).toMatchObject({ credentialId: credential.id, profileId: "profile-1", strength: "public" });
    expect(secretContext).toMatchObject({ credentialId: credential.id, profileId: "profile-1", strength: "secret" });
  });

  it("dynamically invalidates both values when managed control is inactive", async () => {
    const secret = generateApiKey("secret", "test");
    const credential = Object.assign(new ApiCredential(), {
      environment: "test",
      id: "credential-1",
      partnerId: null,
      profileId: "profile-1",
      publicKeyValue: generateApiKey("public", "test"),
      secretKeyDigest: digestApiKey(secret),
      secretKeyPrefix: getSecretKeyLookupPrefix(secret),
      profile: { kind: "managed" },
      update: mock(async () => credential)
    });
    ApiCredential.findOne = mock(async () => credential) as never;
    ApiCredential.findAll = mock(async () => [credential]) as never;
    ManagedProfile.findOne = mock(async () => ({ id: "relationship-1", managerProfileId: "manager-1" })) as never;
    ManagedProfileManager.findByPk = mock(async () => ({ allowedCorridors: ["BR"], isActive: false })) as never;

    expect(await validatePublicKey(credential.publicKeyValue)).toBeNull();
    expect(await validateSecretKey(secret)).toBeNull();
    expect(credential.update).not.toHaveBeenCalled();
  });

  it("dynamically invalidates both values when the managed relationship is deleted", async () => {
    const secret = generateApiKey("secret", "test");
    const credential = Object.assign(new ApiCredential(), {
      environment: "test",
      id: "credential-1",
      partnerId: null,
      profileId: "profile-1",
      publicKeyValue: generateApiKey("public", "test"),
      secretKeyDigest: digestApiKey(secret),
      secretKeyPrefix: getSecretKeyLookupPrefix(secret),
      profile: { kind: "managed" },
      update: mock(async () => credential)
    });
    ApiCredential.findOne = mock(async () => credential) as never;
    ApiCredential.findAll = mock(async () => [credential]) as never;
    const findRelationship = mock(async (options: { where?: { status?: string } }) =>
      options.where?.status === "active" ? null : { id: "relationship-1", managerProfileId: "manager-1" }
    );
    ManagedProfile.findOne = findRelationship as never;
    ManagedProfileManager.findByPk = mock(async () => ({ allowedCorridors: ["BR"], isActive: true })) as never;

    expect(await validatePublicKey(credential.publicKeyValue)).toBeNull();
    expect(await validateSecretKey(secret)).toBeNull();
    expect(findRelationship).toHaveBeenCalledTimes(2);
    for (const [options] of findRelationship.mock.calls) {
      expect(options).toMatchObject({ where: { profileId: "profile-1", status: "active" } });
    }
    expect(credential.update).not.toHaveBeenCalled();
  });

  it("attaches immutable managed control metadata to valid credentials", async () => {
    const credential = Object.assign(new ApiCredential(), {
      environment: "test",
      id: "credential-1",
      partnerId: null,
      profileId: "profile-1",
      publicKeyValue: generateApiKey("public", "test"),
      profile: { kind: "managed" },
      update: mock(async () => credential)
    });
    ApiCredential.findOne = mock(async () => credential) as never;
    ManagedProfile.findOne = mock(async () => ({ id: "relationship-1", managerProfileId: "manager-1" })) as never;
    ManagedProfileManager.findByPk = mock(async () => ({
      allowedCorridors: ["BR", "MX"],
      allowedCustomerTypes: ["individual"],
      isActive: true
    })) as never;

    const result = await validatePublicKey(credential.publicKeyValue);

    expect(result?.managedProfile).toEqual({
      allowedCorridors: ["BR", "MX"],
      allowedCustomerTypes: ["individual"],
      controllingManagerProfileId: "manager-1",
      relationshipId: "relationship-1"
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.managedProfile)).toBe(true);
    expect(Object.isFrozen(result?.managedProfile?.allowedCorridors)).toBe(true);
    expect(Object.isFrozen(result?.managedProfile?.allowedCustomerTypes)).toBe(true);
  });

  it("represents a missing manager customer-type restriction as null", async () => {
    const credential = Object.assign(new ApiCredential(), {
      environment: "test",
      id: "credential-1",
      partnerId: null,
      profileId: "profile-1",
      publicKeyValue: generateApiKey("public", "test"),
      profile: { kind: "managed" },
      update: mock(async () => credential)
    });
    ApiCredential.findOne = mock(async () => credential) as never;
    ManagedProfile.findOne = mock(async () => ({ id: "relationship-1", managerProfileId: "manager-1" })) as never;
    ManagedProfileManager.findByPk = mock(async () => ({
      allowedCorridors: ["AR"],
      allowedCustomerTypes: null,
      isActive: true
    })) as never;

    expect((await validatePublicKey(credential.publicKeyValue))?.managedProfile?.allowedCustomerTypes).toBeNull();
  });

  it("refuses startup while the legacy api_keys table remains", async () => {
    const columns = [
      "created_at",
      "environment",
      "expires_at",
      "id",
      "name",
      "partner_id",
      "profile_id",
      "public_key_value",
      "public_last_used_at",
      "revoked_at",
      "secret_key_digest",
      "secret_key_prefix",
      "secret_last_used_at",
      "updated_at"
    ];
    sequelize.query = mock(async (sql: string) => {
      if (sql.includes("information_schema.columns")) {
        return columns.map(column_name => ({
          column_name,
          is_nullable: ["partner_id", "public_last_used_at", "revoked_at", "secret_last_used_at"].includes(column_name)
            ? "YES"
            : "NO"
        }));
      }
      if (sql.includes("pg_indexes")) {
        return [
          "api_credentials_pkey",
          "idx_api_credentials_partner_id",
          "idx_api_credentials_profile_id",
          "idx_api_credentials_secret_key_prefix",
          "uq_api_credentials_public_key_value",
          "uq_api_credentials_secret_key_digest"
        ].map(indexname => ({ indexname }));
      }
      if (sql.includes("information_schema.tables")) return [{ table_name: "api_keys" }];
      return [
        "api_credentials_partner_id_fkey",
        "api_credentials_profile_id_fkey",
        "chk_api_credentials_secret_digest",
        "chk_api_credentials_secret_prefix_length"
      ].map(conname => ({ conname }));
    }) as never;

    await expect(assertApiCredentialSchemaReady()).rejects.toThrow("legacy api_keys table still exists");
  });
});
