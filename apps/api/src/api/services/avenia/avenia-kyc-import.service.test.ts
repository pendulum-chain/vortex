import { BrlaApiError, BrlaApiService } from "@vortexfi/shared";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";
import sequelize from "../../../config/database";
import CustomerEntity from "../../../models/customerEntity.model";
import KycCase from "../../../models/kycCase.model";
import ManagedProfile from "../../../models/managedProfile.model";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import User from "../../../models/user.model";
import {
  claimStandardAveniaKycMethod,
  importBrKycToken,
  mapAveniaKycAttemptStatus,
  reconcileAveniaIndividualKycStatusMethod
} from "./avenia-kyc-import.service";

const originals = {
  caseFindAll: KycCase.findAll,
  caseFindByPk: KycCase.findByPk,
  customerFindAll: ProviderCustomer.findAll,
  customerFindByPk: ProviderCustomer.findByPk,
  entityFindByPk: CustomerEntity.findByPk,
  entityFindOne: CustomerEntity.findOne,
  getInstance: BrlaApiService.getInstance,
  managerFindByPk: ManagedProfileManager.findByPk,
  relationshipFindByPk: ManagedProfile.findByPk,
  transaction: sequelize.transaction,
  userFindByPk: User.findByPk
};

interface HarnessOptions {
  approveDuringImport?: boolean;
  attempts?: Array<{ createdAt: string; id: string; levelName: string }>;
  baseline?: Array<{ createdAt: string; id: string; levelName: string }>;
  boundAttemptIds?: string[];
  importToken?: () => Promise<{ id: string; message: string }>;
  verificationMethod?: KycCase["verificationMethod"];
}

function harness(options: HarnessOptions = {}) {
  const lockOrder: string[] = [];
  const providerCustomer = {
    customerEntityId: "entity-1",
    customerType: "individual",
    id: "provider-1",
    provider: "avenia",
    providerSubaccountId: "subaccount-1",
    status: VerificationStatus.InReview,
    update: mock(async (values: object) => Object.assign(providerCustomer, values))
  } as unknown as ProviderCustomer;
  const kycCase = {
    customerEntityId: "entity-1",
    id: "case-1",
    provider: "avenia",
    providerCaseId: null,
    providerCustomerId: "provider-1",
    status: VerificationStatus.InReview,
    submittedAt: null,
    type: "kyc",
    update: mock(async (values: object) => Object.assign(kycCase, values)),
    verificationMethod: options.verificationMethod ?? null,
    verificationSubmission: null
  } as unknown as KycCase;
  let attemptCalls = 0;
  const providerImport = mock(async () => {
    const result = await (options.importToken ?? (async () => ({ id: "attempt-1", message: "processing" })))();
    if (options.approveDuringImport) {
      providerCustomer.status = VerificationStatus.Approved;
      kycCase.status = VerificationStatus.Approved;
    }
    return result;
  });
  const getKycAttempts = mock(async () => {
    attemptCalls += 1;
    return { attempts: attemptCalls === 1 ? (options.baseline ?? []) : (options.attempts ?? []) };
  });
  const getUploadedDocuments = mock(async () => ({ documents: [] }));
  BrlaApiService.getInstance = mock(
    () => ({ getKycAttempts, getUploadedDocuments, importKycToken: providerImport }) as unknown as BrlaApiService
  );
  User.findByPk = mock(async () => ({ activeCustomerEntityId: "entity-1", kind: "authenticated" })) as never;
  CustomerEntity.findOne = mock(async () => ({ id: "entity-1", profileId: "subject-1", status: "active", type: "individual" })) as never;
  CustomerEntity.findByPk = mock(async () => ({ id: "entity-1", profileId: "subject-1", status: "active", type: "individual" })) as never;
  ProviderCustomer.findAll = mock(async () => [providerCustomer]) as never;
  ProviderCustomer.findByPk = mock(async (_id: string, query?: { lock?: unknown }) => {
    if (query?.lock) lockOrder.push("customer");
    return providerCustomer;
  }) as never;
  KycCase.findAll = mock(async (query?: { attributes?: string[] }) =>
    query?.attributes ? (options.boundAttemptIds ?? []).map(providerCaseId => ({ providerCaseId })) : [kycCase]
  ) as never;
  KycCase.findByPk = mock(async (_id: string, query?: { lock?: unknown }) => {
    if (query?.lock) lockOrder.push("case");
    return kycCase;
  }) as never;
  ManagedProfileManager.findByPk = mock(async () => ({
    allowedCorridors: ["BR"],
    allowedCustomerTypes: null,
    isActive: true
  })) as never;
  ManagedProfile.findByPk = mock(async () => ({
    managerProfileId: "manager-1",
    profileId: "subject-1",
    status: "active"
  })) as never;
  sequelize.transaction = mock(async callback => callback({ LOCK: { UPDATE: "UPDATE" } } as never)) as never;
  return { getKycAttempts, getUploadedDocuments, kycCase, lockOrder, providerCustomer, providerImport };
}

const request = {
  actorProfileId: "subject-1",
  idempotencyKey: "request-key-1",
  importToken: "secret-share-token",
  subjectProfileId: "subject-1"
};

afterEach(() => {
  KycCase.findAll = originals.caseFindAll;
  KycCase.findByPk = originals.caseFindByPk;
  ProviderCustomer.findAll = originals.customerFindAll;
  ProviderCustomer.findByPk = originals.customerFindByPk;
  CustomerEntity.findByPk = originals.entityFindByPk;
  CustomerEntity.findOne = originals.entityFindOne;
  BrlaApiService.getInstance = originals.getInstance;
  ManagedProfileManager.findByPk = originals.managerFindByPk;
  ManagedProfile.findByPk = originals.relationshipFindByPk;
  sequelize.transaction = originals.transaction;
  User.findByPk = originals.userFindByPk;
});

