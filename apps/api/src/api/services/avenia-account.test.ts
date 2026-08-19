import { afterEach, describe, expect, it, mock } from "bun:test";
import CustomerEntity from "../../models/customerEntity.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import User from "../../models/user.model";
import { resolveAveniaAccountForUser } from "./avenia-account";

const originalEntityFindAll = CustomerEntity.findAll;
const originalEntityFindOrCreate = CustomerEntity.findOrCreate;
const originalProviderFindAll = ProviderCustomer.findAll;
const originalUserFindByPk = User.findByPk;

afterEach(() => {
  CustomerEntity.findAll = originalEntityFindAll;
  CustomerEntity.findOrCreate = originalEntityFindOrCreate;
  ProviderCustomer.findAll = originalProviderFindAll;
  User.findByPk = originalUserFindByPk;
});

function mockOwnedEntities(ids: string[]) {
  CustomerEntity.findAll = mock(async () => ids.map(id => ({ id }))) as unknown as typeof CustomerEntity.findAll;
}

function approvedAccount(entityId: string, subAccountId: string) {
  return {
    customerEntityId: entityId,
    customerType: "individual",
    providerSubaccountId: subAccountId,
    status: VerificationStatus.Approved,
    taxReference: "08786985906"
  };
}

describe("resolveAveniaAccountForUser", () => {
  // Migration 040 attached legacy rows to the profile's individual entity; resolving through
  // the single active entity failed with "No completed provider profile found" for the owner.
  it("finds the approved account on a non-active entity of a multi-entity profile", async () => {
    mockOwnedEntities(["entity-individual", "entity-business"]);
    ProviderCustomer.findAll = mock(async () => [
      approvedAccount("entity-individual", "sub-1")
    ]) as unknown as typeof ProviderCustomer.findAll;

    const resolved = await resolveAveniaAccountForUser("user-1");

    expect(resolved.subAccountId).toBe("sub-1");
    expect(resolved.taxId).toBe("08786985906");
  });

  it("prefers the active entity's account when several are approved", async () => {
    mockOwnedEntities(["entity-individual", "entity-business"]);
    ProviderCustomer.findAll = mock(async () => [
      approvedAccount("entity-individual", "sub-1"),
      approvedAccount("entity-business", "sub-2")
    ]) as unknown as typeof ProviderCustomer.findAll;
    User.findByPk = mock(async () => ({ activeCustomerEntityId: "entity-business" })) as unknown as typeof User.findByPk;

    const resolved = await resolveAveniaAccountForUser("user-1");

    expect(resolved.subAccountId).toBe("sub-2");
  });

  it("rejects as ambiguous when several are approved and none belongs to the active entity", async () => {
    mockOwnedEntities(["entity-individual", "entity-business"]);
    ProviderCustomer.findAll = mock(async () => [
      approvedAccount("entity-individual", "sub-1"),
      approvedAccount("entity-business", "sub-2")
    ]) as unknown as typeof ProviderCustomer.findAll;
    User.findByPk = mock(async () => ({ activeCustomerEntityId: null })) as unknown as typeof User.findByPk;

    await expect(resolveAveniaAccountForUser("user-1")).rejects.toThrow("Multiple completed provider profiles found");
  });

  it("fails without creating an entity when the profile owns none", async () => {
    mockOwnedEntities([]);
    const providerFindAll = mock(async () => []);
    ProviderCustomer.findAll = providerFindAll as unknown as typeof ProviderCustomer.findAll;
    const strayCreate = mock(async () => [{ id: "entity-new" }, true]);
    CustomerEntity.findOrCreate = strayCreate as unknown as typeof CustomerEntity.findOrCreate;

    await expect(resolveAveniaAccountForUser("user-1")).rejects.toThrow("No completed provider profile found");
    expect(providerFindAll).not.toHaveBeenCalled();
    expect(strayCreate).not.toHaveBeenCalled();
  });
});
