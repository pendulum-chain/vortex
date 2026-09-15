import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { getOrCreateCustomerEntityForProfile, selectActiveCustomerEntity } from "../api/services/customer-entity.service";
import { loadMoneriumBinding } from "../api/services/monerium/identity";
import ProviderCustomer, { VerificationStatus } from "../models/providerCustomer.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestUser } from "../test-utils/factories";

const PROFILE_ID = "9e6a92a5-5f6d-48aa-a57b-0f8ae8eb745d";

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await resetTestDatabase();
});

// The widget always onboards EUR as `individual`, while the dashboard switcher and managed
// profiles can make a business entity active. Registration carries no customer type, so the
// binding must be found on whichever entity holds it.
describe("loadMoneriumBinding", () => {
  it("finds the Monerium binding on a non-active entity", async () => {
    const user = await createTestUser();
    const individual = await getOrCreateCustomerEntityForProfile(user.id, "individual");
    await ProviderCustomer.create({
      customerEntityId: individual.id,
      customerType: "individual",
      provider: "monerium",
      providerCustomerId: PROFILE_ID,
      rail: "eur",
      status: VerificationStatus.Approved,
      statusExternal: "approved"
    });
    const business = await selectActiveCustomerEntity(user.id, "business");

    await expect(loadMoneriumBinding(user.id)).resolves.toEqual({
      customerEntityId: individual.id,
      customerType: "individual",
      profileId: PROFILE_ID
    });
    expect(business.type).toBe("business");
  });

  it("prefers the active entity's binding when several entities are bound", async () => {
    const user = await createTestUser();
    const individual = await getOrCreateCustomerEntityForProfile(user.id, "individual");
    const business = await selectActiveCustomerEntity(user.id, "business");
    for (const entity of [individual, business]) {
      await ProviderCustomer.create({
        customerEntityId: entity.id,
        customerType: entity.type,
        provider: "monerium",
        providerCustomerId: `${entity.type}-profile`,
        rail: "eur",
        status: VerificationStatus.Approved,
        statusExternal: "approved"
      });
    }

    await expect(loadMoneriumBinding(user.id)).resolves.toEqual({
      customerEntityId: business.id,
      customerType: "business",
      profileId: "business-profile"
    });
  });

  it("reports the active entity with no profile when nothing is bound", async () => {
    const user = await createTestUser();
    const individual = await getOrCreateCustomerEntityForProfile(user.id, "individual");

    await expect(loadMoneriumBinding(user.id)).resolves.toEqual({
      customerEntityId: individual.id,
      customerType: "individual",
      profileId: null
    });
  });
});