describe("importBrKycToken", () => {
  it("stores only fingerprints, binds the exact attempt, and replays only the same confirmed key", async () => {
    const state = harness();
    expect(await importBrKycToken(request)).toEqual({ attemptId: "attempt-1", status: "pending" });
    expect(await importBrKycToken(request)).toEqual({ attemptId: "attempt-1", status: "pending" });
    expect(state.providerImport).toHaveBeenCalledTimes(1);
    expect(state.kycCase).toMatchObject({
      providerCaseId: "attempt-1",
      submittedAt: expect.any(Date),
      verificationMethod: "sumsub_share_token",
      verificationSubmission: {
        attemptBaselineIds: [],
        consentAttestations: [
          {
            actorProfileId: "subject-1",
            attestedAt: expect.any(String),
            policyVersion: "sumsub-share-v1",
            subjectProfileId: "subject-1"
          }
        ],
        status: "confirmed",
        tokenFingerprint: createHash("sha256").update(request.importToken, "utf8").digest("hex")
      }
    });
    expect(JSON.stringify(state.kycCase.verificationSubmission)).not.toContain(request.importToken);
    expect(state.lockOrder.slice(-2)).toEqual(["customer", "case"]);
    await expect(importBrKycToken({ ...request, idempotencyKey: "another-key" })).rejects.toMatchObject({ status: 409 });
    await expect(importBrKycToken({ ...request, importToken: "changed-token" })).rejects.toMatchObject({ status: 409 });
  });

  it("never reposts an ambiguous claim and reconciles only a unique nonbaseline, unbound attempt", async () => {
    const now = new Date().toISOString();
    const state = harness({
      attempts: [
        { createdAt: now, id: "baseline", levelName: "sumsub-token-old" },
        { createdAt: now, id: "bound", levelName: "sumsub-token-other" },
        { createdAt: now, id: "reconciled", levelName: "sumsub-token-current" }
      ],
      baseline: [{ createdAt: now, id: "baseline", levelName: "sumsub-token-old" }],
      boundAttemptIds: ["bound"],
      importToken: async () => {
        throw new Error("timeout");
      }
    });
    await expect(importBrKycToken(request)).rejects.toMatchObject({ status: 502 });
    expect(state.kycCase.verificationSubmission).toMatchObject({ attemptBaselineIds: ["baseline"], status: "ambiguous" });
    expect(await importBrKycToken(request)).toEqual({ attemptId: "reconciled", status: "pending" });
    expect(state.providerImport).toHaveBeenCalledTimes(1);
  });

  it("treats only 401 as failed and requires a new key before another POST", async () => {
    let calls = 0;
    const state = harness({
      importToken: async () => {
        calls += 1;
        if (calls === 1) {
          throw new BrlaApiError({ endpoint: "/import", method: "POST", responseBody: "omitted", status: 401 });
        }
        return { id: "attempt-2", message: "processing" };
      }
    });
    await expect(importBrKycToken(request)).rejects.toMatchObject({ status: 412 });
    await expect(importBrKycToken(request)).rejects.toMatchObject({ status: 409 });
    expect(await importBrKycToken({ ...request, idempotencyKey: "request-key-2" })).toEqual({
      attemptId: "attempt-2",
      status: "pending"
    });
    expect(state.providerImport).toHaveBeenCalledTimes(2);
    expect(state.kycCase.verificationSubmission).toMatchObject({
      consentAttestations: [
        { actorProfileId: "subject-1", policyVersion: "sumsub-share-v1", subjectProfileId: "subject-1" },
        { actorProfileId: "subject-1", policyVersion: "sumsub-share-v1", subjectProfileId: "subject-1" }
      ],
      status: "confirmed"
    });
    expect(JSON.stringify(state.kycCase.verificationSubmission)).not.toContain(request.importToken);
    expect(state.kycCase.verificationSubmission).not.toHaveProperty("consentPolicyVersion");
    expect(state.kycCase.verificationSubmission).not.toHaveProperty("consentAttestedAt");
  });

  it("serializes method selection on the case without provider-history classification", async () => {
    const state = harness();
    await expect(claimStandardAveniaKycMethod(state.providerCustomer)).resolves.toBe(state.kycCase);
    expect(state.kycCase.verificationMethod).toBe("standard");
    expect(state.getKycAttempts).not.toHaveBeenCalled();
    expect(state.getUploadedDocuments).not.toHaveBeenCalled();
    await expect(importBrKycToken(request)).rejects.toMatchObject({ status: 409 });
  });

  it("makes the runtime status helper default a locked null case to standard without provider reads", async () => {
    const state = harness();
    const result = await reconcileAveniaIndividualKycStatusMethod(state.providerCustomer.id);
    expect(result.kycCase.verificationMethod).toBe("standard");
    expect(state.getKycAttempts).not.toHaveBeenCalled();
    expect(state.getUploadedDocuments).not.toHaveBeenCalled();
  });

  it("binds the imported attempt without downgrading approval", async () => {
    const state = harness({ approveDuringImport: true });

    await expect(importBrKycToken(request)).resolves.toEqual({ attemptId: "attempt-1", status: "pending" });
    expect(state.kycCase).toMatchObject({
      providerCaseId: "attempt-1",
      status: VerificationStatus.Approved,
      verificationSubmission: { status: "confirmed" }
    });
  });
});

it("keeps expired imported attempts pending", () => {
  expect(mapAveniaKycAttemptStatus({ status: "EXPIRED" as never })).toBe(VerificationStatus.Pending);
});
