import {AveniaAccountType, BrlaApiError, BrlaApiService, KycAttemptResult, KycAttemptStatus} from "@vortexfi/shared";
import {afterEach, beforeEach, describe, expect, it, mock} from "bun:test";
import httpStatus from "http-status";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import KycCase from "../../models/kycCase.model";
import ProviderCustomer, {VerificationStatus} from "../../models/providerCustomer.model";
import TaxId, {TaxIdInternalStatus} from "../../models/taxId.model";
import User from "../../models/user.model";
import {
  createSubaccount,
  fetchSubaccountKycStatus,
  getAveniaUser,
  getKybAttemptStatus,
  initiateKybLevel1,
  recordInitialKycAttempt
} from "./brla.controller";

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

const originalUserFindByPk = User.findByPk;

beforeEach(() => {
  User.findByPk = mock(async () => null) as unknown as typeof User.findByPk;
});

afterEach(() => {
  User.findByPk = originalUserFindByPk;
});

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
      status: VerificationStatus.Approved
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

  it("still parses a BrlaApiError 400 into a 400 'Invalid request' with details (message-format invariant)", async () => {
    mockEntityPerProfile();
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.Approved
    })) as typeof ProviderCustomer.findOne;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          subaccountInfo: mock(async () => {
            throw new BrlaApiError({
              endpoint: "/v2/account/account-info",
              method: "GET",
              responseBody: JSON.stringify({ error: "user is blocked" }),
              status: 400
            });
          })
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await getAveniaUser(
      {
        query: { taxId: "08786985906" },
        userId: "user-1"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ details: { error: "user is blocked" }, error: "Invalid request" });
  });
});

describe("recordInitialKycAttempt", () => {
  const originalProviderFindOne = ProviderCustomer.findOne;
  const originalProviderCreate = ProviderCustomer.create;
  const originalEntityFindOrCreate = CustomerEntity.findOrCreate;
  const originalKycCaseFindOne = KycCase.findOne;
  const originalKycCaseCreate = KycCase.create;

  afterEach(() => {
    ProviderCustomer.findOne = originalProviderFindOne;
    ProviderCustomer.create = originalProviderCreate;
    CustomerEntity.findOrCreate = originalEntityFindOrCreate;
    KycCase.findOne = originalKycCaseFindOne;
    KycCase.create = originalKycCaseCreate;
  });

  it("records the first valid Avenia interaction as started", async () => {
    mockEntityPerProfile();
    ProviderCustomer.findOne = mock(async () => null) as typeof ProviderCustomer.findOne;
    const providerCreate = mock(async (values: Record<string, unknown>) => ({ id: "customer-1", ...values }));
    ProviderCustomer.create = providerCreate as unknown as typeof ProviderCustomer.create;
    KycCase.findOne = mock(async () => null) as typeof KycCase.findOne;
    KycCase.create = mock(async () => ({})) as unknown as typeof KycCase.create;

    const res = createResponse();
    await recordInitialKycAttempt({ body: { taxId: "08786985906" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(providerCreate.mock.calls[0]?.[0]).toMatchObject({ status: VerificationStatus.Started });
  });
});

describe("fetchSubaccountKycStatus", () => {
  const originalProviderFindOne = ProviderCustomer.findOne;
  const originalEntityFindOrCreate = CustomerEntity.findOrCreate;
  const originalKycCaseFindOne = KycCase.findOne;
  const originalGetInstance = BrlaApiService.getInstance;

  afterEach(() => {
    ProviderCustomer.findOne = originalProviderFindOne;
    CustomerEntity.findOrCreate = originalEntityFindOrCreate;
    KycCase.findOne = originalKycCaseFindOne;
    BrlaApiService.getInstance = originalGetInstance;
  });

  it("maps a missing Avenia attempt to pending", async () => {
    mockEntityPerProfile();
    const update = mock(async () => undefined);
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.InReview,
      statusExternal: null,
      update
    })) as unknown as typeof ProviderCustomer.findOne;
    const kycUpdate = mock(async () => undefined);
    KycCase.findOne = mock(async () => ({ update: kycUpdate })) as unknown as typeof KycCase.findOne;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({ attempts: [] })),
          subaccountInfo: mock(async () => ({ accountInfo: { identityStatus: "PENDING" } }))
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await fetchSubaccountKycStatus({ query: { taxId: "08786985906" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.NOT_FOUND);
    expect(update).toHaveBeenCalledWith({ status: VerificationStatus.Pending, statusExternal: null });
    expect(kycUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: VerificationStatus.Pending }));
  });
});

