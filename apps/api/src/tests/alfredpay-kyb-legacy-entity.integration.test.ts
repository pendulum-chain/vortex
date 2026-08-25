import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  DomesticCountry,
  AlfredPayStatus,
  AlfredpayApiService,
  DomesticCustomerType,
  AlfredpayKycStatus
} from "@vortexfi/shared";
import { createAlfredpayCustomer, findAlfredpayCustomer } from "../api/services/alfredpay/alfredpay-customer.service";
import { getOrCreateCustomerEntityForProfile } from "../api/services/customer-entity.service";
import CustomerEntity from "../models/customerEntity.model";
import KycCase from "../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../models/providerCustomer.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestUser } from "../test-utils/factories";
import { type FakeSupabaseAuth, installFakeSupabaseAuth, testUserToken } from "../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../test-utils/test-app";

// Regression suite for the migrated-entity mismatch: migration 038 backfilled one *individual*
// entity per profile, and migration 040 attached the legacy provider rows to it — including
// business-typed (KYB) rows. Typed business lookups then resolved a fresh, empty *business*
// entity, so every KYB wizard endpoint 404'd ("Business customer not found") for
// migrated business customers and left the stray entity behind, while the type-less
// dashboard/ramp lookups kept finding the rows on the active entity — a resumable KYB the
// wizard could not act on. Typed lookups now scan every entity the profile owns.

let api: TestApp;
let fakeAuth: FakeSupabaseAuth;
const realGetInstance = AlfredpayApiService.getInstance;

beforeAll(async () => {
  await setupTestDatabase();
  fakeAuth = installFakeSupabaseAuth();
  api = await startTestApp();
});

afterAll(async () => {
  await api.close();
  fakeAuth.restore();
});

beforeEach(async () => {
  await resetTestDatabase();
});

afterEach(() => {
  AlfredpayApiService.getInstance = realGetInstance;
});

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// The exact post-migration production shape: a business-typed alfredpay row (plus its kyb
// kyc_case) parked on the profile's active individual entity.
async function seedLegacyBusinessCustomer(email: string) {
  const user = await createTestUser({ email });
  const token = testUserToken(user.id, email);
  const entity = await getOrCreateCustomerEntityForProfile(user.id);
  await user.update({ activeCustomerEntityId: entity.id });
  const record = await ProviderCustomer.create({
    country: "CO",
    customerEntityId: entity.id,
    customerType: "business",
    provider: "alfredpay",
    providerCustomerId: "ap-legacy-kyb",
    rail: "cop",
    status: VerificationStatus.Pending,
    statusExternal: "PENDING"
  });
  await KycCase.create({
    customerEntityId: entity.id,
    level: "level_1",
    provider: "alfredpay",
    providerCaseId: "kyb-sub-legacy",
    providerCustomerId: record.id,
    status: VerificationStatus.Pending,
    statusExternal: "PENDING",
    type: "kyb"
  });
  return { entity, record, token, user };
}

// Carries the compliance questionnaire because `validateKybSubmission` rejects a submission
// without it.
const KYB_FORM = {
  accountPurpose: "Treasury management",
  address: "Calle 1 # 2-3",
  businessActivities: "Cross-border payments software",
  businessName: "Legacy SAS",
  city: "Bogota",
  country: "CO",
  expectedMonthlyTransactions: 120,
  expectedMonthlyVolumeUsd: 50000,
  isRegulatedBusiness: false,
  operatesInSanctionedCountries: false,
  relatedPersons: [
    {
      dateOfBirth: "1990-01-01",
      email: "rep@example.com",
      firstName: "Ana",
      lastName: "Rep",
      nationalities: ["CO"],
      pep: false
    }
  ],
  sourceOfFunds: "Sale of goods/services",
  state: "DC",
  taxId: "900123456",
  transmitsCustomerFunds: false,
  walletAddresses: "N/A",
  website: "https://legacy.example.com",
  zipCode: "110111"
};

