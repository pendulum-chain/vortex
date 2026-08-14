import { BrlaApiService, type KycLevel1Payload } from "@vortexfi/shared";
import { afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import httpStatus from "http-status";
import { APIError } from "../api/errors/api-error";
import { claimStandardAveniaKycMethod, importAveniaKycToken } from "../api/services/avenia/avenia-kyc-import.service";
import { submitStandardAveniaKyc } from "../api/services/avenia/avenia-standard-kyc.service";
import sequelize from "../config/database";
import CustomerEntity from "../models/customerEntity.model";
import KycCase from "../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../models/providerCustomer.model";
import type User from "../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestUser } from "../test-utils/factories";

const originalGetInstance = BrlaApiService.getInstance;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 8_000);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

interface Fixture {
  kycCase: KycCase;
  providerCustomer: ProviderCustomer;
  subject: User;
}

async function createFixture(): Promise<Fixture> {
  const subject = await createTestUser();
  const entity = await CustomerEntity.create({
    country: "BR",
    profileId: subject.id,
    status: "active",
    type: "individual"
  });
  await subject.update({ activeCustomerEntityId: entity.id });
  const providerCustomer = await ProviderCustomer.create({
    country: "BR",
    customerEntityId: entity.id,
    customerType: "individual",
    provider: "avenia",
    providerSubaccountId: "subaccount-1",
    rail: "brl",
    status: VerificationStatus.Started
  });
  const kycCase = await KycCase.create({
    customerEntityId: entity.id,
    provider: "avenia",
    providerCustomerId: providerCustomer.id,
    status: VerificationStatus.Started,
    type: "kyc"
  });
  return { kycCase, providerCustomer, subject };
}

function providerWithBarriers() {
  const historyEntered = deferred();
  const releaseHistory = deferred();
  const importEntered = deferred();
  const releaseImport = deferred();
  let blockHistory = true;
  const importKycToken = mock(async () => {
    importEntered.resolve();
    await releaseImport.promise;
    return { id: "import-attempt-1", message: "processing" };
  });
  const submitKycLevel1 = mock(async () => ({ id: "standard-attempt-1" }));
  const provider = {
    getKycAttempts: mock(async () => {
      if (blockHistory) {
        blockHistory = false;
        historyEntered.resolve();
        await releaseHistory.promise;
      }
      return { attempts: [] };
    }),
    getUploadedDocuments: mock(async () => ({ documents: [] })),
    importKycToken,
    submitKycLevel1
  } as unknown as BrlaApiService;
  BrlaApiService.getInstance = mock(() => provider);
  return { historyEntered, importEntered, importKycToken, releaseHistory, releaseImport, submitKycLevel1 };
}

function importRequest(subject: User, idempotencyKey: string, importToken: string) {
  return {
    actorProfileId: subject.id,
    idempotencyKey,
    importToken,
    subjectProfileId: subject.id
  };
}

const standardPayload: KycLevel1Payload = {
  city: "Sao Paulo",
  country: "BR",
  countryOfTaxId: "BR",
  dateOfBirth: "1990-01-01",
  email: "person@example.com",
  fullName: "Test Person",
  state: "SP",
  streetAddress: "Test street",
  subAccountId: "subaccount-1",
  taxIdNumber: "12345678900",
  uploadedDocumentId: "document-1",
  uploadedSelfieId: "selfie-1",
  zipCode: "00000-000"
};

