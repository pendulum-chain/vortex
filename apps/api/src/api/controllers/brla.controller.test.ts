import {AveniaAccountType, BrlaApiService} from "@vortexfi/shared";
import {afterEach, beforeEach, describe, expect, it, mock} from "bun:test";
import httpStatus from "http-status";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import KycCase from "../../models/kycCase.model";
import ProviderCustomer, {AveniaKycStatus} from "../../models/providerCustomer.model";
import TaxId, {TaxIdInternalStatus} from "../../models/taxId.model";
import {createSubaccount, getAveniaUser} from "./brla.controller";

function createResponse() {
  const res = {
    body: undefined as unknown,
    statusCode: Number(httpStatus.OK),
    json: mock((body: unknown) => {
      res.body = body;
      return res;
    }),
    status: mock((statusCode: number) => {
      res.statusCode = statusCode;
      return res;
    })
  };

  return res;
}

// getOrCreateCustomerEntityForProfile resolves each profile to a deterministic entity id.
function mockEntityPerProfile() {
  CustomerEntity.findOrCreate = mock(async (options: { where: { profileId: string } }) => [
    { id: `entity-${options.where.profileId}` },
    false
  ]) as unknown as typeof CustomerEntity.findOrCreate;
}

describe("getAveniaUser", () => {
  const originalFindOne = ProviderCustomer.findOne;
  const originalEntityFindOrCreate = CustomerEntity.findOrCreate;
  const originalGetInstance = BrlaApiService.getInstance;
  const originalLoggerError = logger.error;
  const originalLoggerInfo = logger.info;

  beforeEach(() => {
    logger.error = mock(() => logger) as typeof logger.error;
    logger.info = mock(() => logger) as typeof logger.info;
  });

  afterEach(() => {
    ProviderCustomer.findOne = originalFindOne;
    CustomerEntity.findOrCreate = originalEntityFindOrCreate;
    BrlaApiService.getInstance = originalGetInstance;
    logger.error = originalLoggerError;
    logger.info = originalLoggerInfo;
  });

  function mockConfirmedAveniaUser(ownerUserId: string | null = null) {
    mockEntityPerProfile();
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: `entity-${ownerUserId}`,
      providerSubaccountId: "subaccount-1",
      status: AveniaKycStatus.Accepted
    })) as typeof ProviderCustomer.findOne;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          subaccountInfo: mock(async () => ({
            accountInfo: { identityStatus: "CONFIRMED" },
            wallets: [{ chain: "EVM", walletAddress: "0x1234567890123456789012345678901234567890" }]
          }))
        }) as unknown as BrlaApiService
    );
  }

  const expectedConfirmedBody = {
    evmAddress: "0x1234567890123456789012345678901234567890",
    identityStatus: "CONFIRMED",
    kycLevel: 1,
    subAccountId: "subaccount-1"
  };

  it("returns 400 when no effective user is present (anonymous caller)", async () => {
    mockConfirmedAveniaUser();

    const res = createResponse();
    await getAveniaUser(
      {
        query: {}
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ error: "Missing or invalid authentication." });
  });

  it("rejects unlinked partner API key lookups (no effective user)", async () => {
    mockConfirmedAveniaUser();

    const res = createResponse();
    await getAveniaUser(
      {
        authenticatedPartner: { id: "partner-1", name: "Partner" },
        query: { taxId: "08786985906" }
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ error: "Missing or invalid authentication." });
  });

  it("allows user-linked API key lookups for the key user's own taxId", async () => {
    mockConfirmedAveniaUser("user-1");

    const res = createResponse();
    await getAveniaUser(
      {
        apiKeyUserId: "user-1",
        authenticatedPartner: { id: "partner-1", name: "Partner" },
        query: { taxId: "08786985906" }
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(res.body).toEqual(expectedConfirmedBody);
  });

  it("allows Supabase-authenticated user lookups", async () => {
    mockConfirmedAveniaUser("user-1");

    const res = createResponse();
    await getAveniaUser(
      {
        query: { taxId: "08786985906" },
        userId: "user-1"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(res.body).toEqual(expectedConfirmedBody);
  });

  it("rejects Supabase-authenticated lookups for another user's taxId", async () => {
    mockConfirmedAveniaUser("victim-user");

    const res = createResponse();
    await getAveniaUser(
      {
        query: { taxId: "08786985906" },
        userId: "attacker-user"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.FORBIDDEN);
    expect(res.body).toEqual({ error: "This tax ID is not linked to your user profile and cannot be used." });
  });
});

describe("createSubaccount", () => {
  const originalProviderFindOne = ProviderCustomer.findOne;
  const originalProviderCreate = ProviderCustomer.create;
  const originalEntityFindOrCreate = CustomerEntity.findOrCreate;
  const originalTaxIdFindByPk = TaxId.findByPk;
  const originalKycCaseFindOne = KycCase.findOne;
  const originalKycCaseCreate = KycCase.create;
  const originalGetInstance = BrlaApiService.getInstance;
  const originalLoggerError = logger.error;

  beforeEach(() => {
    logger.error = mock(() => logger) as typeof logger.error;
    mockEntityPerProfile();
    // No pre-existing kyc case; case creation is fire-and-forget for these scenarios.
    KycCase.findOne = mock(async () => null) as typeof KycCase.findOne;
    KycCase.create = mock(async () => ({})) as unknown as typeof KycCase.create;
    // Default: no legacy tax_ids row to adopt.
    TaxId.findByPk = mock(async () => null) as typeof TaxId.findByPk;
  });

  afterEach(() => {
    ProviderCustomer.findOne = originalProviderFindOne;
    ProviderCustomer.create = originalProviderCreate;
    CustomerEntity.findOrCreate = originalEntityFindOrCreate;
    TaxId.findByPk = originalTaxIdFindByPk;
    KycCase.findOne = originalKycCaseFindOne;
    KycCase.create = originalKycCaseCreate;
    BrlaApiService.getInstance = originalGetInstance;
    logger.error = originalLoggerError;
  });

  const createAveniaSubaccountMock = mock(async () => ({ id: "new-subaccount" }));

  function mockBrlaApi() {
    BrlaApiService.getInstance = mock(
      () =>
        ({
          createAveniaSubaccount: createAveniaSubaccountMock
        }) as unknown as BrlaApiService
    );
  }

  const validBody = {
    accountType: AveniaAccountType.INDIVIDUAL,
    name: "Attacker",
    taxId: "08786985906"
  };

  it("rejects when an existing subaccount belongs to a different Supabase user", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-victim-user",
      status: AveniaKycStatus.Accepted
    })) as typeof ProviderCustomer.findOne;

    const res = createResponse();
    await createSubaccount(
      {
        body: validBody,
        userId: "attacker-user"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(res.body).toEqual({ error: "A subaccount already exists for this taxId" });
    expect(createAveniaSubaccountMock).not.toHaveBeenCalled();
  });

  it("rejects when a quarantined legacy record belongs to a different user", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    ProviderCustomer.findOne = mock(async () => null) as typeof ProviderCustomer.findOne;
    TaxId.findByPk = mock(async () => ({
      internalStatus: TaxIdInternalStatus.Accepted,
      subAccountId: "legacy-sub",
      userId: "victim-user"
    })) as typeof TaxId.findByPk;

    const res = createResponse();
    await createSubaccount(
      {
        body: validBody,
        userId: "attacker-user"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(res.body).toEqual({ error: "A subaccount already exists for this taxId" });
    expect(createAveniaSubaccountMock).not.toHaveBeenCalled();
  });

  it("lets an authenticated caller claim an anonymously-owned legacy record", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    ProviderCustomer.findOne = mock(async () => null) as typeof ProviderCustomer.findOne;
    TaxId.findByPk = mock(async () => ({
      accountType: AveniaAccountType.INDIVIDUAL,
      internalStatus: TaxIdInternalStatus.Requested,
      subAccountId: "legacy-sub",
      userId: null
    })) as typeof TaxId.findByPk;
    const adoptedUpdate = mock(async () => undefined);
    const providerCreateMock = mock(async (values: Record<string, unknown>) => ({ ...values, update: adoptedUpdate }));
    ProviderCustomer.create = providerCreateMock as unknown as typeof ProviderCustomer.create;

    const res = createResponse();
    await createSubaccount(
      {
        body: validBody,
        userId: "some-user"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    // The adopted record is owned by the claimer's entity...
    expect(providerCreateMock.mock.calls[0]?.[0]).toMatchObject({ customerEntityId: "entity-some-user" });
    // ...and then re-provisioned with the freshly created subaccount.
    expect(createAveniaSubaccountMock).toHaveBeenCalled();
    expect(adoptedUpdate).toHaveBeenCalledWith({
      customerType: "individual",
      providerSubaccountId: "new-subaccount",
      status: AveniaKycStatus.Requested
    });
  });

  it("allows an authenticated user to (re)create their own subaccount", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    const updateMock = mock(async () => undefined);
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-same-user",
      status: AveniaKycStatus.Accepted,
      update: updateMock
    })) as typeof ProviderCustomer.findOne;

    const res = createResponse();
    await createSubaccount(
      {
        body: validBody,
        userId: "same-user"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(res.body).toEqual({ subAccountId: "new-subaccount" });
    expect(createAveniaSubaccountMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalled();
  });

  it("allows creation when no existing subaccount record exists", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    const providerCreateMock = mock(async (values: Record<string, unknown>) => ({ ...values }));
    ProviderCustomer.findOne = mock(async () => null) as typeof ProviderCustomer.findOne;
    ProviderCustomer.create = providerCreateMock as unknown as typeof ProviderCustomer.create;

    const res = createResponse();
    await createSubaccount(
      {
        body: validBody,
        userId: "new-user"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(res.body).toEqual({ subAccountId: "new-subaccount" });
    expect(createAveniaSubaccountMock).toHaveBeenCalled();
    expect(providerCreateMock).toHaveBeenCalled();
  });

  it("allows overwrite when the existing record is only in Consulted state", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    const updateMock = mock(async () => undefined);
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-victim-user",
      status: AveniaKycStatus.Consulted,
      update: updateMock
    })) as typeof ProviderCustomer.findOne;

    const res = createResponse();
    await createSubaccount(
      {
        body: validBody,
        userId: "attacker-user"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(createAveniaSubaccountMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalled();
  });
});