describe("Avenia company KYB", () => {
  const originalProviderFindOne = ProviderCustomer.findOne;
  const originalProviderFindByPk = ProviderCustomer.findByPk;
  const originalEntityFindOrCreate = CustomerEntity.findOrCreate;
  const originalKycCaseFindOne = KycCase.findOne;
  const originalKycCaseCreate = KycCase.create;
  const originalGetInstance = BrlaApiService.getInstance;

  afterEach(() => {
    ProviderCustomer.findOne = originalProviderFindOne;
    ProviderCustomer.findByPk = originalProviderFindByPk;
    CustomerEntity.findOrCreate = originalEntityFindOrCreate;
    KycCase.findOne = originalKycCaseFindOne;
    KycCase.create = originalKycCaseCreate;
    BrlaApiService.getInstance = originalGetInstance;
  });

  it("binds the initiated provider attempt to the owned KYB case", async () => {
    mockEntityPerProfile();
    const customerUpdate = mock(async () => undefined);
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      customerType: "business",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      statusExternal: null,
      update: customerUpdate
    })) as unknown as typeof ProviderCustomer.findOne;
    const caseUpdate = mock(async () => undefined);
    KycCase.findOne = mock(async () => ({ update: caseUpdate })) as unknown as typeof KycCase.findOne;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          initiateKybLevel1: mock(async () => ({
            attemptId: "attempt-1",
            authorizedRepresentativeUrl: "https://avenia.example/representative",
            basicCompanyDataUrl: "https://avenia.example/company"
          }))
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await initiateKybLevel1({ query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        providerCaseId: "attempt-1",
        status: VerificationStatus.InReview,
        statusExternal: KycAttemptStatus.PENDING
      })
    );
  });

  it("rejects an attempt owned by another user without querying Avenia", async () => {
    mockEntityPerProfile();
    KycCase.findOne = mock(async () => ({
      customerEntityId: "entity-victim",
      providerCustomerId: "customer-1"
    })) as unknown as typeof KycCase.findOne;
    const providerStatus = mock(async () => ({ attempt: {} }));
    BrlaApiService.getInstance = mock(
      () => ({ getKybAttemptStatus: providerStatus }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await getKybAttemptStatus({ query: { attemptId: "attempt-1" }, userId: "attacker" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.FORBIDDEN);
    expect(providerStatus).not.toHaveBeenCalled();
  });

  it("persists an approved provider result and returns only normalized browser fields", async () => {
    mockEntityPerProfile();
    const caseUpdate = mock(async () => undefined);
    KycCase.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      providerCustomerId: "customer-1",
      update: caseUpdate
    })) as unknown as typeof KycCase.findOne;
    const customerUpdate = mock(async () => undefined);
    ProviderCustomer.findByPk = mock(async () => ({
      customerEntityId: "entity-user-1",
      provider: "avenia",
      update: customerUpdate
    })) as unknown as typeof ProviderCustomer.findByPk;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => ({
            attempt: {
              createdAt: "private",
              id: "attempt-1",
              levelName: "level-1",
              result: KycAttemptResult.APPROVED,
              resultMessage: "",
              retryable: false,
              status: KycAttemptStatus.COMPLETED,
              submissionData: { privateCompanyData: true },
              updatedAt: "private"
            }
          }))
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await getKybAttemptStatus({ query: { attemptId: "attempt-1" }, userId: "user-1" } as any, res as any);

    expect(res.body).toEqual({ result: KycAttemptResult.APPROVED, status: KycAttemptStatus.COMPLETED });
    expect(customerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: VerificationStatus.Approved, statusExternal: KycAttemptStatus.COMPLETED })
    );
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: VerificationStatus.Approved, statusExternal: KycAttemptStatus.COMPLETED })
    );
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
  const subaccountInfoMock = mock(async () => ({ accountInfo: { fullName: "", name: "Provider Company Name" } }));

  function mockBrlaApi() {
    BrlaApiService.getInstance = mock(
      () =>
        ({
          createAveniaSubaccount: createAveniaSubaccountMock,
          subaccountInfo: subaccountInfoMock
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
      status: VerificationStatus.Approved
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
      companyName: null,
      customerType: "individual",
      providerSubaccountId: "new-subaccount",
      status: VerificationStatus.InReview,
      statusExternal: null
    });
  });

  it("allows an authenticated user to (re)create their own subaccount", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    const updateMock = mock(async () => undefined);
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-same-user",
      status: VerificationStatus.Approved,
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

  it("persists the submitted company name for a business account", async () => {
    mockBrlaApi();
    const providerCreateMock = mock(async (values: Record<string, unknown>) => ({ ...values }));
    ProviderCustomer.findOne = mock(async () => null) as typeof ProviderCustomer.findOne;
    ProviderCustomer.create = providerCreateMock as unknown as typeof ProviderCustomer.create;

    const res = createResponse();
    await createSubaccount(
      {
        body: { accountType: AveniaAccountType.COMPANY, name: "  Acme Ltda  ", taxId: "11222333000181" },
        userId: "business-user"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(providerCreateMock.mock.calls[0]?.[0]).toMatchObject({
      companyName: "Provider Company Name",
      customerType: "business",
      status: VerificationStatus.InReview
    });
    expect(subaccountInfoMock).toHaveBeenCalledWith("new-subaccount");
  });

  it("rejects overwrite when a started record belongs to another entity", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    const updateMock = mock(async () => undefined);
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-victim-user",
      status: VerificationStatus.Started,
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

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(createAveniaSubaccountMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