describe("Avenia KYC concurrency", () => {
  beforeAll(setupTestDatabase);
  beforeEach(async () => {
    await resetTestDatabase();
  });
  afterEach(() => {
    BrlaApiService.getInstance = originalGetInstance;
  });

  it("serializes concurrent token-import claims before the provider POST", async () => {
    const fixture = await createFixture();
    const barriers = providerWithBarriers();
    const first = importAveniaKycToken(importRequest(fixture.subject, "request-1", "share-token-1"));

    try {
      await bounded(barriers.historyEntered.promise, "the first claim to hold the case lock");
      const second = importAveniaKycToken(importRequest(fixture.subject, "request-2", "share-token-2")).catch(error => error);
      barriers.releaseHistory.resolve();

      await bounded(barriers.importEntered.promise, "the provider import POST");
      const secondResult = await bounded(second, "the competing token claim");
      expect(secondResult).toBeInstanceOf(APIError);
      expect(secondResult).toMatchObject({
        message: "Another token import requires reconciliation",
        status: httpStatus.CONFLICT
      });
      expect(barriers.importKycToken).toHaveBeenCalledTimes(1);

      barriers.releaseImport.resolve();
      await expect(bounded(first, "the winning token import")).resolves.toEqual({
        attemptId: "import-attempt-1",
        status: "pending"
      });
      expect((await fixture.kycCase.reload()).verificationMethod).toBe("sumsub_share_token");
      expect(await fixture.kycCase.reload()).toMatchObject({
        providerCaseId: "import-attempt-1",
        verificationSubmission: { status: "confirmed" }
      });
    } finally {
      barriers.releaseHistory.resolve();
      barriers.releaseImport.resolve();
      await Promise.allSettled([first]);
    }
  });

  it("serializes token import against standard method selection and provider mutation", async () => {
    const fixture = await createFixture();
    const barriers = providerWithBarriers();
    const tokenImport = importAveniaKycToken(importRequest(fixture.subject, "request-1", "share-token-1"));

    try {
      await bounded(barriers.historyEntered.promise, "the token claim to hold the case lock");
      const standardSubmission = submitStandardAveniaKyc({
        actorProfileId: fixture.subject.id,
        payload: standardPayload,
        providerCustomer: fixture.providerCustomer,
        subjectProfileId: fixture.subject.id
      }).catch(error => error);
      barriers.releaseHistory.resolve();

      await bounded(barriers.importEntered.promise, "the token provider mutation");
      const standardResult = await bounded(standardSubmission, "standard method selection");
      expect(standardResult).toBeInstanceOf(APIError);
      expect(standardResult).toMatchObject({
        message: "This KYC case uses Sumsub token import",
        status: httpStatus.CONFLICT
      });
      expect(barriers.importKycToken).toHaveBeenCalledTimes(1);
      expect(barriers.submitKycLevel1).not.toHaveBeenCalled();

      barriers.releaseImport.resolve();
      await expect(bounded(tokenImport, "the token import")).resolves.toEqual({
        attemptId: "import-attempt-1",
        status: "pending"
      });
      expect((await fixture.kycCase.reload()).verificationMethod).toBe("sumsub_share_token");
      expect((await fixture.kycCase.reload()).verificationSubmission).toMatchObject({ status: "confirmed" });
    } finally {
      barriers.releaseHistory.resolve();
      barriers.releaseImport.resolve();
      await Promise.allSettled([tokenImport]);
    }
  });

  it("rejects token import before its provider POST when the standard method claim wins", async () => {
    const fixture = await createFixture();
    const barriers = providerWithBarriers();
    barriers.releaseHistory.resolve();
    barriers.releaseImport.resolve();
    const standardClaim = claimStandardAveniaKycMethod(fixture.providerCustomer);
    const tokenImport = importAveniaKycToken(importRequest(fixture.subject, "request-1", "share-token-1")).catch(error => error);

    try {
      await expect(bounded(standardClaim, "the winning standard claim")).resolves.toMatchObject({
        id: fixture.kycCase.id,
        verificationMethod: "standard"
      });
      const tokenResult = await bounded(tokenImport, "the competing token claim");
      expect(tokenResult).toBeInstanceOf(APIError);
      expect(tokenResult).toMatchObject({
        message: "This KYC case uses the standard Avenia method",
        status: httpStatus.CONFLICT
      });
      expect((await fixture.kycCase.reload()).verificationMethod).toBe("standard");
      expect((await fixture.kycCase.reload()).verificationSubmission).toBeNull();
    } finally {
      await Promise.allSettled([standardClaim, tokenImport]);
    }
  });

  it("does not POST token import when concurrent approval wins the canonical locks", async () => {
    const fixture = await createFixture();
    const baselineEntered = deferred();
    const releaseBaseline = deferred();
    const importKycToken = mock(async () => ({ id: "must-not-import", message: "processing" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => {
            baselineEntered.resolve();
            await releaseBaseline.promise;
            return { attempts: [] };
          }),
          importKycToken
        }) as unknown as BrlaApiService
    );
    const submission = importAveniaKycToken(importRequest(fixture.subject, "request-1", "share-token-1")).catch(
      error => error
    );

    try {
      await bounded(baselineEntered.promise, "the token import baseline read");
      await sequelize.transaction(async transaction => {
        const providerCustomer = await ProviderCustomer.findByPk(fixture.providerCustomer.id, {
          lock: transaction.LOCK.UPDATE,
          transaction
        });
        const kycCase = await KycCase.findByPk(fixture.kycCase.id, { lock: transaction.LOCK.UPDATE, transaction });
        await providerCustomer?.update({ status: VerificationStatus.Approved }, { transaction });
        await kycCase?.update({ approvedAt: new Date(), status: VerificationStatus.Approved }, { transaction });
      });
      releaseBaseline.resolve();

      const result = await bounded(submission, "the approval-losing token import");
      expect(result).toBeInstanceOf(APIError);
      expect(result).toMatchObject({ message: "The Avenia KYC is already approved", status: httpStatus.CONFLICT });
      expect(importKycToken).not.toHaveBeenCalled();
    } finally {
      releaseBaseline.resolve();
      await Promise.allSettled([submission]);
    }
  });

  it("does not POST standard KYC when concurrent approval wins the canonical locks", async () => {
    const fixture = await createFixture();
    const baselineEntered = deferred();
    const releaseBaseline = deferred();
    const submitKycLevel1 = mock(async () => ({ id: "must-not-submit" }));
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => {
            baselineEntered.resolve();
            await releaseBaseline.promise;
            return { attempts: [] };
          }),
          getUploadedDocuments: mock(async () => ({
            documents: [
              { id: standardPayload.uploadedDocumentId, ready: true },
              { id: standardPayload.uploadedSelfieId, ready: true }
            ]
          })),
          submitKycLevel1
        }) as unknown as BrlaApiService
    );
    const originalSetTimeout = globalThis.setTimeout;
    const timeout = spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay === 5_000) {
        callback();
        return 0;
      }
      return originalSetTimeout(callback, delay, ...args);
    }) as typeof setTimeout);
    const submission = submitStandardAveniaKyc({
      actorProfileId: fixture.subject.id,
      payload: standardPayload,
      providerCustomer: fixture.providerCustomer,
      subjectProfileId: fixture.subject.id
    }).catch(error => error);

    try {
      await bounded(
        Promise.race([
          baselineEntered.promise,
          submission.then(result => {
            throw result;
          })
        ]),
        "the standard submission baseline read"
      );
      await sequelize.transaction(async transaction => {
        const providerCustomer = await ProviderCustomer.findByPk(fixture.providerCustomer.id, {
          lock: transaction.LOCK.UPDATE,
          transaction
        });
        const kycCase = await KycCase.findByPk(fixture.kycCase.id, { lock: transaction.LOCK.UPDATE, transaction });
        await providerCustomer?.update({ status: VerificationStatus.Approved }, { transaction });
        await kycCase?.update({ approvedAt: new Date(), status: VerificationStatus.Approved }, { transaction });
      });
      releaseBaseline.resolve();

      const result = await bounded(submission, "the approval-losing standard submission");
      expect(result).toBeInstanceOf(APIError);
      expect(result).toMatchObject({ status: httpStatus.CONFLICT });
      expect(submitKycLevel1).not.toHaveBeenCalled();
    } finally {
      releaseBaseline.resolve();
      timeout.mockRestore();
      await Promise.allSettled([submission]);
    }
  });
});
