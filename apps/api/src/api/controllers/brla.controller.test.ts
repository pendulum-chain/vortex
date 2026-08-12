import {AveniaAccountType, AveniaDocumentType, BrlaApiError, BrlaApiService, FiatToken, KycAttemptResult, KycAttemptStatus} from "@vortexfi/shared";
import {afterEach, beforeEach, describe, expect, it, mock} from "bun:test";
import httpStatus from "http-status";
import sequelize from "../../config/database";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import EmailNotification, { NotificationProvider, NotificationType } from "../../models/emailNotification.model";
import FinancialOperation from "../../models/financialOperation.model";
import KycCase from "../../models/kycCase.model";
import PartnerManagedProfile from "../../models/partnerManagedProfile.model";
import ProviderCustomer, {VerificationStatus} from "../../models/providerCustomer.model";
import QuoteTicket from "../../models/quoteTicket.model";
import User from "../../models/user.model";
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
  newKyc,
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
  const originalQuoteFindByPk = QuoteTicket.findByPk;

  // A Brazil onramp quote owned by user-1, so the ownership + corridor guards pass.
  const mockOwnedBrlQuote = () => {
    QuoteTicket.findByPk = mock(async () => ({
      inputCurrency: FiatToken.BRL,
      outputCurrency: "USDC",
      partnerId: null,
      userId: "user-1"
    })) as unknown as typeof QuoteTicket.findByPk;
  };

  afterEach(() => {
    ProviderCustomer.findOne = originalProviderFindOne;
    ProviderCustomer.create = originalProviderCreate;
    CustomerEntity.findOne = originalEntityFindOne;
    CustomerEntity.findOrCreate = originalEntityFindOrCreate;
    KycCase.findOne = originalKycCaseFindOne;
    KycCase.create = originalKycCaseCreate;
    QuoteTicket.findByPk = originalQuoteFindByPk;
  });

  it("records the first valid Avenia interaction as started", async () => {
    mockEntityPerProfile();
    mockOwnedBrlQuote();
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

  it("rejects a marker against a quote the caller does not own", async () => {
    // quote belongs to a different user: assertQuoteOwnership must reject and no marker is created.
    QuoteTicket.findByPk = mock(async () => ({
      inputCurrency: FiatToken.BRL,
      outputCurrency: "USDC",
      partnerId: null,
      userId: "other-user"
    })) as unknown as typeof QuoteTicket.findByPk;
    const providerCreate = mock(async () => ({ id: "customer-1" }));
    ProviderCustomer.create = providerCreate as unknown as typeof ProviderCustomer.create;

    const res = createResponse();
    await recordInitialKycAttempt(
      { body: { quoteId: "quote-1", taxId: "08786985906" }, userId: "attacker" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.FORBIDDEN);
    expect(providerCreate).not.toHaveBeenCalled();
  });

  it("rejects a marker when the owned quote is not a Brazil corridor", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      inputCurrency: "USDC",
      outputCurrency: FiatToken.ARS,
      partnerId: null,
      userId: "user-1"
    })) as unknown as typeof QuoteTicket.findByPk;
    const providerCreate = mock(async () => ({ id: "customer-1" }));
    ProviderCustomer.create = providerCreate as unknown as typeof ProviderCustomer.create;

    const res = createResponse();
    await recordInitialKycAttempt(
      { body: { quoteId: "quote-1", taxId: "08786985906" }, userId: "user-1" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ error: "quoteId does not reference a Brazil onboarding quote" });
    expect(providerCreate).not.toHaveBeenCalled();
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
          })),
          getKycAttempts: mock(async () => ({ attempts: [] }))
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
          })),
          getKycAttempts: mock(async () => ({ attempts: [] }))
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await initiateKybLevel1({ query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(strayCreate).not.toHaveBeenCalled();
  });

  it("rejects re-initiation while Avenia reports a pending KYB attempt", async () => {
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
    const initiateMock = mock(async () => ({
      attemptId: "attempt-2",
      authorizedRepresentativeUrl: "https://avenia.example/representative",
      basicCompanyDataUrl: "https://avenia.example/company"
    }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({
            attempts: [{ id: "attempt-1", levelName: "kyb-level-1", status: KycAttemptStatus.PENDING }]
          })),
          initiateKybLevel1: initiateMock
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await initiateKybLevel1({ query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(initiateMock).not.toHaveBeenCalled();
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
    const initiateMock = mock(async () => ({ attemptId: "attempt-2" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({
            attempts: [{ id: "attempt-1", levelName: "kyb-level-1", status: KycAttemptStatus.PROCESSING }]
          })),
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
    const initiateMock = mock(async () => ({
      attemptId: "attempt-2",
      authorizedRepresentativeUrl: "https://avenia.example/representative",
      basicCompanyDataUrl: "https://avenia.example/company"
    }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => {
            throw new BrlaApiError({
              endpoint: "/v2/kyc/attempts",
              method: "GET",
              responseBody: "avenia unavailable",
              status: httpStatus.INTERNAL_SERVER_ERROR
            });
          }),
          initiateKybLevel1: initiateMock
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await initiateKybLevel1({ query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.BAD_GATEWAY);
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it("allows Avenia to decide whether a terminal KYB attempt may be retried", async () => {
    mockEntityPerProfile();
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1",
      customerType: "business",
      id: "customer-1",
      providerSubaccountId: "subaccount-1",
      status: VerificationStatus.Rejected,
      update: mock(async () => undefined)
    })) as unknown as typeof ProviderCustomer.findOne;
    KycCase.findOne = mock(async () => ({ update: mock(async () => undefined) })) as unknown as typeof KycCase.findOne;
    const initiateMock = mock(async () => ({ attemptId: "attempt-2" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({
            attempts: [{ id: "attempt-1", levelName: "kyb-level-1", status: KycAttemptStatus.COMPLETED }]
          })),
          initiateKybLevel1: initiateMock
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await initiateKybLevel1({ query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(initiateMock).toHaveBeenCalledWith("subaccount-1");
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
  const originalFinancialOperationFindOrCreate = FinancialOperation.findOrCreate;
  const originalFinancialOperationUpdate = FinancialOperation.update;
  const originalGetInstance = BrlaApiService.getInstance;
  const originalLoggerError = logger.error;
  const originalTransaction = sequelize.transaction;
  const originalQuery = sequelize.query;

  beforeEach(() => {
    logger.error = mock(() => logger) as typeof logger.error;
    mockEntityPerProfile();
    sequelize.transaction = mock(async callback => callback({} as never)) as never;
    sequelize.query = mock(async () => []) as never;
    // No pre-existing kyc case; case creation is fire-and-forget for these scenarios.
    KycCase.findOne = mock(async () => null) as typeof KycCase.findOne;
    KycCase.create = mock(async () => ({})) as unknown as typeof KycCase.create;
    createAveniaSubaccountMock.mockClear();
    subaccountInfoMock.mockClear();

    let operation: Record<string, unknown> | null = null;
    FinancialOperation.findOrCreate = mock(async (options: { defaults: Record<string, unknown> }) => {
      if (operation) return [operation, false];
      operation = {
        ...options.defaults,
        id: "operation-1",
        response: null,
        update: mock(async (values: Record<string, unknown>) => {
          Object.assign(operation as object, values);
        })
      };
      return [operation, true];
    }) as unknown as typeof FinancialOperation.findOrCreate;
    FinancialOperation.update = mock(async values => {
      if (operation?.status !== "not_started") return [0];
      Object.assign(operation, values);
      return [1];
    }) as unknown as typeof FinancialOperation.update;
  });

  afterEach(() => {
    ProviderCustomer.findOne = originalProviderFindOne;
    ProviderCustomer.create = originalProviderCreate;
    CustomerEntity.findOne = originalEntityFindOne;
    CustomerEntity.findOrCreate = originalEntityFindOrCreate;
    CustomerEntity.findByPk = originalEntityFindByPk;
    KycCase.findOne = originalKycCaseFindOne;
    KycCase.create = originalKycCaseCreate;
    FinancialOperation.findOrCreate = originalFinancialOperationFindOrCreate;
    FinancialOperation.update = originalFinancialOperationUpdate;
    BrlaApiService.getInstance = originalGetInstance;
    logger.error = originalLoggerError;
    sequelize.transaction = originalTransaction;
    sequelize.query = originalQuery;
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
    expect(existingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ providerSubaccountId: "new-subaccount" }),
      expect.anything()
    );
    // The retry updates the existing row in place — typed-entity creation must not run.
    expect(strayCreate).not.toHaveBeenCalled();
  });

  it("returns an authenticated user's canonical subaccount without recreating or resetting it", async () => {
    mockBrlaApi();
    const updateMock = mock(async () => undefined);
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-same-user",
      customerType: "individual",
      id: "customer-1",
      providerSubaccountId: "existing-subaccount",
      status: VerificationStatus.Approved,
      statusExternal: "APPROVED",
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
    expect(res.body).toEqual({ subAccountId: "existing-subaccount" });
    expect(createAveniaSubaccountMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("serializes concurrent first-time creation by tax id", async () => {
    let canonicalCustomer: Record<string, unknown> | null = null;
    let lockTail = Promise.resolve();
    const providerCreate = mock(async (values: Record<string, unknown>) => {
      canonicalCustomer = { id: "customer-1", ...values };
      return canonicalCustomer;
    });
    let providerStartedResolve: () => void = () => undefined;
    const providerStarted = new Promise<void>(resolve => {
      providerStartedResolve = resolve;
    });
    let releaseProvider: () => void = () => undefined;
    const providerBarrier = new Promise<void>(resolve => {
      releaseProvider = resolve;
    });
    const providerCreateSubaccount = mock(async () => {
      providerStartedResolve();
      await providerBarrier;
      return { id: "new-subaccount" };
    });

    sequelize.transaction = mock(async callback => {
      const transaction: { release?: () => void } = {};
      try {
        return await callback(transaction as never);
      } finally {
        transaction.release?.();
      }
    }) as never;
    sequelize.query = mock(async (_sql, options: { transaction: { release?: () => void } }) => {
      const previous = lockTail;
      let releaseLock: () => void = () => undefined;
      lockTail = new Promise<void>(resolve => {
        releaseLock = resolve;
      });
      await previous;
      options.transaction.release = releaseLock;
      return [];
    }) as never;
    ProviderCustomer.findOne = mock(async () => canonicalCustomer) as unknown as typeof ProviderCustomer.findOne;
    ProviderCustomer.create = providerCreate as unknown as typeof ProviderCustomer.create;
    BrlaApiService.getInstance = mock(
      () => ({ createAveniaSubaccount: providerCreateSubaccount }) as unknown as BrlaApiService
    );

    const first = createResponse();
    const second = createResponse();
    const firstRequest = createSubaccount({ body: validBody, userId: "same-user" } as any, first as any);
    await providerStarted;
    await createSubaccount({ body: validBody, userId: "same-user" } as any, second as any);
    releaseProvider();
    await firstRequest;

    expect(first.statusCode).toBe(httpStatus.OK);
    expect(second.statusCode).toBe(httpStatus.SERVICE_UNAVAILABLE);
    expect(first.body).toEqual({ subAccountId: "new-subaccount" });
    expect(providerCreateSubaccount).toHaveBeenCalledTimes(1);
    expect(providerCreate).toHaveBeenCalledTimes(1);
    expect(sequelize.query).toHaveBeenCalledTimes(3);
  });

  it("does not repeat an ambiguous provider creation after a crash-like failure", async () => {
    const providerCreateSubaccount = mock(async () => {
      throw new Error("connection reset after provider submission");
    });
    ProviderCustomer.findOne = mock(async () => null) as typeof ProviderCustomer.findOne;
    const providerCreate = mock(async () => ({}));
    ProviderCustomer.create = providerCreate as unknown as typeof ProviderCustomer.create;
    BrlaApiService.getInstance = mock(
      () => ({ createAveniaSubaccount: providerCreateSubaccount }) as unknown as BrlaApiService
    );

    const first = createResponse();
    await createSubaccount({ body: validBody, userId: "same-user" } as any, first as any);
    const retry = createResponse();
    await createSubaccount({ body: validBody, userId: "same-user" } as any, retry as any);

    expect(first.statusCode).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    expect(retry.statusCode).toBe(httpStatus.SERVICE_UNAVAILABLE);
    expect(providerCreateSubaccount).toHaveBeenCalledTimes(1);
    expect(providerCreate).not.toHaveBeenCalled();
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
      }),
      expect.anything()
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

  // Migration 040 attached rows to the profile's individual entity; the ownership check
  // must enumerate existing entities without creating another one.
  it("serves upload URLs for an individual row without creating entities", async () => {
    mockBrlaApi();
    uploadUrlsMock.mockClear();
    CustomerEntity.findAll = mock(async () => [
      { id: "entity-user-1-individual" }
    ]) as unknown as typeof CustomerEntity.findAll;
    const strayCreate = mock(async () => [{ id: "entity-user-1-business" }, true]);
    CustomerEntity.findOrCreate = strayCreate as unknown as typeof CustomerEntity.findOrCreate;
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-user-1-individual",
      customerType: "individual",
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
      customerType: "individual",
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

  it("rejects an owned business customer before requesting upload URLs", async () => {
    mockBrlaApi();
    uploadUrlsMock.mockClear();
    CustomerEntity.findAll = mock(async () => [{ id: "entity-business" }]) as unknown as typeof CustomerEntity.findAll;
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-business",
      customerType: "business",
      providerSubaccountId: "subaccount-1"
    })) as unknown as typeof ProviderCustomer.findOne;

    const res = createResponse();
    await getUploadUrls(
      { body: { documentType: AveniaDocumentType.ID, taxId: "11222333000181" }, userId: "business-user" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(uploadUrlsMock).not.toHaveBeenCalled();
  });
});

describe("newKyc", () => {
  const originalProviderFindOne = ProviderCustomer.findOne;
  const originalGetInstance = BrlaApiService.getInstance;

  afterEach(() => {
    ProviderCustomer.findOne = originalProviderFindOne;
    BrlaApiService.getInstance = originalGetInstance;
  });

  it("rejects an owned business customer before submitting KYC", async () => {
    CustomerEntity.findAll = mock(async () => [{ id: "entity-business" }]) as unknown as typeof CustomerEntity.findAll;
    ProviderCustomer.findOne = mock(async () => ({
      customerEntityId: "entity-business",
      customerType: "business",
      providerSubaccountId: "subaccount-1"
    })) as unknown as typeof ProviderCustomer.findOne;
    const getInstance = mock(() => ({} as BrlaApiService));
    BrlaApiService.getInstance = getInstance;

    const res = createResponse();
    await newKyc({ body: { subAccountId: "subaccount-1" }, userId: "business-user" } as any, res as any);

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(getInstance).not.toHaveBeenCalled();
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

  function mockInitialSubmission() {
    const customerUpdate = mockBusinessAccount();
    const caseUpdate = mock(async () => undefined);
    KycCase.findOrCreate = mock(async () => [
      {
        id: "case-1",
        providerCaseId: null,
        update: caseUpdate
      },
      false
    ]) as unknown as typeof KycCase.findOrCreate;
    sequelize.transaction = mock(async callback => callback({} as never)) as unknown as typeof sequelize.transaction;
    const submit = mock(async () => ({ id: "attempt-1" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({ attempts: [] })),
          getUploadedDocument: mock(async (id: string) => documentResponse(id)),
          submitKybLevel1: submit
        }) as unknown as BrlaApiService
    );
    return { caseUpdate, customerUpdate, submit };
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
    const { caseUpdate, customerUpdate, submit } = mockInitialSubmission();

    const res = createResponse();
    await submitKybLevel1Api(
      { body: validSubmission, query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(submit).toHaveBeenCalledWith(validSubmission, "subaccount-1");
    expect(customerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: VerificationStatus.Pending, statusExternal: KycAttemptStatus.PENDING }),
      expect.anything()
    );
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        failureReasons: [],
        providerCaseId: "attempt-1",
        status: VerificationStatus.Pending
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
          getKycAttempts: mock(async () => ({
            attempts: [{ id: "attempt-old", levelName: "kyb-level-1", status: KycAttemptStatus.COMPLETED }]
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

  it("defers retry eligibility for a terminal attempt to Avenia", async () => {
    mockBusinessAccount();
    KycCase.findOrCreate = mock(async () => [
      {
        id: "case-1",
        providerCaseId: "attempt-old"
      },
      false
    ]) as unknown as typeof KycCase.findOrCreate;
    const submit = mock(async () => {
      throw new BrlaApiError({
        endpoint: "/v2/kyc/new-level-1/api",
        method: "POST",
        responseBody: JSON.stringify({ message: "Attempt is not retryable" }),
        status: httpStatus.BAD_REQUEST
      });
    });
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({
            attempts: [{ id: "attempt-old", levelName: "kyb-level-1", status: KycAttemptStatus.COMPLETED }]
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

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(submit).toHaveBeenCalledWith(validSubmission, "subaccount-1");
  });

  it("repairs a missing local binding after Avenia accepted the first submission", async () => {
    const customerUpdate = mockBusinessAccount();
    const caseUpdate = mock(async () => undefined);
    KycCase.findOrCreate = mock(async () => [
      { id: "case-1", providerCaseId: null, update: caseUpdate },
      false
    ]) as unknown as typeof KycCase.findOrCreate;
    sequelize.transaction = mock(async callback => callback({} as never)) as unknown as typeof sequelize.transaction;
    const getKycAttempts = mock(async () => ({ attempts: [] as any[] }));
    const submit = mock(async () => ({ id: "accepted-attempt" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts,
          getUploadedDocument: mock(async (id: string) => documentResponse(id)),
          submitKybLevel1: submit
        }) as unknown as BrlaApiService
    );

    const failedResponse = createResponse();
    caseUpdate.mockImplementationOnce(async () => {
      throw new Error("database unavailable");
    });
    await submitKybLevel1Api(
      { body: validSubmission, query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any,
      failedResponse as any
    );
    expect(failedResponse.statusCode).toBe(httpStatus.INTERNAL_SERVER_ERROR);

    getKycAttempts.mockImplementation(async () => ({
      attempts: [
        {
          createdAt: "2026-08-12T10:00:00.000Z",
          id: "accepted-attempt",
          levelName: "kyb-level-1",
          status: KycAttemptStatus.PENDING,
          updatedAt: "2026-08-12T10:00:00.000Z"
        }
      ]
    }));
    const repairedResponse = createResponse();
    await submitKybLevel1Api(
      { body: validSubmission, query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any,
      repairedResponse as any
    );

    expect(repairedResponse.statusCode).toBe(httpStatus.OK);
    expect(repairedResponse.body).toEqual({ id: "accepted-attempt" });
    expect(getKycAttempts).toHaveBeenLastCalledWith("subaccount-1");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(customerUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: VerificationStatus.Pending, statusExternal: KycAttemptStatus.PENDING }),
      expect.anything()
    );
    expect(caseUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        providerCaseId: "accepted-attempt",
        status: VerificationStatus.Pending,
        statusExternal: KycAttemptStatus.PENDING
      }),
      expect.anything()
    );
  });

  it("reconciles one processing attempt after the submit POST conflicts", async () => {
    const customerUpdate = mockBusinessAccount();
    const caseUpdate = mock(async () => undefined);
    KycCase.findOrCreate = mock(async () => [
      { id: "case-1", providerCaseId: null, update: caseUpdate },
      false
    ]) as unknown as typeof KycCase.findOrCreate;
    sequelize.transaction = mock(async callback => callback({} as never)) as unknown as typeof sequelize.transaction;
    const getKycAttempts = mock()
      .mockResolvedValueOnce({ attempts: [] })
      .mockResolvedValueOnce({
        attempts: [
          {
            createdAt: "2026-08-12T10:00:00.000Z",
            id: "conflicting-attempt",
            levelName: "kyb-level-1",
            status: KycAttemptStatus.PROCESSING,
            updatedAt: "2026-08-12T10:01:00.000Z"
          }
        ]
      });
    const submit = mock(async () => {
      throw new BrlaApiError({
        endpoint: "/v2/kyc/new-level-1/api",
        method: "POST",
        responseBody: JSON.stringify({ message: "Existing attempt" }),
        status: httpStatus.CONFLICT
      });
    });
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts,
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
    expect(res.body).toEqual({ id: "conflicting-attempt" });
    expect(getKycAttempts).toHaveBeenCalledTimes(2);
    expect(getKycAttempts).toHaveBeenNthCalledWith(1, "subaccount-1");
    expect(getKycAttempts).toHaveBeenNthCalledWith(2, "subaccount-1");
    expect(customerUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: VerificationStatus.InReview, statusExternal: KycAttemptStatus.PROCESSING }),
      expect.anything()
    );
    expect(caseUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        providerCaseId: "conflicting-attempt",
        status: VerificationStatus.InReview,
        statusExternal: KycAttemptStatus.PROCESSING
      }),
      expect.anything()
    );
  });

  it("fails closed when Avenia reports multiple active KYB attempts", async () => {
    mockBusinessAccount();
    KycCase.findOrCreate = mock(async () => {
      throw new Error("Ambiguous attempts must not be bound");
    }) as unknown as typeof KycCase.findOrCreate;
    const submit = mock(async () => ({ id: "duplicate-attempt" }));
    const activeAttempt = (id: string, status: KycAttemptStatus) => ({
      createdAt: "2026-08-12T10:00:00.000Z",
      id,
      levelName: "kyb-level-1",
      status,
      updatedAt: "2026-08-12T10:00:00.000Z"
    });
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({
            attempts: [
              activeAttempt("pending-attempt", KycAttemptStatus.PENDING),
              activeAttempt("processing-attempt", KycAttemptStatus.PROCESSING)
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

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(submit).not.toHaveBeenCalled();
  });

  it("propagates an unrelated provider submission failure without reconciliation", async () => {
    mockBusinessAccount();
    KycCase.findOrCreate = mock(async () => [
      { id: "case-1", providerCaseId: null, update: mock(async () => undefined) },
      false
    ]) as unknown as typeof KycCase.findOrCreate;
    const getKycAttempts = mock(async () => ({ attempts: [] }));
    const submitError = new BrlaApiError({
      endpoint: "/v2/kyc/new-level-1/api",
      method: "POST",
      responseBody: JSON.stringify({ message: "Service unavailable" }),
      status: httpStatus.SERVICE_UNAVAILABLE
    });
    const submit = mock(async () => {
      throw submitError;
    });
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts,
          getUploadedDocument: mock(async (id: string) => documentResponse(id)),
          submitKybLevel1: submit
        }) as unknown as BrlaApiService
    );

    const res = createResponse();
    await submitKybLevel1Api(
      { body: validSubmission, query: { subAccountId: "subaccount-1" }, userId: "user-1" } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.BAD_GATEWAY);
    expect(res.body).toEqual({ error: "Avenia request failed" });
    expect(getKycAttempts).toHaveBeenCalledTimes(1);
  });
});
