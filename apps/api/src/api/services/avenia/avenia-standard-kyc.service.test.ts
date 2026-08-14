import { createHash } from "node:crypto";
import { BrlaApiService, type KycAttempt, KycAttemptResult, KycAttemptStatus, type KycLevel1Payload } from "@vortexfi/shared";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import sequelize from "../../../config/database";
import CustomerEntity from "../../../models/customerEntity.model";
import KycCase, { type IndividualKycSubmission } from "../../../models/kycCase.model";
import ManagedProfile from "../../../models/managedProfile.model";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import User from "../../../models/user.model";
import { submitStandardAveniaKyc } from "./avenia-standard-kyc.service";

const originals = {
  caseFindAll: KycCase.findAll,
  caseFindByPk: KycCase.findByPk,
  customerFindByPk: ProviderCustomer.findByPk,
  entityFindByPk: CustomerEntity.findByPk,
  getInstance: BrlaApiService.getInstance,
  managerFindByPk: ManagedProfileManager.findByPk,
  relationshipFindByPk: ManagedProfile.findByPk,
  transaction: sequelize.transaction,
  userFindByPk: User.findByPk
};

const payload: KycLevel1Payload = {
  city: "Sao Paulo",
  country: "BR",
  countryOfTaxId: "BR",
  dateOfBirth: "1990-01-01",
  email: "person@example.com",
  fullName: "Private Person",
  state: "SP",
  streetAddress: "Private street",
  subAccountId: "subaccount-1",
  taxIdNumber: "private-tax-id",
  uploadedDocumentId: "private-document",
  uploadedSelfieId: "private-selfie",
  zipCode: "00000-000"
};

function fingerprint(value: KycLevel1Payload): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        city: value.city,
        country: value.country,
        countryOfTaxId: value.countryOfTaxId,
        dateOfBirth: value.dateOfBirth,
        email: value.email,
        fullName: value.fullName,
        state: value.state,
        streetAddress: value.streetAddress,
        subAccountId: value.subAccountId,
        taxIdNumber: value.taxIdNumber,
        uploadedDocumentId: value.uploadedDocumentId,
        uploadedSelfieId: value.uploadedSelfieId,
        zipCode: value.zipCode
      })
    )
    .digest("hex");
}

interface HarnessOptions {
  approveDuringSubmit?: boolean;
  attempts?: KycAttempt[];
  boundAttemptIds?: string[];
  managerActive?: boolean;
  providerAttemptId?: string;
  submittedAt?: Date | null;
  submission?: IndividualKycSubmission;
  submitError?: boolean;
  verificationMethod?: KycCase["verificationMethod"];
  verificationAttempt?: Partial<KycAttempt>;
}

function harness(options: HarnessOptions = {}) {
  const lockOrder: string[] = [];
  const providerCustomer = {
    customerEntityId: "entity-1",
    customerType: "individual",
    id: "customer-1",
    provider: "avenia",
    providerSubaccountId: "subaccount-1",
    status: VerificationStatus.InReview,
    update: mock(async (values: object) => Object.assign(providerCustomer, values))
  } as unknown as ProviderCustomer;
  const kycCase = {
    customerEntityId: "entity-1",
    id: "case-1",
    provider: "avenia",
    providerCaseId: options.providerAttemptId ?? null,
    providerCustomerId: "customer-1",
    status: VerificationStatus.InReview,
    submittedAt: options.submittedAt ?? null,
    type: "kyc",
    update: mock(async (values: object) => Object.assign(kycCase, values)),
    verificationMethod: options.verificationMethod === undefined ? "standard" : options.verificationMethod,
    verificationSubmission: options.submission ?? null
  } as unknown as KycCase;
  KycCase.findAll = mock(async (query?: { attributes?: string[]; lock?: unknown }) => {
    if (query?.lock) lockOrder.push("case");
    return query?.attributes ? (options.boundAttemptIds ?? []).map(providerCaseId => ({ providerCaseId })) : [kycCase];
  }) as never;
  KycCase.findByPk = mock(async (_id: string, query?: { lock?: unknown }) => {
    if (query?.lock) lockOrder.push("case");
    return kycCase;
  }) as never;
  ProviderCustomer.findByPk = mock(async (_id: string, query?: { lock?: unknown }) => {
    if (query?.lock) lockOrder.push("customer");
    return providerCustomer;
  }) as never;
  ManagedProfileManager.findByPk = mock(async () => ({
    allowedCorridors: ["BR"],
    allowedCustomerTypes: null,
    isActive: options.managerActive ?? true
  })) as never;
  ManagedProfile.findByPk = mock(async () => ({ managerProfileId: "manager-1", profileId: "subject-1", status: "active" })) as never;
  User.findByPk = mock(async () => ({ activeCustomerEntityId: "entity-1", kind: "managed" })) as never;
  CustomerEntity.findByPk = mock(async () => ({ profileId: "subject-1", status: "active", type: "individual" })) as never;
  sequelize.transaction = mock(async callback => callback({ LOCK: { UPDATE: "UPDATE" } } as never)) as never;
  const submitKycLevel1 = mock(async () => {
    if (options.submitError) throw new Error("response lost");
    if (options.approveDuringSubmit) {
      providerCustomer.status = VerificationStatus.Approved;
      kycCase.status = VerificationStatus.Approved;
    }
    return { id: "attempt-1" };
  });
  const getKycAttempts = mock(async () => ({ attempts: options.attempts ?? [] }));
  const getVerificationAttemptStatus = mock(async (attemptId: string) => ({
    attempt: {
      createdAt: new Date().toISOString(),
      id: attemptId,
      levelName: "level-1",
      status: KycAttemptStatus.PENDING,
      updatedAt: new Date().toISOString(),
      ...options.verificationAttempt
    }
  }));
  const getUploadedDocuments = mock(async () => ({
    documents: [
      { id: payload.uploadedDocumentId, ready: true },
      { id: payload.uploadedSelfieId, ready: true }
    ]
  }));
  BrlaApiService.getInstance = mock(
    () => ({ getKycAttempts, getUploadedDocuments, getVerificationAttemptStatus, submitKycLevel1 }) as unknown as BrlaApiService
  );
  return { getKycAttempts, getVerificationAttemptStatus, kycCase, lockOrder, providerCustomer, submitKycLevel1 };
}

