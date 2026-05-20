import { AveniaAccountType, BrlaApiService } from "@vortexfi/shared";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import httpStatus from "http-status";
import logger from "../../config/logger";
import TaxId, { TaxIdInternalStatus } from "../../models/taxId.model";
import { createSubaccount, getAveniaUser } from "./brla.controller";

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

describe("getAveniaUser", () => {
  const originalFindOne = TaxId.findOne;
  const originalGetInstance = BrlaApiService.getInstance;
  const originalLoggerError = logger.error;
  const originalLoggerInfo = logger.info;

  beforeEach(() => {
    logger.error = mock(() => logger) as typeof logger.error;
    logger.info = mock(() => logger) as typeof logger.info;
  });

  afterEach(() => {
    TaxId.findOne = originalFindOne;
    BrlaApiService.getInstance = originalGetInstance;
    logger.error = originalLoggerError;
    logger.info = originalLoggerInfo;
  });

  function mockConfirmedAveniaUser() {
    TaxId.findOne = mock(async () => ({ subAccountId: "subaccount-1" })) as typeof TaxId.findOne;
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

  it("returns 400 when taxId is missing", async () => {
    mockConfirmedAveniaUser();

    const res = createResponse();
    await getAveniaUser(
      {
        query: {}
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ error: "Missing taxId query parameters" });
  });

  it("allows partner API key lookups without quoteId", async () => {
    mockConfirmedAveniaUser();

    const res = createResponse();
    await getAveniaUser(
      {
        authenticatedPartner: { id: "partner-1", name: "Partner" },
        query: { taxId: "08786985906" }
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(res.body).toEqual(expectedConfirmedBody);
  });

  it("allows Supabase-authenticated user lookups", async () => {
    mockConfirmedAveniaUser();

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
});

describe("createSubaccount", () => {
  const originalFindByPk = TaxId.findByPk;
  const originalCreate = TaxId.create;
  const originalGetInstance = BrlaApiService.getInstance;
  const originalLoggerError = logger.error;

  beforeEach(() => {
    logger.error = mock(() => logger) as typeof logger.error;
  });

  afterEach(() => {
    TaxId.findByPk = originalFindByPk;
    TaxId.create = originalCreate;
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
    quoteId: "quote-1",
    taxId: "08786985906"
  };

  it("rejects when an existing subaccount belongs to a different Supabase user", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    TaxId.findByPk = mock(async () => ({
      internalStatus: TaxIdInternalStatus.Accepted,
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

  it("rejects when an authenticated caller targets an anonymously-owned existing subaccount", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    TaxId.findByPk = mock(async () => ({
      internalStatus: TaxIdInternalStatus.Requested,
      userId: null
    })) as typeof TaxId.findByPk;

    const res = createResponse();
    await createSubaccount(
      {
        body: validBody,
        userId: "some-user"
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(createAveniaSubaccountMock).not.toHaveBeenCalled();
  });

  it("allows an authenticated user to (re)create their own subaccount", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    const updateMock = mock(async () => undefined);
    TaxId.findByPk = mock(async () => ({
      internalStatus: TaxIdInternalStatus.Accepted,
      update: updateMock,
      userId: "same-user"
    })) as typeof TaxId.findByPk;

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
    const createTaxIdMock = mock(async () => undefined);
    TaxId.findByPk = mock(async () => null) as typeof TaxId.findByPk;
    TaxId.create = createTaxIdMock as unknown as typeof TaxId.create;

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
    expect(createTaxIdMock).toHaveBeenCalled();
  });

  it("allows overwrite when the existing record is only in Consulted state", async () => {
    mockBrlaApi();
    createAveniaSubaccountMock.mockClear();
    const updateMock = mock(async () => undefined);
    TaxId.findByPk = mock(async () => ({
      internalStatus: TaxIdInternalStatus.Consulted,
      update: updateMock,
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

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(createAveniaSubaccountMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalled();
  });
});
