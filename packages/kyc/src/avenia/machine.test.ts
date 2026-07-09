import { KycFailureReason } from "@vortexfi/shared";
import type { BrlaGetKycStatusResponse } from "@vortexfi/shared";
import { describe, expect, it } from "bun:test";
import { createActor, fromPromise, waitFor } from "xstate";
import type { AveniaKycApi, KybLevel1Response } from "./api";
import { createAveniaKycMachine } from "./machine";
import {
  type AveniaKycContext,
  type AveniaKycFormData,
  AveniaKycMachineErrorType,
  KycStatus,
  KycSubmissionRejectedError,
  type UploadIds,
  type VerifyStatusActorOutput
} from "./types";

const aveniaKycMachine = createAveniaKycMachine({ api: {} as AveniaKycApi });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

type SubaccountOutput = {
  subAccountId: string;
  maybeKycAttemptStatus?: BrlaGetKycStatusResponse;
  isCompany: boolean;
  kybUrls?: KybLevel1Response;
};

const baseInput: AveniaKycContext = {
  externalSessionId: undefined,
  quoteId: "quote-1",
  taxId: ""
};

const formData = { taxId: "12345678900" } as AveniaKycFormData;
const uploadIds: UploadIds = {
  livenessUrl: "https://liveness.example",
  uploadedDocumentId: "doc-1",
  uploadedSelfieId: "selfie-1"
};

function createTestActor(actors: Parameters<typeof aveniaKycMachine.provide>[0]["actors"]) {
  return createActor(aveniaKycMachine.provide({ actors }), { input: baseInput });
}

function subaccountActorWith(output: SubaccountOutput) {
  return fromPromise<SubaccountOutput, AveniaKycContext>(async () => output);
}