const request = { actorProfileId: "subject-1", payload, subjectProfileId: "subject-1" };

afterEach(() => {
  KycCase.findAll = originals.caseFindAll;
  KycCase.findByPk = originals.caseFindByPk;
  ProviderCustomer.findByPk = originals.customerFindByPk;
  CustomerEntity.findByPk = originals.entityFindByPk;
  BrlaApiService.getInstance = originals.getInstance;
  ManagedProfileManager.findByPk = originals.managerFindByPk;
  ManagedProfile.findByPk = originals.relationshipFindByPk;
  sequelize.transaction = originals.transaction;
  User.findByPk = originals.userFindByPk;
  mock.restore();
});

describe("submitStandardAveniaKyc", () => {
  it("allows a direct managed child while revalidating its controlling manager and exact relationship", async () => {
    const state = harness();
    const timeout = spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void) => {
      callback();
      return 0;
    }) as typeof setTimeout);

    expect(
      await submitStandardAveniaKyc({
        ...request,
        controllingManagerProfileId: "manager-1",
        expectedCustomerEntityId: "entity-1",
        managedProfileId: "relationship-1",
        providerCustomer: state.providerCustomer
      })
    ).toEqual({ id: "attempt-1" });
    expect(ManagedProfileManager.findByPk).toHaveBeenCalledWith("manager-1", expect.objectContaining({ lock: "UPDATE" }));
    expect(state.kycCase.verificationSubmission).toMatchObject({
      actorProfileId: "subject-1",
      status: "confirmed",
      subjectProfileId: "subject-1"
    });
    timeout.mockRestore();
  });

  it("leaves a nullable method unclaimed when managed authorization was revoked", async () => {
    const state = harness({ managerActive: false, verificationMethod: null });

    await expect(
      submitStandardAveniaKyc({
        ...request,
        actorProfileId: "manager-1",
        controllingManagerProfileId: "manager-1",
        expectedCustomerEntityId: "entity-1",
        managedProfileId: "relationship-1",
        providerCustomer: state.providerCustomer
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(state.kycCase.verificationMethod).toBeNull();
    expect(state.getKycAttempts).not.toHaveBeenCalled();
    expect(state.submitKycLevel1).not.toHaveBeenCalled();
    expect(state.lockOrder.slice(0, 2)).toEqual(["customer", "case"]);
  });

  it("commits baseline and send time before POST, then stores the exact attempt without payload data", async () => {
    const baseline = {
      createdAt: new Date().toISOString(),
      id: "baseline",
      levelName: "level-1",
      status: KycAttemptStatus.COMPLETED,
      updatedAt: new Date().toISOString()
    } as KycAttempt;
    const state = harness({ attempts: [baseline, baseline] });
    const timeout = spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void) => {
      callback();
      return 0;
    }) as typeof setTimeout);
    state.submitKycLevel1.mockImplementation(async () => {
      expect(state.kycCase.submittedAt).toBeInstanceOf(Date);
      expect(state.kycCase.verificationSubmission).toMatchObject({ attemptBaselineIds: ["baseline"], status: "submitted" });
      return { id: "attempt-1" };
    });
    expect(await submitStandardAveniaKyc({ ...request, providerCustomer: state.providerCustomer })).toEqual({ id: "attempt-1" });
    expect(state.kycCase).toMatchObject({
      providerCaseId: "attempt-1",
      verificationSubmission: { payloadFingerprint: fingerprint(payload), status: "confirmed" }
    });
    expect(JSON.stringify(state.kycCase.verificationSubmission)).not.toContain(payload.taxIdNumber);
    expect(state.lockOrder.slice(-2)).toEqual(["customer", "case"]);
    timeout.mockRestore();
  });

  it("reuses a confirmed exact attempt and retries only after an exact retryable terminal", async () => {
    const confirmed: IndividualKycSubmission = {
      actorProfileId: "subject-1",
      attemptBaselineIds: [],
      payloadFingerprint: fingerprint(payload),
      status: "confirmed",
      subjectProfileId: "subject-1"
    };
    const pending = harness({ providerAttemptId: "attempt-old", submission: confirmed });
    expect(await submitStandardAveniaKyc({ ...request, providerCustomer: pending.providerCustomer })).toEqual({ id: "attempt-old" });
    expect(pending.submitKycLevel1).not.toHaveBeenCalled();

    const retryable = harness({
      providerAttemptId: "attempt-old",
      submission: confirmed,
      verificationAttempt: { result: KycAttemptResult.REJECTED, retryable: true, status: KycAttemptStatus.COMPLETED }
    });
    const timeout = spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void) => {
      callback();
      return 0;
    }) as typeof setTimeout);
    expect(await submitStandardAveniaKyc({ ...request, providerCustomer: retryable.providerCustomer })).toEqual({ id: "attempt-1" });
    expect(retryable.submitKycLevel1).toHaveBeenCalledTimes(1);
    expect(retryable.kycCase.verificationSubmission).toMatchObject({ status: "confirmed" });
    timeout.mockRestore();
  });

  it("does not repost an ambiguous claim and excludes baseline and attempts bound to other cases", async () => {
    const submittedAt = new Date();
    const attempt = (id: string): KycAttempt => ({
      createdAt: submittedAt.toISOString(),
      id,
      levelName: "level-1",
      status: KycAttemptStatus.PENDING,
      updatedAt: submittedAt.toISOString()
    });
    const state = harness({
      attempts: [attempt("baseline"), attempt("bound"), attempt("current")],
      boundAttemptIds: ["bound"],
      submittedAt,
      submission: {
        actorProfileId: "subject-1",
        attemptBaselineIds: ["baseline"],
        payloadFingerprint: fingerprint(payload),
        status: "ambiguous",
        subjectProfileId: "subject-1"
      }
    });
    expect(await submitStandardAveniaKyc({ ...request, providerCustomer: state.providerCustomer })).toEqual({ id: "current" });
    expect(state.submitKycLevel1).not.toHaveBeenCalled();
    expect(state.kycCase).toMatchObject({ providerCaseId: "current", verificationSubmission: { status: "confirmed" } });
  });

  it("quarantines a lost POST response and never automatically reposts it", async () => {
    const state = harness({ submitError: true });
    const timeout = spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void) => {
      callback();
      return 0;
    }) as typeof setTimeout);
    await expect(submitStandardAveniaKyc({ ...request, providerCustomer: state.providerCustomer })).rejects.toMatchObject({
      status: 502
    });
    expect(state.kycCase.verificationSubmission).toMatchObject({ status: "ambiguous" });
    await expect(submitStandardAveniaKyc({ ...request, providerCustomer: state.providerCustomer })).rejects.toMatchObject({
      status: 409
    });
    expect(state.submitKycLevel1).toHaveBeenCalledTimes(1);
    timeout.mockRestore();
  });

  it("binds the exact attempt when approval wins before local confirmation", async () => {
    const state = harness({ approveDuringSubmit: true });
    const timeout = spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void) => {
      callback();
      return 0;
    }) as typeof setTimeout);

    await expect(submitStandardAveniaKyc({ ...request, providerCustomer: state.providerCustomer })).resolves.toEqual({
      id: "attempt-1"
    });
    expect(state.kycCase).toMatchObject({
      providerCaseId: "attempt-1",
      status: VerificationStatus.Approved,
      verificationSubmission: { status: "confirmed" }
    });
    timeout.mockRestore();
  });
});
