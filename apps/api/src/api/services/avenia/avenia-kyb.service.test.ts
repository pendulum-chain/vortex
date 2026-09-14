import { BrlaApiError, BrlaApiService } from "@vortexfi/shared";
import { afterEach, describe, expect, it, mock } from "bun:test";
import sequelize from "../../../config/database";
import KycCase from "../../../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import { createAveniaUboOnce, getOrCreateAveniaKybCase, isAveniaBusinessKybLevel } from "./avenia-kyb.service";

const originalFindOrCreate = KycCase.findOrCreate;
const originalFindByPk = KycCase.findByPk;
const originalFindAll = KycCase.findAll;
const originalCreate = KycCase.create;
const originalProviderFindByPk = ProviderCustomer.findByPk;
const originalTransaction = sequelize.transaction;

afterEach(() => {
  KycCase.findOrCreate = originalFindOrCreate;
  KycCase.findByPk = originalFindByPk;
  KycCase.findAll = originalFindAll;
  KycCase.create = originalCreate;
  ProviderCustomer.findByPk = originalProviderFindByPk;
  sequelize.transaction = originalTransaction;
});

describe("createAveniaUboOnce", () => {
  const account = {
    customerEntityId: "entity-1",
    id: "provider-customer-1",
    status: VerificationStatus.Pending,
    statusExternal: null
  } as ProviderCustomer;
  const payload = {
    city: "Sao Paulo",
    country: "BRA",
    countryOfTaxId: "BRA",
    dateOfBirth: "1990-01-01",
    documentCountry: "BRA",
    fullName: "Test Owner",
    percentageOfOwnership: "100",
    state: "SP",
    streetLine1: "Test Street 1",
    taxIdNumber: "12345678901",
    uploadedIdentificationId: "identity-1",
    zipCode: "01000-000"
  };

  function mockCase(initialSubmissions: KycCase["uboSubmissions"] = {}) {
    const kycCase = {
      id: "case-1",
      uboSubmissions: initialSubmissions,
      update: mock(async (values: Partial<KycCase>) => {
        Object.assign(kycCase, values);
      })
    } as unknown as KycCase;
    ProviderCustomer.findByPk = mock(async () => account) as unknown as typeof ProviderCustomer.findByPk;
    KycCase.findAll = mock(async () => [kycCase]) as unknown as typeof KycCase.findAll;
    KycCase.findByPk = mock(async () => kycCase) as unknown as typeof KycCase.findByPk;
    sequelize.transaction = mock(async callback =>
      callback({ LOCK: { UPDATE: "UPDATE" } } as never)
    ) as unknown as typeof sequelize.transaction;
    return kycCase;
  }

  it("returns the confirmed provider UBO without sending it again", async () => {
    const kycCase = mockCase();
    const createUbo = mock(async () => ({ id: "ubo-1" }));
    const service = { createUbo } as unknown as BrlaApiService;

    expect(await createAveniaUboOnce(service, account, payload, "subaccount-1")).toEqual({ id: "ubo-1" });
    expect(await createAveniaUboOnce(service, account, payload, "subaccount-1")).toEqual({ id: "ubo-1" });

    expect(createUbo).toHaveBeenCalledTimes(1);
    expect(Object.values(kycCase.uboSubmissions)[0]).toMatchObject({ providerUboId: "ubo-1", status: "confirmed" });
  });

  it("quarantines an ambiguous provider outcome and blocks retry", async () => {
    mockCase();
    const createUbo = mock(async () => {
      throw new BrlaApiError({ endpoint: "/v2/kyb/ubos", method: "POST", responseBody: "timeout", status: 0 });
    });
    const service = { createUbo } as unknown as BrlaApiService;

    await expect(createAveniaUboOnce(service, account, payload, "subaccount-1")).rejects.toBeInstanceOf(BrlaApiError);
    await expect(createAveniaUboOnce(service, account, payload, "subaccount-1")).rejects.toMatchObject({ status: 409 });
    expect(createUbo).toHaveBeenCalledTimes(1);
  });

  it("allows retry after a deterministic provider rejection", async () => {
    mockCase();
    const createUbo = mock()
      .mockRejectedValueOnce(
        new BrlaApiError({ endpoint: "/v2/kyb/ubos", method: "POST", responseBody: "invalid", status: 400 })
      )
      .mockResolvedValueOnce({ id: "ubo-1" });
    const service = { createUbo } as unknown as BrlaApiService;

    await expect(createAveniaUboOnce(service, account, payload, "subaccount-1")).rejects.toBeInstanceOf(BrlaApiError);
    expect(await createAveniaUboOnce(service, account, payload, "subaccount-1")).toEqual({ id: "ubo-1" });
    expect(createUbo).toHaveBeenCalledTimes(2);
  });
});

describe("getOrCreateAveniaKybCase", () => {
  it("coalesces concurrent creation for one provider customer", async () => {
    let resolveCreation: ((value: [KycCase, boolean]) => void) | undefined;
    const pendingCreation = new Promise<[KycCase, boolean]>(resolve => {
      resolveCreation = resolve;
    });
    const kycCase = { id: "case-1" } as KycCase;
    const findOrCreate = mock(() => pendingCreation);
    KycCase.findOrCreate = findOrCreate as typeof KycCase.findOrCreate;
    const account = {
      customerEntityId: "entity-1",
      id: "provider-customer-1",
      status: VerificationStatus.Pending,
      statusExternal: null
    } as ProviderCustomer;

    const first = getOrCreateAveniaKybCase(account);
    const second = getOrCreateAveniaKybCase(account);
    resolveCreation?.([kycCase, true]);

    expect(await Promise.all([first, second])).toEqual([kycCase, kycCase]);
    expect(findOrCreate).toHaveBeenCalledTimes(1);
  });

  it("allows a retry after creation fails", async () => {
    const kycCase = { id: "case-1" } as KycCase;
    const findOrCreate = mock()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce([kycCase, true]);
    KycCase.findOrCreate = findOrCreate as typeof KycCase.findOrCreate;
    const account = {
      customerEntityId: "entity-1",
      id: "provider-customer-1",
      status: VerificationStatus.Pending,
      statusExternal: null
    } as ProviderCustomer;

    await expect(getOrCreateAveniaKybCase(account)).rejects.toThrow("database unavailable");
    expect(await getOrCreateAveniaKybCase(account)).toBe(kycCase);
    expect(findOrCreate).toHaveBeenCalledTimes(2);
  });
});

describe("isAveniaBusinessKybLevel", () => {
  it("recognizes every observed company level generation without accepting unrelated attempts", () => {
    // All three names observed in production: current v2, its unsuffixed predecessor,
    // and the legacy pre-rename level.
    expect(isAveniaBusinessKybLevel("kyb-level-1-v2")).toBe(true);
    expect(isAveniaBusinessKybLevel("kyb-level-1")).toBe(true);
    expect(isAveniaBusinessKybLevel("level-1")).toBe(true);
    expect(isAveniaBusinessKybLevel("sumsub-token-recipient")).toBe(false);
    expect(isAveniaBusinessKybLevel("level-10")).toBe(false);
  });
});