describe("Alfredpay KYB on a migrated (individual-entity) profile", () => {
  it("typed and type-less lookups agree on the migrated business customer", async () => {
    const { user } = await seedLegacyBusinessCustomer("kyb-legacy-agree@example.com");

    const typeless = await findAlfredpayCustomer(user.id, DomesticCountry.CO);
    const typed = await findAlfredpayCustomer(user.id, DomesticCountry.CO, DomesticCustomerType.BUSINESS);

    expect(typeless?.alfredPayId).toBe("ap-legacy-kyb");
    expect(typed?.alfredPayId).toBe("ap-legacy-kyb");
  });

  it("findKybCustomerAndBusiness resolves the migrated customer without creating a stray entity", async () => {
    const { token, user } = await seedLegacyBusinessCustomer("kyb-legacy-find@example.com");

    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybBusinessDetails: mock(async () => [{ relatedPersons: [], submissionId: "kyb-sub-legacy" }])
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/findKybCustomerAndBusiness?country=CO", {
      headers: authHeaders(token)
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ relatedPersons: [], submissionId: "kyb-sub-legacy" }]);
    expect(await CustomerEntity.count({ where: { profileId: user.id } })).toBe(1);
  });

  it("submitKybInformation resumes the migrated customer's pending submission in place", async () => {
    const { token } = await seedLegacyBusinessCustomer("kyb-legacy-resume@example.com");

    const updateKybInformation = mock(async (_customerId: string, _submissionId: string, _data: unknown) => undefined);
    const submitKybInformation = mock(async () => ({ submissionId: "should-not-be-created" }));
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybStatus: mock(async () => ({ status: AlfredpayKycStatus.PENDING })),
          getLastKybSubmission: mock(async () => ({ submissionId: "kyb-sub-legacy" })),
          submitKybInformation,
          updateKybInformation
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/submitKybInformation", {
      body: JSON.stringify(KYB_FORM),
      headers: authHeaders(token),
      method: "POST"
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ submissionId: "kyb-sub-legacy" });
    expect(updateKybInformation).toHaveBeenCalledTimes(1);
    expect(updateKybInformation.mock.calls[0]).toEqual(["ap-legacy-kyb", "kyb-sub-legacy", KYB_FORM]);
    expect(submitKybInformation).not.toHaveBeenCalled();
  });

  it("createBusinessCustomer refuses to duplicate the migrated customer", async () => {
    const { token } = await seedLegacyBusinessCustomer("kyb-legacy-duplicate@example.com");

    const createCustomer = mock(async () => ({ customerId: "ap-duplicate" }));
    AlfredpayApiService.getInstance = mock(() => ({ createCustomer }) as unknown as AlfredpayApiService);

    const response = await api.request("/v1/alfredpay/createBusinessCustomer", {
      body: JSON.stringify({ country: "CO" }),
      headers: authHeaders(token),
      method: "POST"
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("Business customer already exists");
    expect(createCustomer).not.toHaveBeenCalled();
    expect(await ProviderCustomer.count({ where: { provider: "alfredpay" } })).toBe(1);
  });

  it("a typed lookup with no business rows answers 404 without creating an entity", async () => {
    const email = "kyb-no-rows@example.com";
    const user = await createTestUser({ email });
    const token = testUserToken(user.id, email);
    await getOrCreateCustomerEntityForProfile(user.id);

    const response = await api.request("/v1/alfredpay/findKybCustomerAndBusiness?country=CO", {
      headers: authHeaders(token)
    });

    expect(response.status).toBe(404);
    expect(await CustomerEntity.count({ where: { profileId: user.id } })).toBe(1);
  });

  it("createAlfredpayCustomer homes a new corridor's business row with the existing legacy rows", async () => {
    const { entity, user } = await seedLegacyBusinessCustomer("kyb-legacy-colocate@example.com");

    // Ramp registration resolves the active entity — a new corridor's row must land next to
    // the legacy rows there, not on a fresh business entity it can never reach.
    await createAlfredpayCustomer(user.id, {
      alfredPayId: "ap-legacy-mx",
      country: DomesticCountry.MX,
      status: AlfredPayStatus.Consulted,
      type: DomesticCustomerType.BUSINESS
    });

    const created = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-legacy-mx" } });
    expect(created?.customerEntityId).toBe(entity.id);
    expect(await CustomerEntity.count({ where: { profileId: user.id } })).toBe(1);
  });

  it("createAlfredpayCustomer prefers the active entity when rows are split across entities", async () => {
    const { entity, user } = await seedLegacyBusinessCustomer("kyb-legacy-split@example.com");

    // A profile hit by the pre-fix duplicate bug: a *newer* same-type row sits on a stray
    // business entity. The new corridor must still land on the active entity — the only one
    // quote/ramp resolution reads — not on the most recently updated sibling's entity.
    const strayBusinessEntity = await CustomerEntity.create({ profileId: user.id, status: "active", type: "business" });
    await ProviderCustomer.create({
      country: "MX",
      customerEntityId: strayBusinessEntity.id,
      customerType: "business",
      provider: "alfredpay",
      providerCustomerId: "ap-legacy-duplicate",
      rail: "mxn",
      status: VerificationStatus.Started
    });

    await createAlfredpayCustomer(user.id, {
      alfredPayId: "ap-legacy-us",
      country: DomesticCountry.US,
      status: AlfredPayStatus.Consulted,
      type: DomesticCustomerType.BUSINESS
    });

    const created = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-legacy-us" } });
    expect(created?.customerEntityId).toBe(entity.id);
  });
});
