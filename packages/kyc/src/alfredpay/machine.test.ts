import { beforeEach, describe, expect, it } from "bun:test";
import {
  AlfredPayStatus,
  type AlfredpayCreateCustomerResponse,
  type AlfredpayGetKycRedirectLinkResponse,
  type AlfredpayGetKycStatusResponse,
  type AlfredpayKybCustomerAndBusiness,
  type AlfredpayStatusResponse,
  type SubmitKybInformationResponse,
  type SubmitKycInformationResponse
} from "@vortexfi/shared";
import { createActor, fromPromise, waitFor } from "xstate";
import type { AlfredpayKycApi } from "./api";
import { createAlfredpayKycMachine } from "./machine";
import {
  type AlfredpayKycContext,
  type AlfredpayKycFormData,
  AlfredpayKycMachineErrorType,
  type KybBusinessFiles,
  type KybFormData,
  type MxnKycFiles
} from "./types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

// Every test replaces the actors it exercises, so the API is never reached — which is the point of
// the injection seam: the machine can be driven with no HTTP client and no DOM in scope.
let openedUrls: string[] = [];
const alfredpayKycMachine = createAlfredpayKycMachine({
  api: {} as AlfredpayKycApi,
  openVerificationUrl: url => openedUrls.push(url)
});

const notifyActor = () => fromPromise<{ success: boolean }, AlfredpayKycContext>(async () => ({ success: true }));

const statusOf = (status: AlfredPayStatus) => ({ status }) as AlfredpayStatusResponse;
const kycStatusOf = (status: AlfredPayStatus, lastFailure?: string) =>
  ({ lastFailure, status }) as AlfredpayGetKycStatusResponse;

const baseInput: AlfredpayKycContext = { country: "US" };

const kycLink: AlfredpayGetKycRedirectLinkResponse = {
  submissionId: "link-sub-1",
  verification_url: "https://verify.alfred.example"
};

const mxnFormData = { firstName: "Frida" } as unknown as AlfredpayKycFormData;
const mxnFiles = { back: {} as File, front: {} as File } as MxnKycFiles;
const kybFormData = { businessName: "ACME" } as unknown as KybFormData;
const kybBusinessFiles = {
  articlesIncorporation: {} as File,
  docBack: {} as File,
  docFront: {} as File,
  proofAddress: {} as File,
  taxIdDocument: {} as File
} as KybBusinessFiles;

function createTestActor(
  actors: Parameters<typeof alfredpayKycMachine.provide>[0]["actors"],
  input: AlfredpayKycContext = baseInput
) {
  return createActor(alfredpayKycMachine.provide({ actors }), { input });
}

beforeEach(() => {
  openedUrls = [];
});