describe("aveniaKycMachine", () => {
  it("walks the individual happy path from form filling to Finish", async () => {
    const subaccount = deferred<SubaccountOutput>();
    const submit = deferred<void>();
    const verify = deferred<VerifyStatusActorOutput>();
    const actor = createTestActor({
      createSubaccountActor: fromPromise(() => subaccount.promise),
      submitActor: fromPromise(() => submit.promise),
      verifyStatusActor: fromPromise(() => verify.promise)
    });
    actor.start();

    expect(actor.getSnapshot().value).toBe("FormFilling");

    actor.send({ formData, type: "FORM_SUBMIT" });
    expect(actor.getSnapshot().value).toBe("SubaccountSetup");
    expect(actor.getSnapshot().context.taxId).toBe("12345678900");
    expect(actor.getSnapshot().context.kycFormData).toEqual(formData);

    subaccount.resolve({ isCompany: false, subAccountId: "sub-1" });
    await waitFor(actor, s => s.matches("DocumentUpload"));
    expect(actor.getSnapshot().context.subAccountId).toBe("sub-1");
    expect(actor.getSnapshot().context.isCompany).toBe(false);

    actor.send({ documentsId: uploadIds, type: "DOCUMENTS_SUBMIT" });
    expect(actor.getSnapshot().value).toBe("LivenessCheck");
    expect(actor.getSnapshot().context.documentUploadIds).toEqual(uploadIds);

    actor.send({ type: "LIVENESS_DONE" });
    expect(actor.getSnapshot().value).toBe("LivenessCheck");

    actor.send({ type: "LIVENESS_OPENED" });
    expect(actor.getSnapshot().context.livenessCheckOpened).toBe(true);
    actor.send({ type: "LIVENESS_DONE" });
    expect(actor.getSnapshot().value).toBe("Submit");
    expect(actor.getSnapshot().context.kycStatus).toBe(KycStatus.PENDING);
    expect(actor.getSnapshot().context.livenessCheckOpened).toBe(false);

    submit.resolve(undefined);
    await waitFor(actor, s => s.matches("Verifying"));

    verify.resolve({ type: "APPROVED" });
    await waitFor(actor, s => s.matches("Success"));
    expect(actor.getSnapshot().context.kycStatus).toBe(KycStatus.APPROVED);

    actor.send({ type: "CLOSE_SUCCESS_MODAL" });
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("Finish");
    expect(snapshot.status).toBe("done");
    expect(snapshot.output?.kycStatus).toBe(KycStatus.APPROVED);
    expect(snapshot.output?.error).toBeUndefined();
  });

  it("routes companies with KYB URLs into the KYB flow and through its steps", async () => {
    const actor = createTestActor({
      createSubaccountActor: subaccountActorWith({
        isCompany: true,
        kybUrls: {
          attemptId: "attempt-1",
          authorizedRepresentativeUrl: "https://rep.example",
          basicCompanyDataUrl: "https://company.example"
        },
        subAccountId: "sub-2"
      })
    });
    actor.start();
    actor.send({ formData: { taxId: "12345678000199" } as AveniaKycFormData, type: "FORM_SUBMIT" });

    await waitFor(actor, s => s.matches({ KYBFlow: "CompanyVerification" }));
    let context = actor.getSnapshot().context;
    expect(context.kybStep).toBe("company");
    expect(context.kybAttemptId).toBe("attempt-1");
    expect(context.kybUrls).toEqual({
      authorizedRepresentativeUrl: "https://rep.example",
      basicCompanyDataUrl: "https://company.example"
    });

    actor.send({ type: "COMPANY_VERIFICATION_STARTED" });
    expect(actor.getSnapshot().context.companyVerificationStarted).toBe(true);

    actor.send({ type: "KYB_COMPANY_DONE" });
    expect(actor.getSnapshot().value).toEqual({ KYBFlow: "RepresentativeVerification" });
    expect(actor.getSnapshot().context.kybStep).toBe("representative");

    actor.send({ type: "KYB_COMPANY_BACK" });
    expect(actor.getSnapshot().value).toEqual({ KYBFlow: "CompanyVerification" });
    actor.send({ type: "KYB_COMPANY_DONE" });

    actor.send({ type: "REPRESENTATIVE_VERIFICATION_STARTED" });
    expect(actor.getSnapshot().context.representativeVerificationStarted).toBe(true);

    actor.send({ type: "KYB_REPRESENTATIVE_DONE" });
    context = actor.getSnapshot().context;
    expect(actor.getSnapshot().value).toEqual({ KYBFlow: "StatusVerification" });
    expect(context.kybStep).toBe("verification");
    expect(context.kycStatus).toBe(KycStatus.PENDING);

    actor.send({ type: "KYB_COMPLETE" });
    expect(actor.getSnapshot().value).toBe("Success");
  });

  it("resumes into Verifying when a KYC attempt is already in progress", async () => {
    const actor = createTestActor({
      createSubaccountActor: subaccountActorWith({
        isCompany: false,
        maybeKycAttemptStatus: { status: "PROCESSING" } as unknown as BrlaGetKycStatusResponse,
        subAccountId: "sub-3"
      }),
      verifyStatusActor: fromPromise(() => new Promise<VerifyStatusActorOutput>(() => {}))
    });
    actor.start();
    actor.send({ formData, type: "FORM_SUBMIT" });

    await waitFor(actor, s => s.matches("Verifying"));
    expect(actor.getSnapshot().context.kycStatus).toBe(KycStatus.PENDING);
  });

  it("creates an individual subaccount without a quote for authenticated dashboard onboarding", async () => {
    const api = {
      createSubaccount: async () => ({ subAccountId: "sub-dashboard" }),
      getUser: async () => {
        throw new Error("not found");
      }
    } as unknown as AveniaKycApi;
    const actor = createActor(createAveniaKycMachine({ api }), { input: { taxId: "" } });
    const originalLog = console.log;
    console.log = () => {};

    try {
      actor.start();
      actor.send({ formData: { ...formData, fullName: "Dashboard User" }, type: "FORM_SUBMIT" });

      await waitFor(actor, s => s.matches("DocumentUpload"));
      expect(actor.getSnapshot().context.subAccountId).toBe("sub-dashboard");
    } finally {
      console.log = originalLog;
      actor.stop();
    }
  });

  it("subaccount creation failure lands in Failure and RETRY returns to the form", async () => {
    const actor = createTestActor({
      createSubaccountActor: fromPromise<SubaccountOutput, AveniaKycContext>(async () => {
        throw new Error("subaccount failed");
      })
    });
    actor.start();
    actor.send({ formData, type: "FORM_SUBMIT" });

    await waitFor(actor, s => s.matches("Failure"));
    expect(actor.getSnapshot().context.error?.type).toBe(AveniaKycMachineErrorType.UnknownError);
    expect(actor.getSnapshot().context.error?.message).toBe("subaccount failed");

    actor.send({ type: "RETRY" });
    expect(actor.getSnapshot().value).toBe("FormFilling");
  });

  it("cancelling from Failure finishes with a UserCancelled error output", async () => {
    const actor = createTestActor({
      createSubaccountActor: fromPromise<SubaccountOutput, AveniaKycContext>(async () => {
        throw new Error("subaccount failed");
      })
    });
    actor.start();
    actor.send({ formData, type: "FORM_SUBMIT" });
    await waitFor(actor, s => s.matches("Failure"));

    actor.send({ type: "CANCEL_RETRY" });
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("Finish");
    expect(snapshot.status).toBe("done");
    expect(snapshot.output?.error?.type).toBe(AveniaKycMachineErrorType.UserCancelled);
  });

  it("a rejected submission moves to Rejected with the reject reason", async () => {
    const actor = createTestActor({
      createSubaccountActor: subaccountActorWith({ isCompany: false, subAccountId: "sub-1" }),
      submitActor: fromPromise<void, AveniaKycContext>(async () => {
        throw new KycSubmissionRejectedError("document unreadable");
      })
    });
    actor.start();
    actor.send({ formData, type: "FORM_SUBMIT" });
    await waitFor(actor, s => s.matches("DocumentUpload"));
    actor.send({ documentsId: uploadIds, type: "DOCUMENTS_SUBMIT" });
    actor.send({ type: "LIVENESS_OPENED" });
    actor.send({ type: "LIVENESS_DONE" });

    await waitFor(actor, s => s.matches("Rejected"));
    expect(actor.getSnapshot().context.kycStatus).toBe(KycStatus.REJECTED);
    expect(actor.getSnapshot().context.rejectReason).toBe("document unreadable");

    actor.send({ type: "RETRY" });
    expect(actor.getSnapshot().value).toBe("FormFilling");
  });

  it("a generic submission error moves to Failure", async () => {
    const actor = createTestActor({
      createSubaccountActor: subaccountActorWith({ isCompany: false, subAccountId: "sub-1" }),
      submitActor: fromPromise<void, AveniaKycContext>(async () => {
        throw new Error("network error");
      })
    });
    actor.start();
    actor.send({ formData, type: "FORM_SUBMIT" });
    await waitFor(actor, s => s.matches("DocumentUpload"));
    actor.send({ documentsId: uploadIds, type: "DOCUMENTS_SUBMIT" });
    actor.send({ type: "LIVENESS_OPENED" });
    actor.send({ type: "LIVENESS_DONE" });

    await waitFor(actor, s => s.matches("Failure"));
    expect(actor.getSnapshot().context.error?.message).toBe("network error");
  });

  it("a rejected verification result moves to Rejected with the failure reason", async () => {
    const actor = createTestActor({
      createSubaccountActor: subaccountActorWith({ isCompany: false, subAccountId: "sub-1" }),
      submitActor: fromPromise<void, AveniaKycContext>(async () => undefined),
      verifyStatusActor: fromPromise(async (): Promise<VerifyStatusActorOutput> => {
        return { reason: KycFailureReason.FACE, type: "REJECTED" };
      })
    });
    actor.start();
    actor.send({ formData, type: "FORM_SUBMIT" });
    await waitFor(actor, s => s.matches("DocumentUpload"));
    actor.send({ documentsId: uploadIds, type: "DOCUMENTS_SUBMIT" });
    actor.send({ type: "LIVENESS_OPENED" });
    actor.send({ type: "LIVENESS_DONE" });

    await waitFor(actor, s => s.matches("Rejected"));
    expect(actor.getSnapshot().context.kycStatus).toBe(KycStatus.REJECTED);
    expect(actor.getSnapshot().context.rejectReason).toBe(KycFailureReason.FACE);
  });

  it("a verification polling error moves to Failure", async () => {
    const actor = createTestActor({
      createSubaccountActor: subaccountActorWith({ isCompany: false, subAccountId: "sub-1" }),
      submitActor: fromPromise<void, AveniaKycContext>(async () => undefined),
      verifyStatusActor: fromPromise(async (): Promise<VerifyStatusActorOutput> => {
        throw new Error("Failed to fetch KYC status after 10 attempts.");
      })
    });
    actor.start();
    actor.send({ formData, type: "FORM_SUBMIT" });
    await waitFor(actor, s => s.matches("DocumentUpload"));
    actor.send({ documentsId: uploadIds, type: "DOCUMENTS_SUBMIT" });
    actor.send({ type: "LIVENESS_OPENED" });
    actor.send({ type: "LIVENESS_DONE" });

    await waitFor(actor, s => s.matches("Failure"));
    expect(actor.getSnapshot().context.error?.message).toBe("Failed to fetch KYC status after 10 attempts.");
  });

  it("refreshes the liveness URL and merges it into the stored upload ids", async () => {
    const refresh = deferred<{ livenessUrl: string; uploadedSelfieId: string }>();
    const actor = createTestActor({
      createSubaccountActor: subaccountActorWith({ isCompany: false, subAccountId: "sub-1" }),
      refreshLivenessUrlActor: fromPromise(() => refresh.promise)
    });
    actor.start();
    actor.send({ formData, type: "FORM_SUBMIT" });
    await waitFor(actor, s => s.matches("DocumentUpload"));
    actor.send({ documentsId: uploadIds, type: "DOCUMENTS_SUBMIT" });

    actor.send({ type: "REFRESH_LIVENESS_URL" });
    expect(actor.getSnapshot().value).toBe("RefreshingLivenessUrl");

    refresh.resolve({ livenessUrl: "https://liveness.example/new", uploadedSelfieId: "selfie-2" });
    await waitFor(actor, s => s.matches("LivenessCheck"));
    expect(actor.getSnapshot().context.documentUploadIds).toEqual({
      livenessUrl: "https://liveness.example/new",
      uploadedDocumentId: "doc-1",
      uploadedSelfieId: "selfie-2"
    });
  });

  it("returns to LivenessCheck unchanged when refreshing the liveness URL fails", async () => {
    const actor = createTestActor({
      createSubaccountActor: subaccountActorWith({ isCompany: false, subAccountId: "sub-1" }),
      refreshLivenessUrlActor: fromPromise(async (): Promise<{ livenessUrl: string; uploadedSelfieId: string }> => {
        throw new Error("refresh failed");
      })
    });
    actor.start();
    actor.send({ formData, type: "FORM_SUBMIT" });
    await waitFor(actor, s => s.matches("DocumentUpload"));
    actor.send({ documentsId: uploadIds, type: "DOCUMENTS_SUBMIT" });

    actor.send({ type: "REFRESH_LIVENESS_URL" });
    await waitFor(actor, s => s.matches("LivenessCheck"));
    expect(actor.getSnapshot().context.documentUploadIds).toEqual(uploadIds);
  });

  it("GO_BACK from the initial FormFilling state moves to DocumentUpload", () => {
    const actor = createTestActor({});
    actor.start();

    actor.send({ type: "GO_BACK" });
    expect(actor.getSnapshot().value).toBe("DocumentUpload");
  });
});
