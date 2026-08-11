import {AveniaAccountType, AveniaDocumentType, BrlaApiError, BrlaApiService, KycAttemptResult, KycAttemptStatus} from "@vortexfi/shared";
import {afterEach, beforeEach, describe, expect, it, mock} from "bun:test";
import httpStatus from "http-status";
import sequelize from "../../config/database";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import EmailNotification, { NotificationProvider, NotificationType } from "../../models/emailNotification.model";
import KycCase from "../../models/kycCase.model";
import PartnerManagedProfile from "../../models/partnerManagedProfile.model";
import ProviderCustomer, {VerificationStatus} from "../../models/providerCustomer.model";
import User from "../../models/user.model";
import { hashAveniaKybSubmission } from "../services/avenia/avenia-kyb.service";
import { SupabaseAuthService } from "../services/auth";
import {
  createSubaccount,
  createKybDocument,
  createKybUbo,
  fetchSubaccountKycStatus,
  getAveniaUser,
  getKybAttemptStatus,
  getUploadUrls,
  initiateKybLevel1,
  recordInitialKycAttempt,
  submitKybLevel1Api
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
// Type-less lookups resolve via findOne (oldest-entity default); typed ones via findOrCreate.
// Profile-ownership checks enumerate the profile's entities via findAll.
function mockEntityPerProfile() {
  CustomerEntity.findOne = mock(async (options: { where: { profileId: string } }) => ({
    id: `entity-${options.where.profileId}`
  })) as unknown as typeof CustomerEntity.findOne;
  CustomerEntity.findOrCreate = mock(async (options: { where: { profileId: string } }) => [
    { id: `entity-${options.where.profileId}` },
    false
  ]) as unknown as typeof CustomerEntity.findOrCreate;
  CustomerEntity.findAll = mock(async (options: { where: { profileId: string } }) => [
    { id: `entity-${options.where.profileId}` }
  ]) as unknown as typeof CustomerEntity.findAll;
}

const originalUserFindByPk = User.findByPk;
const originalManagedProfileFindOne = PartnerManagedProfile.findOne;
const originalEntityFindAll = CustomerEntity.findAll;

beforeEach(() => {
  PartnerManagedProfile.findOne = mock(async () => null) as unknown as typeof PartnerManagedProfile.findOne;
  User.findByPk = mock(async () => null) as unknown as typeof User.findByPk;
});

afterEach(() => {
  PartnerManagedProfile.findOne = originalManagedProfileFindOne;
  User.findByPk = originalUserFindByPk;
  CustomerEntity.findAll = originalEntityFindAll;
});

describe("getAveniaUser", () => {
  const originalFindOne = ProviderCustomer.findOne;
  const originalEntityFindOne = CustomerEntity.findOne;
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
    CustomerEntity.findOne = originalEntityFindOne;
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
        apiKeyUserId: "stale-user",
        authenticatedPartner: { id: "partner-1", name: "Partner" },
        credential: {
          credentialId: "credential-1",
          environment: "test",
          partnerId: "partner-1",
          profileId: "user-1",
          strength: "secret"
        },
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

  // Migration 040 attached legacy rows to the profile's individual entity; comparing
  // against the single resolved entity 403'd the owner once another entity was active.
  it("resolves a record on a non-active entity of a multi-entity profile", async () => {
    CustomerEntity.findAll = mock(async () => [
      { id: "entity-user-1-individual" },
      { id: "entity-user-1-business" }
    ]) as unknown as typeof CustomerEntity.findAll;
    const strayCreate = mock(async () => [{ id: "entity-user-1-business" }, true]);
    CustomerEntity.findOrCreate = strayCreate as unknown as typeof CustomerEntity.findOrCreate;
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1-individual",
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

    const res = createResponse();
    await getAveniaUser({ query: { taxId: "08786985906" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(res.body).toEqual(expectedConfirmedBody);
    expect(strayCreate).not.toHaveBeenCalled();
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
  const originalEntityFindOne = CustomerEntity.findOne;
  const originalEntityFindOrCreate = CustomerEntity.findOrCreate;
  const originalKycCaseFindOne = KycCase.findOne;
  const originalKycCaseCreate = KycCase.create;

  afterEach(() => {
    ProviderCustomer.findOne = originalProviderFindOne;
    ProviderCustomer.create = originalProviderCreate;
    CustomerEntity.findOne = originalEntityFindOne;
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
    await recordInitialKycAttempt(
      { body: { quoteId: "quote-1", taxId: "08786985906" }, userId: "user-1" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(providerCreate.mock.calls[0]?.[0]).toMatchObject({ status: VerificationStatus.Started });
  });

  it("requires a quote id before recording an Avenia interaction", async () => {
    const res = createResponse();

    await recordInitialKycAttempt({ body: { taxId: "08786985906" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ error: "Missing quoteId or taxId body parameter" });
  });
});

describe("fetchSubaccountKycStatus", () => {
  const originalProviderFindOne = ProviderCustomer.findOne;
  const originalEntityFindOne = CustomerEntity.findOne;
  const originalEntityFindOrCreate = CustomerEntity.findOrCreate;
  const originalKycCaseFindOne = KycCase.findOne;
  const originalGetInstance = BrlaApiService.getInstance;

  afterEach(() => {
    ProviderCustomer.findOne = originalProviderFindOne;
    CustomerEntity.findOne = originalEntityFindOne;
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

  function mockOwnedRecordWithAttempt(status: VerificationStatus, attempt: unknown) {
    mockEntityPerProfile();
    const update = mock(async () => undefined);
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      status,
      statusExternal: null,
      update
    })) as unknown as typeof ProviderCustomer.findOne;
    const kycUpdate = mock(async () => undefined);
    KycCase.findOne = mock(async () => ({ update: kycUpdate })) as unknown as typeof KycCase.findOne;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({ attempts: [attempt] }))
        }) as unknown as BrlaApiService
    );
    return { kycUpdate, update };
  }

  // Regression: a rejected account whose retried attempt is approved used to stay `rejected`
  // forever (the outcome update only matched `in_review`), so ramp registration failed with
  // "No completed Avenia profile found" despite a successful KYC.
  it("flips a rejected account to approved when a retried attempt is approved", async () => {
    const { kycUpdate, update } = mockOwnedRecordWithAttempt(VerificationStatus.Rejected, {
      levelName: "KYC_1",
      result: KycAttemptResult.APPROVED,
      status: KycAttemptStatus.COMPLETED
    });

    const res = createResponse();
    await fetchSubaccountKycStatus({ query: { taxId: "08786985906" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.OK);
    expect((res.body as { result: string }).result).toBe(KycAttemptResult.APPROVED);
    expect(update).toHaveBeenCalledWith({ status: VerificationStatus.Approved, statusExternal: KycAttemptStatus.COMPLETED });
    expect(kycUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: VerificationStatus.Approved }));
  });

  it("returns a rejected account to in_review while a retried attempt is processing", async () => {
    const { update } = mockOwnedRecordWithAttempt(VerificationStatus.Rejected, {
      levelName: "KYC_1",
      result: "",
      status: KycAttemptStatus.PROCESSING
    });

    const res = createResponse();
    await fetchSubaccountKycStatus({ query: { taxId: "08786985906" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(update).toHaveBeenCalledWith({ status: VerificationStatus.InReview, statusExternal: KycAttemptStatus.PROCESSING });
  });

  // Migration 040: the record may live on the profile's legacy individual entity while a
  // business entity is active — ownership must span every owned entity.
  it("serves KYC status for a record on a non-active entity of a multi-entity profile", async () => {
    CustomerEntity.findAll = mock(async () => [
      { id: "entity-user-1-individual" },
      { id: "entity-user-1-business" }
    ]) as unknown as typeof CustomerEntity.findAll;
    const strayCreate = mock(async () => [{ id: "entity-user-1-business" }, true]);
    CustomerEntity.findOrCreate = strayCreate as unknown as typeof CustomerEntity.findOrCreate;
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1-individual",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.Approved,
      statusExternal: null
    })) as unknown as typeof ProviderCustomer.findOne;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({
            attempts: [{ levelName: "KYC_1", result: "", status: KycAttemptStatus.PROCESSING }]
          }))
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await fetchSubaccountKycStatus({ query: { taxId: "08786985906" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(strayCreate).not.toHaveBeenCalled();
  });

  it("never downgrades an approved account on a stale rejected attempt read", async () => {
    const { kycUpdate, update } = mockOwnedRecordWithAttempt(VerificationStatus.Approved, {
      levelName: "KYC_1",
      result: KycAttemptResult.REJECTED,
      status: KycAttemptStatus.COMPLETED
    });

    const res = createResponse();
    await fetchSubaccountKycStatus({ query: { taxId: "08786985906" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(update).not.toHaveBeenCalled();
    expect(kycUpdate).not.toHaveBeenCalled();
  });
});

describe("Avenia company KYB", () => {
  const originalProviderFindOne = ProviderCustomer.findOne;
  const originalProviderFindByPk = ProviderCustomer.findByPk;
  const originalEntityFindOne = CustomerEntity.findOne;
  const originalEntityFindOrCreate = CustomerEntity.findOrCreate;
  const originalKycCaseFindOne = KycCase.findOne;
  const originalKycCaseCreate = KycCase.create;
  const originalKycCaseUpdate = KycCase.update;
  const originalGetInstance = BrlaApiService.getInstance;
  const originalTransaction = sequelize.transaction;
  let staticCaseUpdate: ReturnType<typeof mock>;

  beforeEach(() => {
    staticCaseUpdate = mock(async () => [1]);
    KycCase.update = staticCaseUpdate as unknown as typeof KycCase.update;
    sequelize.transaction = mock(async callback => callback({} as never)) as unknown as typeof sequelize.transaction;
  });

  afterEach(() => {
    ProviderCustomer.findOne = originalProviderFindOne;
    ProviderCustomer.findByPk = originalProviderFindByPk;
    CustomerEntity.findOne = originalEntityFindOne;
    CustomerEntity.findOrCreate = originalEntityFindOrCreate;
    KycCase.findOne = originalKycCaseFindOne;
    KycCase.create = originalKycCaseCreate;
    KycCase.update = originalKycCaseUpdate;
    BrlaApiService.getInstance = originalGetInstance;
    sequelize.transaction = originalTransaction;
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
    // Nothing is submitted until the user finishes the hosted steps: the account stays pending
    // (resumable), never in_review, until Avenia reports PROCESSING.
    expect(customerUpdate).toHaveBeenCalledWith({
      status: VerificationStatus.Pending,
      statusExternal: KycAttemptStatus.PENDING
    });
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        providerCaseId: "attempt-1",
        status: VerificationStatus.Pending,
        statusExternal: KycAttemptStatus.PENDING
      })
    );
  });

  // Migration 040 attached business rows to the profile's individual entity; comparing
  // against the single resolved entity 403'd the legitimate owner's KYB initiation.
  it("initiates KYB for a business row on the profile's legacy individual entity", async () => {
    CustomerEntity.findAll = mock(async () => [
      { id: "entity-user-1-individual" },
      { id: "entity-user-1-business" }
    ]) as unknown as typeof CustomerEntity.findAll;
    const strayCreate = mock(async () => [{ id: "entity-user-1-business" }, true]);
    CustomerEntity.findOrCreate = strayCreate as unknown as typeof CustomerEntity.findOrCreate;
    const customerUpdate = mock(async () => undefined);
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1-individual",
      customerType: "business",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      statusExternal: null,
      update: customerUpdate
    })) as unknown as typeof ProviderCustomer.findOne;
    KycCase.findOne = mock(async () => ({ update: mock(async () => undefined) })) as unknown as typeof KycCase.findOne;
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
    expect(strayCreate).not.toHaveBeenCalled();
  });

  it("re-issues KYB links while the existing attempt is still PENDING, rebinding the case", async () => {
    mockEntityPerProfile();
    const customerUpdate = mock(async () => undefined);
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      customerType: "business",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.Pending,
      statusExternal: KycAttemptStatus.PENDING,
      update: customerUpdate
    })) as unknown as typeof ProviderCustomer.findOne;
    const caseUpdate = mock(async () => undefined);
    KycCase.findOne = mock(async () => ({
      providerCaseId: "attempt-1",
      statusExternal: KycAttemptStatus.PENDING,
      update: caseUpdate
    })) as unknown as typeof KycCase.findOne;
    const initiateMock = mock(async () => ({
      attemptId: "attempt-2",
      authorizedRepresentativeUrl: "https://avenia.example/representative",
      basicCompanyDataUrl: "https://avenia.example/company"
    }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => ({ attempt: { id: "attempt-1", status: KycAttemptStatus.PENDING } })),
          initiateKybLevel1: initiateMock
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await initiateKybLevel1({ query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(initiateMock).toHaveBeenCalled();
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ providerCaseId: "attempt-2", status: VerificationStatus.Pending })
    );
  });

  it("rejects re-initiation when the stored PENDING is stale and Avenia is already processing", async () => {
    mockEntityPerProfile();
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      customerType: "business",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.Pending,
      statusExternal: KycAttemptStatus.PENDING
    })) as unknown as typeof ProviderCustomer.findOne;
    KycCase.findOne = mock(async () => ({
      providerCaseId: "attempt-1",
      statusExternal: KycAttemptStatus.PENDING
    })) as unknown as typeof KycCase.findOne;
    const initiateMock = mock(async () => ({ attemptId: "attempt-2" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          // The user finished the hosted steps in another tab; our row still says PENDING.
          getKybAttemptStatus: mock(async () => ({ attempt: { id: "attempt-1", status: KycAttemptStatus.PROCESSING } })),
          initiateKybLevel1: initiateMock
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await initiateKybLevel1({ query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it("fails closed when the live attempt cannot be checked before re-initiation", async () => {
    mockEntityPerProfile();
    const customerUpdate = mock(async () => undefined);
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      customerType: "business",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.Pending,
      statusExternal: KycAttemptStatus.PENDING,
      update: customerUpdate
    })) as unknown as typeof ProviderCustomer.findOne;
    KycCase.findOne = mock(async () => ({
      providerCaseId: "attempt-1",
      statusExternal: KycAttemptStatus.PENDING,
      update: mock(async () => undefined)
    })) as unknown as typeof KycCase.findOne;
    const initiateMock = mock(async () => ({
      attemptId: "attempt-2",
      authorizedRepresentativeUrl: "https://avenia.example/representative",
      basicCompanyDataUrl: "https://avenia.example/company"
    }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => {
            throw new Error("avenia unavailable");
          }),
          initiateKybLevel1: initiateMock
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await initiateKybLevel1({ query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.BAD_GATEWAY);
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it("does not start the hosted flow while an API submission needs reconciliation", async () => {
    mockEntityPerProfile();
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      customerType: "business",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.Pending
    })) as unknown as typeof ProviderCustomer.findOne;
    KycCase.findOne = mock(async () => ({
      id: "case-1",
      providerCaseId: null,
      submissionStatus: "unknown"
    })) as unknown as typeof KycCase.findOne;
    const initiateMock = mock(async () => ({ attemptId: "attempt-2" }));
    BrlaApiService.getInstance = mock(
      () => ({ initiateKybLevel1: initiateMock }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await initiateKybLevel1({ query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it("does not replace an accepted API attempt with a hosted attempt", async () => {
    mockEntityPerProfile();
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      customerType: "business",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.Pending
    })) as unknown as typeof ProviderCustomer.findOne;
    KycCase.findOne = mock(async () => ({
      id: "case-1",
      providerCaseId: "api-attempt",
      statusExternal: KycAttemptStatus.PENDING,
      submissionRequestHash: "api-request-hash",
      submissionStatus: "submitted"
    })) as unknown as typeof KycCase.findOne;
    const providerStatus = mock(async () => ({ attempt: {} }));
    const initiateMock = mock(async () => ({ attemptId: "hosted-attempt" }));
    BrlaApiService.getInstance = mock(
      () => ({ getKybAttemptStatus: providerStatus, initiateKybLevel1: initiateMock }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await initiateKybLevel1({ query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(providerStatus).not.toHaveBeenCalled();
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it("does not replace a non-retryable rejected hosted attempt", async () => {
    mockEntityPerProfile();
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      customerType: "business",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.Rejected
    })) as unknown as typeof ProviderCustomer.findOne;
    KycCase.findOne = mock(async () => ({
      id: "case-1",
      providerCaseId: "attempt-1",
      statusExternal: KycAttemptStatus.COMPLETED,
      submissionStatus: "submitted"
    })) as unknown as typeof KycCase.findOne;
    const initiateMock = mock(async () => ({ attemptId: "attempt-2" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => ({
            attempt: {
              id: "attempt-1",
              result: KycAttemptResult.REJECTED,
              retryable: false,
              status: KycAttemptStatus.COMPLETED
            }
          })),
          initiateKybLevel1: initiateMock
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await initiateKybLevel1({ query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it("still rejects re-initiation once Avenia is processing the attempt", async () => {
    mockEntityPerProfile();
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      customerType: "business",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.InReview,
      statusExternal: KycAttemptStatus.PROCESSING
    })) as unknown as typeof ProviderCustomer.findOne;
    KycCase.findOne = mock(async () => ({
      providerCaseId: "attempt-1",
      statusExternal: KycAttemptStatus.PROCESSING
    })) as unknown as typeof KycCase.findOne;
    const initiateMock = mock(async () => ({ attemptId: "attempt-2" }));
    BrlaApiService.getInstance = mock(() => ({ initiateKybLevel1: initiateMock }) as unknown as BrlaApiService);

    const res = createResponse();
    await initiateKybLevel1({ query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(initiateMock).not.toHaveBeenCalled();
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

  // Migration 040 attached business rows to the profile's (038-backfilled) individual entity.
  // Comparing ownership against the typed business entity 403'd the legitimate owner and
  // findOrCreate'd an empty business entity as a side effect of the read.
  it("resolves a KYB attempt whose rows live on the profile's legacy individual entity", async () => {
    CustomerEntity.findAll = mock(async () => [
      { id: "entity-user-1-individual" }
    ]) as unknown as typeof CustomerEntity.findAll;
    const strayCreate = mock(async () => [{ id: "entity-user-1-business" }, true]);
    CustomerEntity.findOrCreate = strayCreate as unknown as typeof CustomerEntity.findOrCreate;
    KycCase.findOne = mock(async () => ({
      customerEntityId: "entity-user-1-individual",
      providerCustomerId: "customer-1"
    })) as unknown as typeof KycCase.findOne;
    ProviderCustomer.findByPk = mock(async () => ({
      customerEntityId: "entity-user-1-individual",
      provider: "avenia",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.Approved
    })) as unknown as typeof ProviderCustomer.findByPk;

    const res = createResponse();
    await getKybAttemptStatus({ query: { attemptId: "attempt-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(res.body).toEqual({
      result: KycAttemptResult.APPROVED,
      retryable: false,
      status: KycAttemptStatus.COMPLETED
    });
    expect(strayCreate).not.toHaveBeenCalled();
  });

  function mockApprovedAttempt() {
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
  }

  it("persists an approved provider result and returns only normalized browser fields", async () => {
    mockEntityPerProfile();
    const events: string[] = [];
    staticCaseUpdate.mockImplementation(async () => {
      events.push("caseUpdate");
      return [1];
    });
    KycCase.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      id: "case-1",
      providerCaseId: "attempt-1",
      providerCustomerId: "customer-1",
    })) as unknown as typeof KycCase.findOne;
    const customerUpdate = mock(async () => {
      events.push("customerUpdate");
    });
    ProviderCustomer.findByPk = mock(async () => ({
      customerEntityId: "entity-user-1",
      provider: "avenia",
      providerSubaccountId: "subaccount-1",
      update: customerUpdate
    })) as unknown as typeof ProviderCustomer.findByPk;
    mockApprovedAttempt();

    const realNotificationFindOne = EmailNotification.findOne;
    const realNotificationFindOrCreate = EmailNotification.findOrCreate;
    const realGetUserLocale = SupabaseAuthService.getUserLocale;
    const queuedKeys: Record<string, unknown>[] = [];
    EmailNotification.findOne = mock(async () => null) as unknown as typeof EmailNotification.findOne;
    SupabaseAuthService.getUserLocale = mock(async () => "en-US") as typeof SupabaseAuthService.getUserLocale;
    EmailNotification.findOrCreate = mock(async ({ defaults, where }: { defaults: unknown; where: Record<string, unknown> }) => {
      events.push("enqueue");
      queuedKeys.push(where);
      return [defaults as EmailNotification, true];
    }) as unknown as typeof EmailNotification.findOrCreate;

    try {
      const res = createResponse();
      await getKybAttemptStatus({ query: { attemptId: "attempt-1" }, userId: "user-1" } as any, res as any);

      expect(res.body).toEqual({
        result: KycAttemptResult.APPROVED,
        retryable: false,
        status: KycAttemptStatus.COMPLETED
      });
      expect(customerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: VerificationStatus.Approved, statusExternal: KycAttemptStatus.COMPLETED }),
        expect.anything()
      );
      expect(staticCaseUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: VerificationStatus.Approved, statusExternal: KycAttemptStatus.COMPLETED }),
        expect.objectContaining({ where: expect.objectContaining({ id: "case-1", providerCaseId: "attempt-1" }) })
      );
      expect(events).toEqual(["caseUpdate", "enqueue", "customerUpdate"]);
      expect(queuedKeys[0]).toEqual({
        provider: NotificationProvider.Avenia,
        resourceId: "attempt-1",
        type: NotificationType.VerificationApproved
      });
    } finally {
      EmailNotification.findOne = realNotificationFindOne;
      EmailNotification.findOrCreate = realNotificationFindOrCreate;
      SupabaseAuthService.getUserLocale = realGetUserLocale;
    }
  });

  it("fails the request and skips the terminal writes when the outcome cannot be queued", async () => {
    mockEntityPerProfile();
    KycCase.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      id: "case-1",
      providerCaseId: "attempt-1",
      providerCustomerId: "customer-1",
    })) as unknown as typeof KycCase.findOne;
    const customerUpdate = mock(async () => undefined);
    ProviderCustomer.findByPk = mock(async () => ({
      customerEntityId: "entity-user-1",
      provider: "avenia",
      providerSubaccountId: "subaccount-1",
      update: customerUpdate
    })) as unknown as typeof ProviderCustomer.findByPk;
    mockApprovedAttempt();

    const realNotificationFindOne = EmailNotification.findOne;
    EmailNotification.findOne = mock(async () => {
      throw new Error("queue unavailable");
    }) as unknown as typeof EmailNotification.findOne;

    try {
      const res = createResponse();
      await getKybAttemptStatus({ query: { attemptId: "attempt-1" }, userId: "user-1" } as any, res as any);

      // The case stays non-terminal, so the next poll re-observes the outcome and retries.
      expect(res.statusCode).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      expect(customerUpdate).not.toHaveBeenCalled();
    } finally {
      EmailNotification.findOne = realNotificationFindOne;
    }
  });

  it("does not let an old attempt poll overwrite its replacement", async () => {
    mockEntityPerProfile();
    KycCase.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      id: "case-1",
      providerCaseId: "attempt-old",
      providerCustomerId: "customer-1"
    })) as unknown as typeof KycCase.findOne;
    const customerUpdate = mock(async () => undefined);
    ProviderCustomer.findByPk = mock(async () => ({
      customerEntityId: "entity-user-1",
      provider: "avenia",
      providerSubaccountId: "subaccount-1",
      update: customerUpdate
    })) as unknown as typeof ProviderCustomer.findByPk;
    staticCaseUpdate.mockImplementation(async () => [0]);
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => ({
            attempt: {
              id: "attempt-old",
              result: KycAttemptResult.REJECTED,
              resultMessage: "rejected",
              retryable: true,
              status: KycAttemptStatus.COMPLETED
            }
          }))
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await getKybAttemptStatus({ query: { attemptId: "attempt-old" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(customerUpdate).not.toHaveBeenCalled();
  });
});

describe("createSubaccount", () => {
  const originalProviderFindOne = ProviderCustomer.findOne;
  const originalProviderCreate = ProviderCustomer.create;
  const originalEntityFindOne = CustomerEntity.findOne;
  const originalEntityFindOrCreate = CustomerEntity.findOrCreate;
  const originalEntityFindByPk = CustomerEntity.findByPk;
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
  });

  afterEach(() => {
    ProviderCustomer.findOne = originalProviderFindOne;
    ProviderCustomer.create = originalProviderCreate;
    CustomerEntity.findOne = originalEntityFindOne;
    CustomerEntity.findOrCreate = originalEntityFindOrCreate;
    CustomerEntity.findByPk = originalEntityFindByPk;
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

  it("rejects a managed child's mismatched account type before provider access", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    CustomerEntity.findByPk = mock(async () => ({ type: "individual" })) as unknown as typeof CustomerEntity.findByPk;

    const res = createResponse();
    await createSubaccount(
      {
        body: { accountType: AveniaAccountType.COMPANY, name: "Wrong Type", taxId: "11222333000181" },
        managedProfileContext: {
          actorProfileId: "manager-1",
          customerEntityId: "entity-child-1",
          managedProfileId: "relationship-1",
          subjectProfileId: "child-1"
        }
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(createAveniaSubaccountMock).not.toHaveBeenCalled();
  });

  it("rejects when the canonical provider customer belongs to a different Supabase user", async () => {
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

  // Migration 040 attached business rows to the profile's individual entity; the conflict
  // check compared against the typed business entity and 409'd the owner's own retry.
  it("does not 409 the owner's retry when the business row sits on the legacy individual entity", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    CustomerEntity.findAll = mock(async () => [
      { id: "entity-user-1-individual" }
    ]) as unknown as typeof CustomerEntity.findAll;
    const strayCreate = mock(async () => [{ id: "entity-user-1-business" }, true]);
    CustomerEntity.findOrCreate = strayCreate as unknown as typeof CustomerEntity.findOrCreate;
    const existingUpdate = mock(async () => undefined);
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1-individual",
      status: VerificationStatus.Pending,
      update: existingUpdate
    })) as unknown as typeof ProviderCustomer.findOne;

    const res = createResponse();
    await createSubaccount(
      {
        body: { accountType: AveniaAccountType.COMPANY, name: "Legacy Co", taxId: "11222333000181" },
        userId: "user-1"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(res.body).toEqual({ subAccountId: "new-subaccount" });
    expect(existingUpdate).toHaveBeenCalledWith(expect.objectContaining({ providerSubaccountId: "new-subaccount" }));
    // The retry updates the existing row in place — typed-entity creation must not run.
    expect(strayCreate).not.toHaveBeenCalled();
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

  it("creates a canonical provider customer when none exists", async () => {
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
    expect(providerCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEntityId: "entity-new-user",
        provider: "avenia",
        providerSubaccountId: "new-subaccount",
        taxReference: "08786985906"
      })
    );
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
      // No KYB attempt exists yet at subaccount creation — pending keeps the flow resumable.
      status: VerificationStatus.Pending
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

describe("getUploadUrls", () => {
  const originalProviderFindOne = ProviderCustomer.findOne;
  const originalEntityFindOrCreate = CustomerEntity.findOrCreate;
  const originalGetInstance = BrlaApiService.getInstance;
  const originalLoggerError = logger.error;

  beforeEach(() => {
    logger.error = mock(() => logger) as typeof logger.error;
  });

  afterEach(() => {
    ProviderCustomer.findOne = originalProviderFindOne;
    CustomerEntity.findOrCreate = originalEntityFindOrCreate;
    BrlaApiService.getInstance = originalGetInstance;
    logger.error = originalLoggerError;
  });

  const uploadUrlsMock = mock(async () => ({ id: "doc-1", uploadURLBack: "back-url", uploadURLFront: "front-url" }));

  function mockBrlaApi() {
    BrlaApiService.getInstance = mock(
      () => ({ getDocumentUploadUrls: uploadUrlsMock }) as unknown as BrlaApiService
    );
  }

  // Migration 040 attached business rows to the profile's individual entity; the ownership
  // check compared against the typed business entity and 403'd the legitimate owner.
  it("serves upload URLs for a business row on the legacy individual entity without creating entities", async () => {
    mockBrlaApi();
    uploadUrlsMock.mockClear();
    CustomerEntity.findAll = mock(async () => [
      { id: "entity-user-1-individual" }
    ]) as unknown as typeof CustomerEntity.findAll;
    const strayCreate = mock(async () => [{ id: "entity-user-1-business" }, true]);
    CustomerEntity.findOrCreate = strayCreate as unknown as typeof CustomerEntity.findOrCreate;
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1-individual",
      providerSubaccountId: "subaccount-1"
    })) as unknown as typeof ProviderCustomer.findOne;

    const res = createResponse();
    await getUploadUrls(
      { body: { documentType: AveniaDocumentType.ID, taxId: "11222333000181" }, userId: "user-1" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(uploadUrlsMock).toHaveBeenCalledTimes(2);
    expect(strayCreate).not.toHaveBeenCalled();
  });

  it("rejects a tax id owned by another profile", async () => {
    mockBrlaApi();
    uploadUrlsMock.mockClear();
    CustomerEntity.findAll = mock(async () => [
      { id: "entity-attacker" }
    ]) as unknown as typeof CustomerEntity.findAll;
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-victim",
      providerSubaccountId: "subaccount-1"
    })) as unknown as typeof ProviderCustomer.findOne;

    const res = createResponse();
    await getUploadUrls(
      { body: { documentType: AveniaDocumentType.ID, taxId: "11222333000181" }, userId: "attacker" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.FORBIDDEN);
    expect(uploadUrlsMock).not.toHaveBeenCalled();
  });
});

describe("Avenia API KYB", () => {
  const originals = {
    caseCreate: KycCase.create,
    caseFindOrCreate: KycCase.findOrCreate,
    caseFindOne: KycCase.findOne,
    caseUpdate: KycCase.update,
    getInstance: BrlaApiService.getInstance,
    providerFindOne: ProviderCustomer.findOne,
    transaction: sequelize.transaction
  };

  const validSubmission = {
    businessActivityDescription: "Software development",
    certificateOfIncorporationDocumentId: "certificate-1",
    companyCity: "Sao Paulo",
    companyCountry: "BRA",
    companyLegalName: "ACME LTDA",
    companyRegistrationNumber: "42731085000167",
    companyState: "SP",
    companyStreetLine1: "Av Paulista 1000",
    companyZipCode: "01310-100",
    countryTaxResidence: "BRA",
    estimatedAnnualRevenueUsd: "less_than_100k" as const,
    estimatedMonthlyVolumeUsd: "2000",
    numberOfEmployees: "1-10" as const,
    reasonForAccountOpening: "receive_payments_for_goods_and_services" as const,
    sourceOfFundsAndIncome: "sales_of_goods_and_services" as const,
    taxIdentificationDocumentId: "tax-document-1",
    taxIdentificationNumberTin: "42731085000167",
    uboIds: ["ubo-1"]
  };

  beforeEach(() => {
    logger.error = mock(() => logger) as typeof logger.error;
    CustomerEntity.findAll = mock(async () => [{ id: "entity-user-1" }]) as unknown as typeof CustomerEntity.findAll;
  });

  afterEach(() => {
    KycCase.create = originals.caseCreate;
    KycCase.findOrCreate = originals.caseFindOrCreate;
    KycCase.findOne = originals.caseFindOne;
    KycCase.update = originals.caseUpdate;
    BrlaApiService.getInstance = originals.getInstance;
    ProviderCustomer.findOne = originals.providerFindOne;
    sequelize.transaction = originals.transaction;
  });

  function mockBusinessAccount(update = mock(async () => undefined)) {
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      customerType: "business",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.Pending,
      statusExternal: null,
      update
    })) as unknown as typeof ProviderCustomer.findOne;
    return update;
  }

  function documentResponse(id: string) {
    const documentType =
      id === "certificate-1"
        ? AveniaDocumentType.CERTIFICATE_OF_INCORPORATION
        : id === "tax-document-1"
          ? AveniaDocumentType.COMPANY_TAX_IDENTIFICATION_DOCUMENT
          : AveniaDocumentType.PASSPORT;
    return {
      document: { documentType, id, ready: true, uploadStatusFront: "PROCESSED" }
    };
  }

  function mockInitialSubmission(options: { submitError?: Error } = {}) {
    const customerUpdate = mockBusinessAccount();
    const caseUpdate = mock(async () => undefined);
    KycCase.findOrCreate = mock(async () => [
      {
        id: "case-1",
        providerCaseId: null,
        submissionStatus: "not_started",
        update: caseUpdate
      },
      false
    ]) as unknown as typeof KycCase.findOrCreate;
    const claim = mock(async () => [1]);
    KycCase.update = claim as unknown as typeof KycCase.update;
    sequelize.transaction = mock(async callback => callback({} as never)) as unknown as typeof sequelize.transaction;
    const submit = options.submitError
      ? mock(async () => {
          throw options.submitError;
        })
      : mock(async () => ({ id: "attempt-1" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getUploadedDocument: mock(async (id: string) => documentResponse(id)),
          submitKybLevel1: submit
        }) as unknown as BrlaApiService
    );
    return { caseUpdate, claim, customerUpdate, submit };
  }

  it("creates a company document for a profile-bound secret key", async () => {
    mockBusinessAccount();
    const createDocument = mock(async () => ({ id: "document-1", uploadURLFront: "https://upload.example" }));
    BrlaApiService.getInstance = mock(
      () => ({ getDocumentUploadUrls: createDocument }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await createKybDocument(
      {
        body: { documentType: AveniaDocumentType.CERTIFICATE_OF_INCORPORATION },
        credential: { profileId: "user-1" },
        query: { subAccountId: "subaccount-1" }
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.CREATED);
    expect(createDocument).toHaveBeenCalledWith(
      AveniaDocumentType.CERTIFICATE_OF_INCORPORATION,
      false,
      "subaccount-1"
    );
  });

  it("does not expose another profile's subaccount to document creation", async () => {
    CustomerEntity.findAll = mock(async () => [{ id: "entity-attacker" }]) as unknown as typeof CustomerEntity.findAll;
    mockBusinessAccount();
    const createDocument = mock(async () => ({ id: "document-1" }));
    BrlaApiService.getInstance = mock(
      () => ({ getDocumentUploadUrls: createDocument }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await createKybDocument(
      {
        body: { documentType: AveniaDocumentType.CERTIFICATE_OF_INCORPORATION },
        query: { subAccountId: "subaccount-1" },
        userId: "attacker"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.FORBIDDEN);
    expect(createDocument).not.toHaveBeenCalled();
  });

  it("rejects UBO creation until its identification document is ready", async () => {
    mockBusinessAccount();
    const createUbo = mock(async () => ({ id: "ubo-1" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          createUbo,
          getUploadedDocument: mock(async () => ({
            document: {
              documentType: AveniaDocumentType.PASSPORT,
              id: "identity-1",
              ready: false,
              uploadStatusFront: "PROCESSING"
            }
          }))
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await createKybUbo(
      {
        body: { uploadedIdentificationId: "identity-1" },
        query: { subAccountId: "subaccount-1" },
        userId: "user-1"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(createUbo).not.toHaveBeenCalled();
  });

  it("submits ready company documents and persists the pending attempt", async () => {
    const { caseUpdate, claim, customerUpdate, submit } = mockInitialSubmission();

    const res = createResponse();
    await submitKybLevel1Api(
      { body: validSubmission, query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(submit).toHaveBeenCalledWith(validSubmission, "subaccount-1");
    expect(claim).toHaveBeenCalledWith(
      expect.objectContaining({ submissionStatus: "submitting" }),
      expect.objectContaining({
        where: { id: "case-1", providerCaseId: null, submissionStatus: "not_started" }
      })
    );
    expect(customerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: VerificationStatus.Pending, statusExternal: KycAttemptStatus.PENDING }),
      expect.anything()
    );
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        failureReasons: [],
        providerCaseId: "attempt-1",
        status: VerificationStatus.Pending,
        submissionStatus: "submitted"
      }),
      expect.anything()
    );
  });

  it("allows a new attempt only after a provider-confirmed retryable rejection", async () => {
    mockBusinessAccount();
    const caseUpdate = mock(async () => undefined);
    KycCase.findOrCreate = mock(async () => [
      {
        id: "case-1",
        providerCaseId: "attempt-old",
        submissionStatus: "submitted",
        update: caseUpdate
      },
      false
    ]) as unknown as typeof KycCase.findOrCreate;
    KycCase.update = mock(async () => [1]) as unknown as typeof KycCase.update;
    sequelize.transaction = mock(async callback => callback({} as never)) as unknown as typeof sequelize.transaction;
    const submit = mock(async () => ({ id: "attempt-new" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => ({
            attempt: {
              id: "attempt-old",
              result: KycAttemptResult.REJECTED,
              retryable: true,
              status: KycAttemptStatus.COMPLETED
            }
          })),
          getUploadedDocument: mock(async (id: string) => documentResponse(id)),
          submitKybLevel1: submit
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await submitKybLevel1Api(
      { body: validSubmission, query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ providerCaseId: "attempt-new", rejectedAt: null }),
      expect.anything()
    );
  });

  it("rejects resubmission after a non-retryable provider decision", async () => {
    mockBusinessAccount();
    KycCase.findOrCreate = mock(async () => [
      {
        id: "case-1",
        providerCaseId: "attempt-old",
        submissionStatus: "submitted"
      },
      false
    ]) as unknown as typeof KycCase.findOrCreate;
    const submit = mock(async () => ({ id: "attempt-new" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => ({
            attempt: {
              id: "attempt-old",
              result: KycAttemptResult.REJECTED,
              retryable: false,
              status: KycAttemptStatus.COMPLETED
            }
          })),
          submitKybLevel1: submit
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await submitKybLevel1Api(
      { body: validSubmission, query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(submit).not.toHaveBeenCalled();
  });

  it("reconciles an accepted attempt after the original response was lost", async () => {
    const customerUpdate = mockBusinessAccount();
    const caseUpdate = mock(async () => undefined);
    KycCase.findOrCreate = mock(async () => [
      {
        id: "case-1",
        providerCaseId: null,
        submissionRequestHash: hashAveniaKybSubmission(validSubmission),
        submissionStartedAt: new Date("2026-08-06T12:00:00.000Z"),
        submissionStatus: "unknown",
        set: mock(() => undefined),
        update: caseUpdate
      },
      false
    ]) as unknown as typeof KycCase.findOrCreate;
    sequelize.transaction = mock(async callback => callback({} as never)) as unknown as typeof sequelize.transaction;
    const submit = mock(async () => ({ id: "duplicate-attempt" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({
            attempts: [
              {
                createdAt: "2026-08-06T12:00:01.000Z",
                id: "recovered-attempt",
                levelName: "kyb-level-1"
              }
            ]
          })),
          submitKybLevel1: submit
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await submitKybLevel1Api(
      { body: validSubmission, query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(res.body).toEqual({ id: "recovered-attempt" });
    expect(submit).not.toHaveBeenCalled();
    expect(customerUpdate).toHaveBeenCalled();
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ providerCaseId: "recovered-attempt", submissionStatus: "submitted" }),
      expect.anything()
    );
  });

  it("marks an ambiguous provider submission failure unknown instead of replayable", async () => {
    const providerError = new BrlaApiError({
      endpoint: "/v2/kyc/new-level-1/api",
      method: "POST",
      responseBody: "connection reset",
      status: 0
    });
    const { caseUpdate } = mockInitialSubmission({ submitError: providerError });

    const res = createResponse();
    await submitKybLevel1Api(
      { body: validSubmission, query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.BAD_GATEWAY);
    expect(caseUpdate).toHaveBeenCalledWith({ submissionStatus: "unknown" });
  });
});