describe("alfredpayKycMachine", () => {
  describe("CheckingStatus routing", () => {
    it("finishes immediately when the status is already Success", async () => {
      const actor = createTestActor({
        checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Success))
      });
      actor.start();

      await waitFor(actor, s => s.status === "done");
      expect(actor.getSnapshot().value).toBe("Done");
      expect(actor.getSnapshot().output?.error).toBeUndefined();
    });

    it("polls a Verifying status through to VerificationDone and Done", async () => {
      const poll = deferred<AlfredpayGetKycStatusResponse>();
      const actor = createTestActor({
        checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Verifying)),
        pollStatus: fromPromise(() => poll.promise)
      });
      actor.start();

      await waitFor(actor, s => s.matches("PollingStatus"));

      poll.resolve(kycStatusOf(AlfredPayStatus.Success));
      await waitFor(actor, s => s.matches("VerificationDone"));

      actor.send({ type: "CONFIRM_SUCCESS" });
      expect(actor.getSnapshot().value).toBe("Done");
      expect(actor.getSnapshot().status).toBe("done");
    });

    it("a Failed status lands in FailureKyc and USER_CANCEL finishes with the error", async () => {
      const actor = createTestActor({
        checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Failed))
      });
      actor.start();

      await waitFor(actor, s => s.matches("FailureKyc"));
      expect(actor.getSnapshot().context.error?.message).toBe("KYC Failed");
      expect(actor.getSnapshot().context.error?.type).toBe(AlfredpayKycMachineErrorType.UnknownError);

      actor.send({ type: "USER_CANCEL" });
      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe("Done");
      expect(snapshot.output?.error?.message).toBe("KYC Failed");
    });

    it("USER_RETRY from FailureKyc retries and returns to the link flow for iFrame countries", async () => {
      const actor = createTestActor({
        checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Failed)),
        getKycLink: fromPromise(() => new Promise<AlfredpayGetKycRedirectLinkResponse>(() => {})),
        retryKyc: fromPromise(async () => kycLink)
      });
      actor.start();
      await waitFor(actor, s => s.matches("FailureKyc"));

      actor.send({ type: "USER_RETRY" });
      expect(actor.getSnapshot().value).toBe("Retrying");
      await waitFor(actor, s => s.matches("GettingKycLink"));
    });

    it("a 404 (no customer) routes to CustomerDefinition where the customer type can be toggled", async () => {
      const actor = createTestActor({
        checkStatus: fromPromise<AlfredpayStatusResponse, AlfredpayKycContext>(async () => {
          throw new Error("Request failed with status 404");
        }),
        createCustomer: fromPromise(async () => ({}) as AlfredpayCreateCustomerResponse),
        getKycLink: fromPromise(() => new Promise<AlfredpayGetKycRedirectLinkResponse>(() => {}))
      });
      actor.start();

      await waitFor(actor, s => s.matches("CustomerDefinition"));

      actor.send({ type: "TOGGLE_BUSINESS" });
      expect(actor.getSnapshot().context.business).toBe(true);
      actor.send({ type: "TOGGLE_BUSINESS" });
      expect(actor.getSnapshot().context.business).toBe(false);

      actor.send({ type: "USER_ACCEPT" });
      expect(actor.getSnapshot().value).toBe("CreatingCustomer");
      // Country US is an iFrame country, so a fresh customer goes to the redirect-link flow.
      await waitFor(actor, s => s.matches("GettingKycLink"));
    });

    it("a non-404 status check error lands in Failure and RETRY_PROCESS re-runs the check", async () => {
      let calls = 0;
      const actor = createTestActor({
        checkStatus: fromPromise<AlfredpayStatusResponse, AlfredpayKycContext>(() => {
          calls += 1;
          if (calls === 1) return Promise.reject(new Error("service unavailable"));
          return new Promise(() => {});
        })
      });
      actor.start();

      await waitFor(actor, s => s.matches("Failure"));
      expect(actor.getSnapshot().context.error?.message).toBe("service unavailable");

      actor.send({ type: "RETRY_PROCESS" });
      expect(actor.getSnapshot().value).toBe("CheckingStatus");
      expect(calls).toBe(2);
    });

    it("CANCEL_PROCESS from Failure finishes the machine with the error in the output", async () => {
      const actor = createTestActor({
        checkStatus: fromPromise<AlfredpayStatusResponse, AlfredpayKycContext>(async () => {
          throw new Error("service unavailable");
        })
      });
      actor.start();
      await waitFor(actor, s => s.matches("Failure"));

      actor.send({ type: "CANCEL_PROCESS" });
      expect(actor.getSnapshot().value).toBe("Done");
      expect(actor.getSnapshot().output?.error?.message).toBe("service unavailable");
    });
  });

  describe("iFrame link flow (US)", () => {
    it("gets a link, opens it, and reports a failed verification with the lastFailure message", async () => {
      const poll = deferred<AlfredpayGetKycStatusResponse>();
      const actor = createTestActor({
        checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Consulted)),
        getKycLink: fromPromise(async () => kycLink),
        notifyFinished: notifyActor(),
        notifyOpened: notifyActor(),
        pollStatus: fromPromise(() => poll.promise),
        waitForValidation: fromPromise(() => new Promise<AlfredpayGetKycStatusResponse>(() => {}))
      });
      actor.start();

      await waitFor(actor, s => s.matches("LinkReady"));
      expect(actor.getSnapshot().context.submissionId).toBe("link-sub-1");
      expect(actor.getSnapshot().context.verificationUrl).toBe("https://verify.alfred.example");

      actor.send({ type: "OPEN_LINK" });
      expect(openedUrls).toEqual(["https://verify.alfred.example"]);

      await waitFor(actor, s => s.matches("FillingKyc"));

      actor.send({ type: "COMPLETED_FILLING" });
      expect(actor.getSnapshot().value).toBe("FinishingFilling");
      await waitFor(actor, s => s.matches("PollingStatus"));

      poll.resolve(kycStatusOf(AlfredPayStatus.Failed, "Document expired"));
      await waitFor(actor, s => s.matches("FailureKyc"));
      expect(actor.getSnapshot().context.error?.message).toBe("Document expired");
    });

    it("background validation completing moves FillingKyc to PollingStatus without user action", async () => {
      const validation = deferred<AlfredpayGetKycStatusResponse>();
      const actor = createTestActor({
        checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Consulted)),
        getKycLink: fromPromise(async () => kycLink),
        notifyOpened: notifyActor(),
        pollStatus: fromPromise(() => new Promise<AlfredpayGetKycStatusResponse>(() => {})),
        waitForValidation: fromPromise(() => validation.promise)
      });
      actor.start();

      await waitFor(actor, s => s.matches("LinkReady"));
      actor.send({ type: "OPEN_LINK" });
      await waitFor(actor, s => s.matches("FillingKyc"));

      validation.resolve(kycStatusOf(AlfredPayStatus.Verifying));
      await waitFor(actor, s => s.matches("PollingStatus"));
    });

    it("re-opens the verification link from FillingKyc without leaving the state", async () => {
      const actor = createTestActor({
        checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Consulted)),
        getKycLink: fromPromise(async () => kycLink),
        notifyOpened: notifyActor(),
        waitForValidation: fromPromise(() => new Promise<AlfredpayGetKycStatusResponse>(() => {}))
      });
      actor.start();

      await waitFor(actor, s => s.matches("LinkReady"));
      actor.send({ type: "OPEN_LINK" });
      await waitFor(actor, s => s.matches("FillingKyc"));

      actor.send({ type: "OPEN_LINK" });
      expect(actor.getSnapshot().value).toBe("FillingKyc");
      expect(openedUrls).toEqual(["https://verify.alfred.example", "https://verify.alfred.example"]);
    });

    it("moves to Failure when fetching the KYC link fails", async () => {
      const actor = createTestActor({
        checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Consulted)),
        getKycLink: fromPromise<AlfredpayGetKycRedirectLinkResponse, AlfredpayKycContext>(async () => {
          throw new Error("link service down");
        })
      });
      actor.start();

      await waitFor(actor, s => s.matches("Failure"));
      expect(actor.getSnapshot().context.error?.message).toBe("Failed to get KYC link");
    });
  });

  describe("API-based KYC form flow (MX)", () => {
    const mxInput: AlfredpayKycContext = { ...baseInput, country: "MX" };

    it("submits the form, uploads documents, and sends the submission through to polling", async () => {
      const poll = deferred<AlfredpayGetKycStatusResponse>();
      const actor = createTestActor(
        {
          checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Consulted)),
          pollStatus: fromPromise(() => poll.promise),
          sendSubmission: fromPromise<void, AlfredpayKycContext>(async () => undefined),
          submitFiles: fromPromise<void, AlfredpayKycContext>(async () => undefined),
          submitKycInfo: fromPromise(async () => ({ submissionId: "kyc-sub-9" }) as SubmitKycInformationResponse)
        },
        mxInput
      );
      actor.start();

      await waitFor(actor, s => s.matches("FillingKycForm"));

      actor.send({ data: mxnFormData, type: "SUBMIT_FORM" });
      expect(actor.getSnapshot().value).toBe("SubmittingKycInfo");
      expect(actor.getSnapshot().context.mxnFormData).toEqual(mxnFormData);

      await waitFor(actor, s => s.matches("UploadingDocuments"));
      expect(actor.getSnapshot().context.submissionId).toBe("kyc-sub-9");

      actor.send({ files: mxnFiles, type: "SUBMIT_FILES" });
      expect(actor.getSnapshot().value).toBe("SubmittingFiles");
      expect(actor.getSnapshot().context.mxnFiles).toBe(mxnFiles);

      await waitFor(actor, s => s.matches("PollingStatus"));

      poll.resolve(kycStatusOf(AlfredPayStatus.Success));
      await waitFor(actor, s => s.matches("VerificationDone"));
    });

    it("skips re-submitting KYC info when a submissionId already exists", async () => {
      const actor = createTestActor(
        {
          checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Consulted))
        },
        { ...mxInput, submissionId: "existing-sub" }
      );
      actor.start();

      await waitFor(actor, s => s.matches("FillingKycForm"));
      actor.send({ data: mxnFormData, type: "SUBMIT_FORM" });
      expect(actor.getSnapshot().value).toBe("UploadingDocuments");
    });

    it("a failed document upload returns to UploadingDocuments with the error", async () => {
      const actor = createTestActor(
        {
          checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Consulted)),
          submitFiles: fromPromise<void, AlfredpayKycContext>(async () => {
            throw new Error("upload failed");
          }),
          submitKycInfo: fromPromise(async () => ({ submissionId: "kyc-sub-9" }) as SubmitKycInformationResponse)
        },
        mxInput
      );
      actor.start();

      await waitFor(actor, s => s.matches("FillingKycForm"));
      actor.send({ data: mxnFormData, type: "SUBMIT_FORM" });
      await waitFor(actor, s => s.matches("UploadingDocuments"));

      actor.send({ files: mxnFiles, type: "SUBMIT_FILES" });
      await waitFor(actor, s => s.matches("UploadingDocuments") && s.context.error !== undefined);
      expect(actor.getSnapshot().context.error?.message).toBe("upload failed");
    });
  });

  describe("KYB flow (MX business)", () => {
    const kybInput: AlfredpayKycContext = { ...baseInput, business: true, country: "MX" };

    it("submits KYB info, uploads documents, and sends the submission through to polling", async () => {
      const actor = createTestActor(
        {
          checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Consulted)),
          findKybCustomerAndBusiness: fromPromise(
            async () => [{ relatedPersons: [{ idRelatedPerson: "rp-1" }] }] as unknown as AlfredpayKybCustomerAndBusiness[]
          ),
          pollStatus: fromPromise(() => new Promise<AlfredpayGetKycStatusResponse>(() => {})),
          sendKybSubmissionActor: fromPromise<void, AlfredpayKycContext>(async () => undefined),
          submitKybBusinessFiles: fromPromise<void, AlfredpayKycContext>(async () => undefined),
          submitKybInfo: fromPromise(async () => ({ submissionId: "kyb-sub-1" }) as SubmitKybInformationResponse),
          submitKybRelatedPersonBundleFiles: fromPromise<void, AlfredpayKycContext>(async () => undefined)
        },
        kybInput
      );
      actor.start();

      await waitFor(actor, s => s.matches("FillingKybForm"));

      actor.send({ data: kybFormData, type: "SUBMIT_KYB_FORM" });
      expect(actor.getSnapshot().value).toBe("SubmittingKybInfo");
      expect(actor.getSnapshot().context.kybFormData).toEqual(kybFormData);

      await waitFor(actor, s => s.matches("UploadingKybBusinessDocs"));
      expect(actor.getSnapshot().context.submissionId).toBe("kyb-sub-1");

      actor.send({ files: kybBusinessFiles, type: "SUBMIT_KYB_BUSINESS_FILES" });
      await waitFor(actor, s => s.matches("PollingStatus"));
      expect(actor.getSnapshot().context.kybRelatedPersonIds).toEqual(["rp-1"]);
    });

    it("fails when the KYB submission response has no submission id", async () => {
      const actor = createTestActor(
        {
          checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Consulted)),
          submitKybInfo: fromPromise(async () => ({ submissionId: "" }) as SubmitKybInformationResponse)
        },
        kybInput
      );
      actor.start();

      await waitFor(actor, s => s.matches("FillingKybForm"));
      actor.send({ data: kybFormData, type: "SUBMIT_KYB_FORM" });

      await waitFor(actor, s => s.matches("Failure"));
      expect(actor.getSnapshot().context.error?.message).toContain("did not return a submission ID");
    });

    it("fails when no related person ids can be extracted", async () => {
      const actor = createTestActor(
        {
          checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Consulted)),
          findKybCustomerAndBusiness: fromPromise(async () => [] as AlfredpayKybCustomerAndBusiness[]),
          submitKybBusinessFiles: fromPromise<void, AlfredpayKycContext>(async () => undefined),
          submitKybInfo: fromPromise(async () => ({ submissionId: "kyb-sub-1" }) as SubmitKybInformationResponse)
        },
        kybInput
      );
      actor.start();

      await waitFor(actor, s => s.matches("FillingKybForm"));
      actor.send({ data: kybFormData, type: "SUBMIT_KYB_FORM" });
      await waitFor(actor, s => s.matches("UploadingKybBusinessDocs"));
      actor.send({ files: kybBusinessFiles, type: "SUBMIT_KYB_BUSINESS_FILES" });

      await waitFor(actor, s => s.matches("Failure"));
      expect(actor.getSnapshot().context.error?.message).toContain("did not return relatedPersons[].idRelatedPerson");
    });

    // NOTE: documents current behavior — for country AR with business=true, CheckingStatus routes to the
    // *individual* KYC form (FillingKycForm) because its business guard only covers MX/CO, while
    // CreatingCustomer and Retrying include AR in their business guards. This inconsistency looks unintended.
    it("AR business customers are routed to the individual KYC form from CheckingStatus", async () => {
      const actor = createTestActor(
        {
          checkStatus: fromPromise(async () => statusOf(AlfredPayStatus.Consulted))
        },
        { ...baseInput, business: true, country: "AR" }
      );
      actor.start();

      await waitFor(actor, s => s.matches("FillingKycForm"));
    });
  });
});
